import {
  isAgreedPastPayToBookDeadline,
  isAgreedPastPaymentDeadline,
  isBookedPastCompletionDeadline,
  isCompletedPastAutoReleaseDeadline,
} from "@/lib/jobs/constants";
import type { JobRecord } from "@/lib/jobs/types";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { memory } from "./constants";
import { rowToJob, nowIso } from "./mappers";
import { persist } from "./cache";

async function maybeExpire(job: JobRecord): Promise<JobRecord> {
  // 1) Negotiation timer only after pro "I can fix this" armed the clock
  if (job.status === "negotiating") {
    const { isNegotiationTimerArmed } = await import("@/lib/jobs/constants");
    if (!isNegotiationTimerArmed(job)) return job;
    if (Date.now() <= new Date(job.negotiateEndsAt).getTime()) return job;
    const { applyEvent } = await import("./transitions");
    return applyEvent(job, { type: "EXPIRE_NEGOTIATION" }, "system");
  }

  // 1b) Agreed, never tapped Pay, 30 minutes elapsed → expired
  if (isAgreedPastPayToBookDeadline(job)) {
    return expireUnpaidBook(job);
  }

  // 2) Open pay session past 11 min unpaid → count 1 attempt; after 3 → cancel
  if (isAgreedPastPaymentDeadline(job)) {
    return expireOpenPaymentWindow(job);
  }

  // 3) Booked but not completed within 6h of payment → cancel + full refund
  if (isBookedPastCompletionDeadline(job)) {
    try {
      const { applyEvent } = await import("./transitions");
      return await applyEvent(job, { type: "CANCEL", by: "system" }, "system");
    } catch (e) {
      console.error("auto-cancel booked job failed", job.id, e);
      return job;
    }
  }

  // 4) Completed > 6h without satisfaction or dispute → auto-release 95/5.
  // On Flutterwave failure: keep escrow held, stay completed, retry later.
  if (isCompletedPastAutoReleaseDeadline(job)) {
    // Skip rapid retries when last Flutterwave payout failed
    try {
      const { getEscrowByRequest } =
        await import("@/lib/server/payments/escrow-store");
      const esc = await getEscrowByRequest(job.id);
      const lastAt = String(
        (esc?.meta as { lastReleaseAt?: string } | undefined)?.lastReleaseAt ||
          "",
      );
      if (lastAt) {
        const age = Date.now() - new Date(lastAt).getTime();
        // Don't hammer Flutterwave every poll wait 15 min between auto attempts
        if (Number.isFinite(age) && age < 15 * 60 * 1000) {
          return job;
        }
      }
    } catch {
      /* continue to attempt */
    }
    try {
      const { applyEvent } = await import("./transitions");
      let next = await applyEvent(job, { type: "SATISFIED" }, "system");
      // applyEvent(SATISFIED) already releases; if still satisfied, force RELEASE
      if (next.status === "satisfied") {
        next = await applyEvent(next, { type: "RELEASE" }, "system");
      }
      return next;
    } catch (e) {
      // Keep status=completed + escrow held; expire-stale / customer Release retries
      console.error(
        "auto-release completed job failed (will retry)",
        job.id,
        e,
      );
      return job;
    }
  }

  return job;
}

async function expireOpenPaymentWindow(job: JobRecord): Promise<JobRecord> {
  const { PAY_HISTORY, paymentWindowsExpiredCount, MAX_PAYMENT_ATTEMPTS } =
    await import("@/lib/jobs/constants");
  const ts = nowIso();
  const last = [...(job.statusHistory || [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )[0];
  if (last?.by === PAY_HISTORY.WINDOW_EXPIRED) {
    const { supersedePendingPaymentsForRequest } =
      await import("@/lib/server/payments/escrow-store");
    try {
      await supersedePendingPaymentsForRequest(job.id, null, "payment_window_20m");
    } catch (e) {
      console.error("expirePendingPaymentForJob", job.id, e);
    }
    return job;
  }

  const { supersedePendingPaymentsForRequest } =
    await import("@/lib/server/payments/escrow-store");
  try {
    await supersedePendingPaymentsForRequest(job.id, null, "payment_window_20m");
  } catch (e) {
    console.error("expirePendingPaymentForJob", job.id, e);
  }

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
          updatedAt: ts,
        });
      }
    } catch (e) {
      console.error("auto-cancel max payment attempts failed", job.id, e);
    }
    try {
      const { refundJobEscrow } = await import("./payments");
      await refundJobEscrow(cancelled);
    } catch {
      /* push best-effort */
    }
    return cancelled;
  }

  return persist({
    ...job,
    statusHistory: nextHistory,
    paymentAttemptCount: attempts,
    paymentSessionEndsAt: null,
    updatedAt: ts,
  });
}

