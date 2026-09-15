import {
  MAX_PAYMENT_ATTEMPTS,
  PAY_HISTORY,
  PAYMENT_WINDOW_MS,
  paymentWindowsExpiredCount,
  PLATFORM_FEE_PERCENT,
} from "@/lib/jobs/constants";
import type {
  JobFlowStatus,
  JobRecord,
} from "@/lib/jobs/types";
import { toMinorUnits, type AppCurrency } from "@/lib/pricing";
import {
  createEscrowPayment,
  getEscrowByRef,
  getEscrowByRequest,
  supersedePendingPaymentsForRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { initCharge, verifyCharge } from "@/lib/server/payments/providers";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { nowIso, splitMinor, uid } from "./mappers";
import { cacheJob, persist } from "./cache";
import { getJob, getJobRaw } from "./reads";

async function expirePendingPaymentForJob(
  job: JobRecord,
  reason = "payment_window_20m",
): Promise<void> {
  try {
    await supersedePendingPaymentsForRequest(job.id, null, reason);
  } catch (e) {
    console.error("expirePendingPaymentForJob", job.id, e);
  }
}

/**
 * Customer closed / cancelled Flutterwave without paying.
 * Does NOT count as a 20‑min attempt. Clears open session so the next Pay
 * starts a fresh 20‑minute timer.
 */
export async function cancelOpenPaymentSession(input: {
  jobId: string;
  motoristId?: string | null;
}): Promise<{ job: JobRecord; timerReset: true } | { error: string }> {
  let job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  const mid = (input.motoristId || "").trim();
  // Allow unauthenticated timer reset from FLW cancel callback (no money moved)
  if (mid && mid !== "callback" && mid !== "system" && job.motoristId !== mid) {
    return { error: "Only the customer on this job can cancel payment." };
  }
  if (job.status !== "agreed") {
    // Already moved on nothing to reset
    return { job, timerReset: true };
  }

  await expirePendingPaymentForJob(job, "customer_cancelled_checkout");

  const ts = nowIso();
  const last = [...(job.statusHistory || [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )[0];
  // Avoid stacking cancel markers if they spam close
  const history =
    last?.by === PAY_HISTORY.SESSION_CANCELLED
      ? job.statusHistory
      : [
          ...job.statusHistory,
          {
            status: "agreed" as const,
            at: ts,
            by: PAY_HISTORY.SESSION_CANCELLED,
          },
        ];

  job = await persist({
    ...job,
    status: "agreed",
    statusHistory: history,
    paymentSessionEndsAt: null,
    paymentReference: null,
    updatedAt: ts,
  });
  return { job, timerReset: true };
}

/**
 * Unpaid 20‑min window closed.
 * - Counts as 1 payment attempt (only full window expiry counts).
 * - Attempts 1-2: stay agreed, user can Pay again.
 * - Attempt 3: cancel job, notify both sides, refund if any hold.
 */
async function expireOpenPaymentWindow(job: JobRecord): Promise<JobRecord> {
  const ts = nowIso();
  // Idempotent: already recorded this window
  const last = [...(job.statusHistory || [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )[0];
  if (last?.by === PAY_HISTORY.WINDOW_EXPIRED) {
    // Already counted; ensure pending charge is expired
    await expirePendingPaymentForJob(job);
    return job;
  }

  await expirePendingPaymentForJob(job);

  const nextHistory = [
    ...job.statusHistory,
    {
      status: "agreed" as const,
      at: ts,
      by: PAY_HISTORY.WINDOW_EXPIRED,
    },
  ];
  const attempts = paymentWindowsExpiredCount({
    statusHistory: nextHistory,
  });

  if (attempts >= MAX_PAYMENT_ATTEMPTS) {
    // Final cancel + refund any held funds + notify both
    let cancelled: JobRecord = {
      ...job,
      statusHistory: [
        ...nextHistory,
        {
          status: "cancelled",
          at: ts,
          by: PAY_HISTORY.MAX_ATTEMPTS_CANCEL,
        },
      ],
      paymentAttemptCount: attempts,
      paymentSessionEndsAt: null,
      updatedAt: ts,
    };
    try {
      const { applyEvent } = await import("./transitions");
      cancelled = await applyEvent(
        {
          ...job,
          statusHistory: nextHistory,
          paymentAttemptCount: attempts,
        },
        { type: "CANCEL", by: "system" },
        "system",
      );
      // Ensure history marker survives cancel
      if (
        !cancelled.statusHistory.some(
          (h) => h.by === PAY_HISTORY.MAX_ATTEMPTS_CANCEL,
        )
      ) {
        cancelled = await persist({
          ...cancelled,
          statusHistory: [
            ...cancelled.statusHistory,
            {
              status: "cancelled",
              at: ts,
              by: PAY_HISTORY.MAX_ATTEMPTS_CANCEL,
            },
          ],
          paymentAttemptCount: attempts,
          paymentSessionEndsAt: null,
        });
      }
    } catch (e) {
      console.error("payment max attempts cancel failed", job.id, e);
      cancelled = await persist({
        ...job,
        status: "cancelled",
        cancelledAt: ts,
        statusHistory: nextHistory,
        paymentAttemptCount: attempts,
        paymentSessionEndsAt: null,
        updatedAt: ts,
      });
      await refundJobEscrow(cancelled).catch(() => undefined);
    }

    try {
      if (job.repairProId) {
        const { insertNotification } =
          await import("@/lib/server/notifications");
        const body = `Payment was not completed within ${MAX_PAYMENT_ATTEMPTS} timed windows (20 min each). This booking is cancelled.`;
        await insertNotification({
          userId: job.repairProId,
          category: "payments",
          priority: "high",
          title: "Booking cancelled customer did not pay",
          body,
          href: `/requests/${job.id}`,
          actionType: "open_job",
          actionPayload: { jobId: job.id },
          jobId: job.id,
          jobStatus: "cancelled",
          groupKey: `pay-cancel-pro-${job.id}`,
        });
      }
    } catch {
      /* notifications optional */
    }
    return cancelled;
  }

  // Stay agreed no open session until customer taps Pay again
  return persist({
    ...job,
    status: "agreed",
    statusHistory: nextHistory,
    paymentAttemptCount: attempts,
    paymentSessionEndsAt: null,
    paymentReference: null,
    updatedAt: ts,
  });
}

async function notifyUnpaidBookExpired(job: JobRecord) {
  const title = "Request expired";
  const body =
    "Payment to book was not made within 30 minutes. This request is expired.";
  try {
    const { insertNotification } = await import("@/lib/server/notifications");
    const { sendPushToUser } = await import("@/lib/server/push/webpush");
    const targets = [job.motoristId, job.repairProId].filter(Boolean);
    for (const userId of targets) {
      const isPro = userId === job.repairProId;
      await insertNotification({
        userId,
        category: "payments",
        priority: "high",
        title,
        body,
        href: isPro ? `/jobs/${job.id}` : `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "expired",
        groupKey: `unpaid-book-expire-${isPro ? "pro" : "cust"}-${job.id}`,
      });
      try {
        await sendPushToUser(userId, {
          title,
          body,
          url: isPro ? "/dashboard" : "/",
          tag: `unpaid-book-expire-${job.id}`,
        });
      } catch {
        /* push best-effort */
      }
    }
  } catch {
    /* notifications optional */
  }
}

async function expireUnpaidBook(job: JobRecord): Promise<JobRecord> {
  if (job.statusHistory?.some((h) => h.by === PAY_HISTORY.UNPAID_BOOK_EXPIRE)) {
    return job;
  }
  await expirePendingPaymentForJob(job);
  const ts = nowIso();
  let next: JobRecord;
  try {
    const { applyEvent } = await import("./transitions");
    next = await applyEvent(job, { type: "EXPIRE_UNPAID_BOOK" }, "system");
  } catch (e) {
    console.error("expire unpaid book failed", job.id, e);
    next = await persist({
      ...job,
      status: "expired",
      paymentSessionEndsAt: null,
      updatedAt: ts,
      statusHistory: [
        ...job.statusHistory,
        { status: "expired", at: ts, by: PAY_HISTORY.UNPAID_BOOK_EXPIRE },
      ],
    });
  }
  if (
    !next.statusHistory.some((h) => h.by === PAY_HISTORY.UNPAID_BOOK_EXPIRE)
  ) {
    next = await persist({
      ...next,
      statusHistory: [
        ...next.statusHistory,
        { status: "expired", at: ts, by: PAY_HISTORY.UNPAID_BOOK_EXPIRE },
      ],
    });
  }
  await notifyUnpaidBookExpired(next);
  return next;
}

export async function refundJobEscrow(job: JobRecord) {
  const esc = await getEscrowByRequest(job.id);
  if (esc) {
    await updateEscrow(esc.id, {
      status: "refunded",
      escrowStatus: "refunded",
      refundedAt: nowIso(),
    });
  }
}

/**
 * Pay Repair Pro 87.5% of service via Flutterwave Transfer from merchant balance.
 * Ona keeps 5%. Collections (Ledger) ≠ Available for payout settlement delays
 * become PENDING_SETTLEMENT with auto-retry (never double-pay).
 */
export async function releaseJobEscrow(job: JobRecord): Promise<{
  ok: boolean;
  pendingSettlement?: boolean;
  message?: string;
  transferRef?: string;
  totalMinor?: number;
  proPayoutMinor?: number;
  platformFeeMinor?: number;
}> {
  // Auto-heal pending payment → held when FLW already settled collection
  const esc = await getEscrowByRequest(job.id);
  if (
    esc?.providerRef &&
    (esc.escrowStatus === "pending_payment" ||
      esc.escrowStatus === "none" ||
      esc.escrowStatus === "failed" ||
      esc.status === "pending" ||
      esc.status === "failed")
  ) {
    try {
      const verified = await verifyCharge(
        esc.providerRef,
        String(esc.provider),
      );
      if (verified.success) {
        await updateEscrow(esc.id, {
          status: "paid",
          escrowStatus: "held",
          paidAt: verified.paidAt || nowIso(),
          providerChannel: verified.channel || null,
        });
        if (job.status === "agreed") {
          await markJobPaidFromReference(esc.providerRef);
        }
      }
    } catch (e) {
      console.error("releaseJobEscrow auto-verify", job.id, e);
    }
  }

  const { attemptProPayout } =
    await import("@/lib/server/payments/payout-settlement");
  const result = await attemptProPayout({
    jobId: job.id,
    repairProId: job.repairProId,
    repairProName: job.repairProName,
    amountMinor: job.amountMinor,
    agreedMajor: job.agreedMajor,
    currency: job.currency,
    paymentReference: job.paymentReference,
    // First release after "I'm Satisfied" may run immediately (no prior nextRetryAt).
    // Later auto-retries use processDuePayoutRetries with force:false (10‑min spacing).
    force: false,
  });

  if (result.ok) {
    return {
      ok: true,
      transferRef: result.transferRef,
      totalMinor: result.totalMinor,
      proPayoutMinor: result.proPayoutMinor,
      platformFeeMinor: result.platformFeeMinor,
    };
  }
  if (result.pendingSettlement) {
    return {
      ok: false,
      pendingSettlement: true,
      message: result.message,
      totalMinor: result.totalMinor,
      proPayoutMinor: result.proPayoutMinor,
      platformFeeMinor: result.platformFeeMinor,
    };
  }
  return {
    ok: false,
    pendingSettlement: false,
    message: result.message,
    totalMinor: result.totalMinor,
    proPayoutMinor: result.proPayoutMinor,
    platformFeeMinor: result.platformFeeMinor,
  };
}

async function loadProPayoutBank(repairProId: string): Promise<{
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
}> {
  if (!repairProId || !isSupabaseAdminConfigured()) {
    return { bankCode: null, accountNumber: null, accountName: null };
  }
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("bank_code, bank_account_number, bank_account_name, bank_name")
      .eq("user_id", repairProId)
      .maybeSingle();
    if (!data) {
      return { bankCode: null, accountNumber: null, accountName: null };
    }
    return {
      bankCode: (data.bank_code as string) || null,
      accountNumber: (data.bank_account_number as string) || null,
      accountName:
        (data.bank_account_name as string) ||
        (data.bank_name as string) ||
        null,
    };
  } catch {
    return { bankCode: null, accountNumber: null, accountName: null };
  }
}

export async function mockPayJob(input: {
  jobId: string;
  motoristId: string;
  email?: string;
}): Promise<{ job: JobRecord; reference: string } | { error: string }> {
  const job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  if (job.status !== "agreed") {
    return { error: "Job must be in Agreed status before payment." };
  }
  if (job.agreedMajor == null) {
    return { error: "No agreed price." };
  }

  const { getCalloutQuote } = await import("@/lib/server/callout/store");
  const { lockCalloutQuote } = await import("@/lib/server/callout/quote");
  const { composeCustomerPayableMajor } = await import("@/lib/callout/payable");
  let mockQuote = await getCalloutQuote(job.id);
  if (mockQuote?.calloutStatus === "CALCULATED") {
    mockQuote = (await lockCalloutQuote(job.id)) ?? mockQuote;
  }
  if (!mockQuote || mockQuote.calloutStatus === "PENDING") {
    const { estimateCalloutQuote } =
      await import("@/lib/server/callout/estimate");
    mockQuote = (await estimateCalloutQuote(job, mockQuote)) ?? mockQuote;
  }
  const mockPayable = composeCustomerPayableMajor(job.agreedMajor, mockQuote);
  const mockLabourMinor = toMinorUnits(job.agreedMajor, job.currency);
  const amountMinor = toMinorUnits(mockPayable.totalMajor, job.currency);
  const mockSplit = splitMinor(amountMinor);
  const calloutMinor = toMinorUnits(mockPayable.calloutMajor, job.currency);
  const split = {
    ...mockSplit,
    proPayoutMinor: mockSplit.proPayoutMinor + calloutMinor,
  };
  const reference = `mock_${job.id.slice(0, 10)}_${Date.now().toString(36)}`;

  const payment = await createEscrowPayment({
    requestId: job.id,
    motoristId: job.motoristId,
    repairProId: job.repairProId,
    amountMinor,
    baseAmountMinor: toMinorUnits(
      job.proBaseMajor ?? job.agreedMajor,
      job.currency,
    ),
    discountPercent: 0,
    platformFeeMinor: split.platformFeeMinor,
    proPayoutMinor: split.proPayoutMinor,
    currency: job.currency,
    provider: "mock",
    providerRef: reference,
    serviceType: job.serviceType,
    meta: {
      mock: true,
      email: input.email,
      labourMinor: mockLabourMinor,
      calloutMinor,
      calloutMajor: mockPayable.calloutMajor,
      vatMinor: split.vatMinor,
      vatHeldOnFlutterwave: true,
      settlementModel: "service_only_v2",
    },
  });

  await updateEscrow(payment.id, {
    status: "held",
    escrowStatus: "held",
    paidAt: nowIso(),
  });

  let updated: JobRecord = {
    ...job,
    paymentId: payment.id,
    paymentReference: reference,
    amountMinor,
    platformFeeMinor: split.platformFeeMinor,
    proPayoutMinor: split.proPayoutMinor,
    escrowStatus: "held",
  };
  const { applyEvent } = await import("./transitions");
  updated = await applyEvent(updated, { type: "PAYMENT_SUCCESS" }, "system");
  return { job: updated, reference };
}

/**
 * Start real Flutterwave (or configured provider) escrow charge for a job.
 * Flutterwave default: Inline-ready session (no forced full-page leave).
 * Hosted authorizationUrl is still returned as fallback when gateway creates one.
 * Job becomes Booked only after verify + markJobPaidFromReference.
 */
export async function startJobEscrowPayment(input: {
  jobId: string;
  motoristId: string;
  email: string;
  customerName?: string | null;
  customerPhone?: string | null;
  callbackUrl: string;
  provider?: string | null;
  /** Prefer in-app Inline (no separate page). Default true for Flutterwave. */
  preferInline?: boolean;
}): Promise<
  | {
      authorizationUrl: string;
      reference: string;
      provider: string;
      jobId: string;
      paymentSessionEndsAt: string;
      paymentAttemptCount: number;
      paymentAttemptsRemaining: number;
      /** @deprecated use useInAppBankTransfer */
      useInline: boolean;
      /** Show bank details inside Ona (no FLW page / tab) */
      useInAppBankTransfer: boolean;
      bankTransfer:
        | import("@/lib/server/payments/providers").BankTransferInstructions
        | null;
      amountMajor: number;
      currency: AppCurrency;
    }
  | { error: string }
> {
  let job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  if (job.motoristId !== input.motoristId) {
    return { error: "Only the customer on this job can pay." };
  }
  // Reconcile first user may have already paid on Flutterwave
  job = await reconcileJobPayment(job);
  if (
    job.status === "paid_booked" ||
    job.status === "en_route" ||
    job.status === "arrived" ||
    job.status === "in_progress" ||
    job.status === "completed" ||
    job.status === "satisfied" ||
    job.status === "released"
  ) {
    return {
      error: "ALREADY_PAID",
      jobId: job.id,
    } as { error: string; jobId: string };
  }
  if (job.agreedMajor == null || job.agreedMajor <= 0) {
    return { error: "No agreed price." };
  }
  const agreedMajor = Number(job.agreedMajor);

  /**
   * Pay again / re-open: if pay window left the job cancelled or expired
   * but labour was already agreed and nothing is held in escrow, restore
   * status → agreed so a new Flutterwave session can be created.
   */
  // Hard stop: already used 3 unpaid windows
  if (paymentWindowsExpiredCount(job) >= MAX_PAYMENT_ATTEMPTS) {
    return {
      error:
        "Payment attempts exhausted (3 × 20 min). This booking was cancelled. Start a new request if you still need help.",
    };
  }

  if (job.status !== "agreed") {
    // Only reopen soft cancels that were NOT max-attempt payment cancels
    const maxCancel = job.statusHistory?.some(
      (h) => h.by === PAY_HISTORY.MAX_ATTEMPTS_CANCEL,
    );
    const canReopen =
      !maxCancel &&
      (job.status === "cancelled" || job.status === "expired") &&
      job.escrowStatus !== "held" &&
      job.escrowStatus !== "released" &&
      job.escrowStatus !== "release_pending";
    if (!canReopen) {
      return {
        error: `Job must be in Agreed status before payment (currently ${job.status}).`,
      };
    }
    const ts = nowIso();
    job = await persist({
      ...job,
      status: "agreed",
      agreedMajor,
      cancelledAt: null,
      updatedAt: ts,
      statusHistory: [
        ...job.statusHistory,
        { status: "agreed", at: ts, by: "system" },
      ],
    });
  }

  // Expire any previous pending charge so a fresh Flutterwave session can open
  await expirePendingPaymentForJob(job);

  // Nigeria-first: force NGN for Flutterwave escrow collections
  const payCurrency: AppCurrency =
    job.currency === "NGN" || !job.currency ? "NGN" : job.currency;
  // Ona primary market never charge Nigerian jobs in GBP/USD
  const currency: AppCurrency =
    process.env.FLUTTERWAVE_FORCE_NGN === "false" ? payCurrency : "NGN";

  // Customer pays service charge S only. Split: pro 87.5% · Ona 5% · VAT 7.5% on FLW.
  // FLW collection + payout fees come from Ona's 5% only (Ona absorbs if fees > 5%).
  // Call-out is a separate line: added to collection and to pro payout, not split.
  const { buildCustomerChargeMajor } = await import("@/lib/pricing");
  const { getCalloutQuote } = await import("@/lib/server/callout/store");
  const { attachCalloutToRequest, lockCalloutQuote } =
    await import("@/lib/server/callout/quote");
  const { composeCustomerPayableMajor } = await import("@/lib/callout/payable");
  let calloutQuote = await getCalloutQuote(job.id);
  if (!calloutQuote || calloutQuote.calloutStatus === "PENDING") {
    try {
      await attachCalloutToRequest({
        requestId: job.id,
        problem: job.problem,
        selectedTrade: job.serviceType,
        destination: job.motoristLocation,
        origin: job.proLocation,
        proId: job.repairProId,
      });
      calloutQuote = await getCalloutQuote(job.id);
    } catch {
      /* optional */
    }
  }
  if (calloutQuote?.calloutStatus === "CALCULATED") {
    calloutQuote = (await lockCalloutQuote(job.id)) ?? calloutQuote;
  }
  if (!calloutQuote || calloutQuote.calloutStatus === "PENDING") {
    const { estimateCalloutQuote } =
      await import("@/lib/server/callout/estimate");
    calloutQuote =
      (await estimateCalloutQuote(job, calloutQuote)) ?? calloutQuote;
  }
  const pricing = buildCustomerChargeMajor(agreedMajor);
  const payable = composeCustomerPayableMajor(pricing.totalMajor, calloutQuote);
  const amountMinor = toMinorUnits(payable.totalMajor, currency);
  const labourMinor = toMinorUnits(pricing.labourMajor, currency);
  const calloutMinor = toMinorUnits(payable.calloutMajor, currency);
  const platformFeeMinor = toMinorUnits(pricing.platformFeeMajor, currency);
  const vatMinor = toMinorUnits(pricing.vatMajor, currency);
  const proPayoutMinor =
    toMinorUnits(pricing.proPayoutMajor, currency) + calloutMinor;
  const split = { platformFeeMinor, proPayoutMinor, vatMinor };
  const reference = `ona_${job.id.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
  const sessionEndsAt = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();

  let motoristBankCode: string | null = null;
  let proBankCode: string | null = null;
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const [mot, pro] = await Promise.all([
        sb
          .from("motorist_profiles")
          .select("bank_code")
          .eq("user_id", job.motoristId)
          .maybeSingle(),
        sb
          .from("repair_pro_profiles")
          .select("bank_code")
          .eq("user_id", job.repairProId)
          .maybeSingle(),
      ]);
      motoristBankCode = (mot.data?.bank_code as string) || null;
      proBankCode = (pro.data?.bank_code as string) || null;
    } catch {
      /* optional meta */
    }
  }

  try {
    // Include ref on callback so verify works even if Flutterwave omits query params
    const callbackUrl = input.callbackUrl.includes("ref=")
      ? input.callbackUrl
      : `${input.callbackUrl}${input.callbackUrl.includes("?") ? "&" : "?"}ref=${encodeURIComponent(reference)}`;

    const resolvedProvider = input.provider || "flutterwave";
    const preferInApp =
      input.preferInline !== false &&
      resolvedProvider !== "mock" &&
      (resolvedProvider === "flutterwave" || !resolvedProvider);

    /**
     * In-app bank transfer (default for Flutterwave):
     * Server creates a VA via charges?type=bank_transfer and returns account
     * details for the Ona UI. Never opens Flutterwave.com (no new tab / 503).
     */
    let charge: {
      provider: string;
      authorizationUrl: string;
      reference: string;
    };
    let bankTransfer:
      | import("@/lib/server/payments/providers").BankTransferInstructions
      | null = null;

    if (preferInApp) {
      const { createFlutterwaveBankTransfer } =
        await import("@/lib/server/payments/providers");
      // Full pro name for customer note only NOT the bank account name.
      // Money is paid into Ona escrow (FLW VA), not the pro's personal bank.
      const proLabel = (job.repairProName || "").trim() || "your Repair Pro";
      const shortNarration = `Ona escrow · ${proLabel}`.slice(0, 80);
      const customerNote = `For ${proLabel}. Pay into Ona escrow (account below). Funds are released after the job is confirmed. Transfer the exact amount only.`;
      const va = await createFlutterwaveBankTransfer({
        amountMajor: payable.totalMajor,
        currency,
        email: input.email,
        customerName: input.customerName || job.motoristName || null,
        customerPhone: input.customerPhone || job.motoristPhone || null,
        reference,
        // Short bank-statement narration never a long "Please transfer to …"
        narration: shortNarration,
        transferNote: customerNote,
        // Display name for account holder field (escrow merchant brand)
        accountDisplayName: "Ona",
      });
      if (!va.ok) {
        return { error: va.error };
      }
      bankTransfer = {
        ...va.instructions,
        // Always show brand as account name if FLW returned junk/narration
        accountName:
          va.instructions.accountName &&
          !/please|transfer to|make a bank/i.test(va.instructions.accountName)
            ? va.instructions.accountName
            : "Ona",
        note: customerNote,
      };
      charge = {
        provider: "flutterwave",
        authorizationUrl: "",
        reference,
      };
    } else if (resolvedProvider === "mock") {
      charge = await initCharge(
        {
          amountMinor,
          currency,
          email: input.email,
          customerName: input.customerName || job.motoristName || null,
          customerPhone: input.customerPhone || job.motoristPhone || null,
          reference,
          callbackUrl,
          platformFeePercent: PLATFORM_FEE_PERCENT,
          channels: ["bank_transfer"],
          metadata: { requestId: job.id, jobId: job.id },
        },
        "mock",
      );
    } else {
      charge = await initCharge(
        {
          amountMinor,
          currency,
          email: input.email,
          customerName: input.customerName || job.motoristName || null,
          customerPhone: input.customerPhone || job.motoristPhone || null,
          reference,
          callbackUrl,
          platformFeePercent: PLATFORM_FEE_PERCENT,
          channels: ["bank_transfer"],
          metadata: {
            requestId: job.id,
            jobId: job.id,
            motoristId: job.motoristId,
            repairProId: job.repairProId,
            serviceType: job.serviceType,
            labourOnly: true,
            motoristBankCode,
            proBankCode,
            paymentSessionEndsAt: sessionEndsAt,
          },
        },
        input.provider,
      );
    }

    await createEscrowPayment({
      requestId: job.id,
      motoristId: job.motoristId,
      repairProId: job.repairProId,
      amountMinor,
      baseAmountMinor: toMinorUnits(job.proBaseMajor ?? agreedMajor, currency),
      discountPercent: 0,
      platformFeeMinor: split.platformFeeMinor,
      proPayoutMinor: split.proPayoutMinor,
      currency,
      provider: charge.provider,
      providerRef: charge.reference,
      serviceType: job.serviceType,
      meta: {
        labourOnly: calloutMinor <= 0,
        labourMajor: pricing.labourMajor,
        labourMinor,
        calloutMajor: payable.calloutMajor,
        calloutMinor,
        /** Ona 5% of S (gross before FLW fees) settles to Zenith / platform subaccount */
        platformFeeMajor: pricing.platformFeeMajor,
        platformFeeMinor,
        /** VAT 7.5% of S stays on Flutterwave main balance */
        vatMajor: pricing.vatMajor,
        vatMinor,
        vatHeldOnFlutterwave: true,
        chargeTotalMajor: payable.totalMajor,
        /** Pro net 87.5% of labour + 100% of call-out */
        proPayoutMajor: pricing.proPayoutMajor + payable.calloutMajor,
        proPayoutMinor,
        settlementModel: "service_only_v2",
        platformSubaccount: process.env.FLUTTERWAVE_PLATFORM_SUBACCOUNT || null,
        motoristBankCode,
        proBankCode,
        email: input.email,
        paymentSessionEndsAt: sessionEndsAt,
        paymentWindowMs: PAYMENT_WINDOW_MS,
        checkoutMode: preferInApp ? "in_app_bank_transfer" : "hosted",
        bankTransfer: bankTransfer || undefined,
      },
    });

    // Open a new 20‑min session (does NOT count as an attempt until it expires unpaid)
    const sessionStart = nowIso();
    const refreshed: JobRecord = {
      ...job,
      status: "agreed",
      currency,
      updatedAt: sessionStart,
      statusHistory: [
        ...job.statusHistory,
        {
          status: "agreed",
          at: sessionStart,
          by: PAY_HISTORY.SESSION_START,
        },
      ],
      paymentReference: charge.reference,
      paymentSessionEndsAt: sessionEndsAt,
      paymentAttemptCount: paymentWindowsExpiredCount(job),
    };
    await persist(refreshed);

    return {
      authorizationUrl: charge.authorizationUrl,
      reference: charge.reference,
      provider: charge.provider,
      jobId: job.id,
      paymentSessionEndsAt: sessionEndsAt,
      paymentAttemptCount: paymentWindowsExpiredCount(job),
      paymentAttemptsRemaining: Math.max(
        0,
        MAX_PAYMENT_ATTEMPTS - paymentWindowsExpiredCount(job),
      ),
      useInline: false,
      /** Native in-app bank transfer (preferred) */
      useInAppBankTransfer: Boolean(bankTransfer),
      bankTransfer,
      amountMajor: payable.totalMajor,
      currency,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not start payment",
    };
  }
}

export async function markJobPaidFromReference(
  reference: string,
): Promise<
  | { job: JobRecord; paymentId: string; alreadyBooked?: boolean }
  | { error: string }
> {
  const payment = await getEscrowByRef(reference);
  if (!payment) return { error: "Payment not found for this reference." };

  if (payment.escrowStatus !== "held" && payment.escrowStatus !== "released") {
    await updateEscrow(payment.id, {
      status: "paid",
      escrowStatus: "held",
      paidAt: nowIso(),
    });
  }

  // Use raw load getJob() reconciles payment and would recurse
  const job = await getJobRaw(payment.requestId);
  if (!job) return { error: "Job not found for this payment." };

  if (
    job.status === "paid_booked" ||
    job.status === "en_route" ||
    job.status === "arrived" ||
    job.status === "in_progress" ||
    job.status === "completed" ||
    job.status === "satisfied" ||
    job.status === "released"
  ) {
    return { job, paymentId: payment.id, alreadyBooked: true };
  }

  if (job.status !== "agreed") {
    return {
      error: `Job is ${job.status}; expected agreed before booking payment.`,
    };
  }

  let updated: JobRecord = {
    ...job,
    paymentId: payment.id,
    paymentReference: payment.providerRef || reference,
    amountMinor: payment.amountMinor,
    platformFeeMinor: payment.platformFeeMinor,
    proPayoutMinor: payment.proPayoutMinor,
    escrowStatus: "held",
  };
  try {
    const { applyEvent } = await import("./transitions");
    updated = await applyEvent(updated, { type: "PAYMENT_SUCCESS" }, "system");
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not mark job Booked",
    };
  }
  return { job: updated, paymentId: payment.id };
}

export async function reconcileJobPayment(job: JobRecord): Promise<JobRecord> {
  if (job.status !== "agreed") return job;

  const payment = await getEscrowByRequest(job.id);
  if (!payment?.providerRef) return job;

  // Already held in escrow DB → book the job
  if (
    payment.escrowStatus === "held" ||
    payment.escrowStatus === "released" ||
    payment.status === "paid"
  ) {
    const booked = await markJobPaidFromReference(payment.providerRef);
    if ("job" in booked) return booked.job;
    return job;
  }

  // Pending row but Flutterwave already collected verify live
  if (
    payment.escrowStatus === "pending_payment" ||
    payment.escrowStatus === "none"
  ) {
    try {
      const verified = await verifyCharge(
        payment.providerRef,
        String(payment.provider),
      );
      if (verified.success) {
        await updateEscrow(payment.id, {
          status: "paid",
          escrowStatus: "held",
          paidAt: verified.paidAt || nowIso(),
          providerChannel: verified.channel || null,
        });
        const booked = await markJobPaidFromReference(payment.providerRef);
        if ("job" in booked) return booked.job;
      }
    } catch {
      /* keep agreed until verify succeeds */
    }
  }

  return job;
}