async function expireUnpaidBook(job: JobRecord): Promise<JobRecord> {
  const { PAY_HISTORY } = await import("@/lib/jobs/constants");
  if (job.statusHistory?.some((h) => h.by === PAY_HISTORY.UNPAID_BOOK_EXPIRE)) {
    return job;
  }
  const { supersedePendingPaymentsForRequest } =
    await import("@/lib/server/payments/escrow-store");
  try {
    await supersedePendingPaymentsForRequest(job.id, null, "payment_window_20m");
  } catch (e) {
    console.error("expirePendingPaymentForJob", job.id, e);
  }
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
  try {
    const title = "Request expired";
    const body =
      "Payment to book was not made within 30 minutes. This request is expired.";
    const { insertNotification } = await import("@/lib/server/notifications");
    const { sendPushToUser } = await import("@/lib/server/push/webpush");
    const targets = [next.motoristId, next.repairProId].filter(Boolean);
    for (const userId of targets) {
      const isPro = userId === next.repairProId;
      await insertNotification({
        userId,
        category: "payments",
        priority: "high",
        title,
        body,
        href: isPro ? `/jobs/${next.id}` : `/jobs/${next.id}`,
        actionType: "open_job",
        actionPayload: { jobId: next.id },
        jobId: next.id,
        jobStatus: "expired",
        groupKey: `unpaid-book-expire-${isPro ? "pro" : "cust"}-${next.id}`,
      });
      try {
        await sendPushToUser(userId, {
          title,
          body,
          url: isPro ? "/dashboard" : "/",
          tag: `unpaid-book-expire-${next.id}`,
        });
      } catch {
        /* push best-effort */
      }
    }
  } catch {
    /* notifications optional */
  }
  return next;
}

/**
 * Batch sweep for:
 * - Agreed unpaid past 20 min payment window → expire pending payment
 * - Booked not completed within 6h of payment → cancel + refund
 * - Completed past 6h without satisfaction/dispute → auto-release 95/5
 * Safe for cron / client backup.
 */
export async function expireOverdueBookedJobs(limit = 40): Promise<{
  checked: number;
  cancelled: number;
  released: number;
  ids: string[];
}> {
  const ids: string[] = [];
  let checked = 0;
  let cancelled = 0;
  let released = 0;
  const statuses = [
    "agreed",
    "paid_booked",
    "en_route",
    "arrived",
    "in_progress",
    "completed",
  ] as const;

  // Memory first
  for (const j of memory.values()) {
    if (
      !isAgreedPastPayToBookDeadline(j) &&
      !isAgreedPastPaymentDeadline(j) &&
      !isBookedPastCompletionDeadline(j) &&
      !isCompletedPastAutoReleaseDeadline(j)
    ) {
      continue;
    }
    checked += 1;
    const prev = j.status;
    const next = await maybeExpire(j);
    if (
      next.status === "cancelled" ||
      next.status === "expired" ||
      next.escrowStatus === "refunded"
    ) {
      cancelled += 1;
      ids.push(next.id);
    } else if (
      (prev === "completed" || prev === "satisfied") &&
      next.status === "released"
    ) {
      released += 1;
      ids.push(next.id);
    } else if (prev === "agreed" && next.status === "agreed") {
      // payment expired in place
      if (!ids.includes(next.id)) ids.push(next.id);
    }
  }

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("service_requests")
        .select("*")
        .in("flow_status", [...statuses])
        .order("updated_at", { ascending: true })
        .limit(limit);
      for (const row of data || []) {
        const job = rowToJob(row as Record<string, unknown>);
        if (
          !isAgreedPastPayToBookDeadline(job) &&
          !isAgreedPastPaymentDeadline(job) &&
          !isBookedPastCompletionDeadline(job) &&
          !isCompletedPastAutoReleaseDeadline(job)
        ) {
          continue;
        }
        checked += 1;
        const prev = job.status;
        const next = await maybeExpire(job);
        if (
          next.status === "cancelled" ||
          next.status === "expired" ||
          next.status === "refunded"
        ) {
          cancelled += 1;
          if (!ids.includes(next.id)) ids.push(next.id);
        } else if (
          (prev === "completed" || prev === "satisfied") &&
          next.status === "released"
        ) {
          released += 1;
          if (!ids.includes(next.id)) ids.push(next.id);
        } else if (prev === "agreed") {
          if (!ids.includes(next.id)) ids.push(next.id);
        }
      }
    } catch (e) {
      console.error("expireOverdueBookedJobs", e);
    }
  }

  return { checked, cancelled, released, ids };
}

export { maybeExpire };
