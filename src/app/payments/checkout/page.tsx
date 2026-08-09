"use client";

/**
 * Checkout shell — bank transfer stays ON this Ona page.
 *
 * HARD RULES:
 *  - Never open Flutterwave.com / new tabs / hosted pay (503 nginx).
 *  - Server creates a Flutterwave VA; we show account + amount in-app.
 *  - Poll until job is booked after customer transfers.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Loader2, Lock, X } from "lucide-react";
import {
  apiCancelPaySession,
  apiGetJob,
  apiPayJob,
  apiTransition,
} from "@/lib/jobs/client";
import {
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_WINDOW_MS,
  paymentAttemptsRemaining,
  paymentEndsAtIso,
  paymentWindowsExpiredCount,
} from "@/lib/jobs/constants";
import type { JobRecord } from "@/lib/jobs/types";
import { logPayGate } from "@/lib/pay-telemetry";
import { windowLeftMs } from "@/lib/jobs/deadline";

/** Very simple pay-window countdown: "Time left · MM:SS". */
function PayTimer({
  deadline,
  onExpire,
}: {
  deadline: string;
  onExpire?: () => void;
}) {
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const [leftMs, setLeftMs] = useState(() => Math.max(0, windowLeftMs(deadline)));

  useEffect(() => {
    const id = window.setInterval(() => {
      const left = Math.max(0, windowLeftMs(deadline));
      setLeftMs(left);
      if (left <= 0) {
        window.clearInterval(id);
        onExpireRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  const secs = Math.ceil(leftMs / 1000);
  const label = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(
    secs % 60
  ).padStart(2, "0")}`;
  const urgent = leftMs <= 15_000;

  return (
    <p
      className={cn(
        "text-[13px] font-bold tabular-nums",
        urgent ? "text-red-500" : "text-[#FF6B35]"
      )}
    >
      Time left · {label}
    </p>
  );
}
import { canEmbedCheckoutInApp } from "@/lib/payments/open-checkout";
import {
  buildCustomerChargeMajor,
  forceNairaCurrency,
  formatMoney,
} from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type BankTransferInfo = {
  accountNumber: string;
  bankName: string;
  accountName: string;
  amountMajor: number;
  currency: string;
  expiresAt: string | null;
  note: string;
  flwRef: string | null;
};

type Phase =
  | "summary"
  | "paying"
  | "bank_pay" // in-app VA details + poll
  | "mock_embed"
  | "error"
  | "expired";
function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const jobId = params.get("jobId") || params.get("job") || "";
  const {
    theme,
    backendUserId,
    userProfile,
    isAuthenticated,
    authReady,
  } = useApp();
  const isLight = theme === "light";

  const [job, setJob] = useState<JobRecord | null>(null);
  const [phase, setPhase] = useState<Phase>("summary");
  const [err, setErr] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busyCancel, setBusyCancel] = useState(false);
  const [sessionEndsAt, setSessionEndsAt] = useState<string | null>(null);
  const [bankPay, setBankPay] = useState<BankTransferInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const actorId =
    backendUserId ||
    userProfile?.identityId ||
    userProfile?.email ||
    "";

  useEffect(() => {
    if (!jobId) {
      setErr("Missing job.");
      setPhase("error");
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await apiGetJob(jobId);
      if (cancelled) return;
      if (!res.ok || !res.data.job) {
        setErr(res.ok ? "Job not found." : res.message);
        setPhase("error");
        return;
      }
      const j = res.data.job;
      setJob(j);
      // Already paid — leave checkout, never show Pay again
      if (
        j.status === "paid_booked" ||
        j.status === "en_route" ||
        j.status === "arrived" ||
        j.status === "in_progress" ||
        j.status === "completed" ||
        j.status === "satisfied" ||
        j.status === "released"
      ) {
        router.replace(`/jobs/${j.id}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, router]);

  // Telemetry: when the Pay button would render disabled after the job loads,
  // log which gate keeps it inert, once per job. This turns "Pay not clicking"
  // into a visible branch in /admin/health + the console.
  const lastPayDisabledLoggedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!job || phase !== "summary" || !authReady || !isAuthenticated) return;
    const payable =
      job.status === "agreed" ||
      ((job.status === "cancelled" || job.status === "expired") &&
        job.agreedMajor != null &&
        job.agreedMajor > 0);
    if (payable) return;
    if (lastPayDisabledLoggedFor.current === job.id) return;
    lastPayDisabledLoggedFor.current = job.id;
    void logPayGate("pay-disabled-render", {
      jobId: job.id,
      status: job.status,
      agreedMajor: job.agreedMajor,
    });
  }, [job, phase, authReady, isAuthenticated]);

  /**
   * While bank-transfer screen is open, poll until booked + re-verify reference.
   */
  useEffect(() => {
    if (phase !== "bank_pay" && phase !== "mock_embed") return;
    if (!jobId) return;
    const poll = window.setInterval(() => {
      void (async () => {
        if (reference) {
          try {
            await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reference,
                jobId,
              }),
            });
          } catch {
            /* keep polling */
          }
        }
        const res = await apiGetJob(jobId);
        if (!res.ok || !res.data.job) return;
        const st = res.data.job.status;
        if (
          st === "paid_booked" ||
          st === "en_route" ||
          st === "arrived" ||
          st === "in_progress"
        ) {
          window.clearInterval(poll);
          router.replace(`/jobs/${jobId}`);
        }
      })();
    }, 4000);
    return () => window.clearInterval(poll);
  }, [phase, jobId, router, reference]);

  const chargeBreakdown = useMemo(() => {
    if (!job?.agreedMajor) return null;
    return buildCustomerChargeMajor(job?.agreedMajor ?? 0);
  }, [job?.agreedMajor]);

  const amountLabel = useMemo(() => {
    if (!chargeBreakdown) return "Not set";
    return formatMoney(
      chargeBreakdown.totalMajor,
      forceNairaCurrency(job?.currency)
    );
  }, [chargeBreakdown, job?.currency]);

  const payEndsAt = useMemo(() => {
    if (sessionEndsAt) return sessionEndsAt;
    if (!job) return null;
    return paymentEndsAtIso(job);
  }, [job, sessionEndsAt]);

  const attemptsUsed = job ? paymentWindowsExpiredCount(job) : 0;
  const attemptsLeft = job
    ? paymentAttemptsRemaining(job)
    : MAX_PAYMENT_ATTEMPTS;
  const hasOpenSession = Boolean(payEndsAt);

  const onPaymentExpired = useCallback(() => {
    setPayUrl(null);
    setReference(null);
    setSessionEndsAt(null);
    setBankPay(null);
    setErr(null);
    setPhase("expired");
    if (jobId) {
      void apiGetJob(jobId).then((res) => {
        if (res.ok && res.data.job) setJob(res.data.job);
      });
      void import("@/lib/jobs/client").then(({ apiExpireStaleBookedJobs }) =>
        apiExpireStaleBookedJobs().catch(() => null)
      );
    }
  }, [jobId]);

  /**
   * Cancel open pay session: does not count as attempt; clears timer so next Pay
   * starts a fresh 20 minutes.
   */
  const resetPayTimerOnCancel = useCallback(async () => {
    setPayUrl(null);
    setReference(null);
    setSessionEndsAt(null);
    setBankPay(null);
    setPhase("summary");
    setErr(null);
    if (!jobId) return;
    const mid =
      (backendUserId && backendUserId.length > 10 ? backendUserId : null) ||
      job?.motoristId ||
      actorId;
    if (!mid || mid === "local-user") return;
    try {
      const res = await apiCancelPaySession({
        jobId,
        motoristId: mid,
      });
      if (res.ok && res.data.job) {
        setJob(res.data.job);
      } else {
        const fresh = await apiGetJob(jobId);
        if (fresh.ok && fresh.data.job) setJob(fresh.data.job);
      }
    } catch {
      const fresh = await apiGetJob(jobId);
      if (fresh.ok && fresh.data.job) setJob(fresh.data.job);
    }
  }, [jobId, backendUserId, job?.motoristId, actorId]);

  const copyField = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }, []);

  const startPay = useCallback(async () => {
    // Prefer latest job snapshot
    let current = job;
    if (jobId) {
      const fresh = await apiGetJob(jobId);
      if (fresh.ok && fresh.data.job) {
        current = fresh.data.job;
        setJob(current);
      }
    }
    if (!current) {
      void logPayGate("job-missing", { jobId: jobId || null });
      setErr("Job not found. Go back and open pay again.");
      setPhase("expired");
      return;
    }

    // Already paid / in progress → live job
    if (
      current.status === "paid_booked" ||
      current.status === "en_route" ||
      current.status === "arrived" ||
      current.status === "in_progress" ||
      current.status === "completed" ||
      current.status === "satisfied" ||
      current.status === "released"
    ) {
      void logPayGate("already-paid", {
        jobId: current.id,
        status: current.status,
      });
      router.replace(`/jobs/${current.id}`);
      return;
    }

    // agreed | cancelled | expired with price → server re-opens to agreed + new pay link
    const canPay =
      current.status === "agreed" ||
      ((current.status === "cancelled" || current.status === "expired") &&
        current.agreedMajor != null &&
        current.agreedMajor > 0);

    if (!canPay) {
      void logPayGate("not-payable", {
        jobId: current.id,
        status: current.status,
        agreedMajor: current.agreedMajor,
      });
      setErr("This job is not ready for payment.");
      setPhase("expired");
      return;
    }

    setErr(null);
    setPayUrl(null);
    setBankPay(null);
    setPhase("paying");
    try {
      const payEmail = (userProfile?.email || "").trim();
      if (!payEmail.includes("@")) {
        void logPayGate("no-email", {
          jobId: current.id,
          email: payEmail || "(blank)",
        });
        setErr("Add a valid email on your profile before paying.");
        setPhase("expired");
        return;
      }
      const payerId =
        (backendUserId && backendUserId.length > 10
          ? backendUserId
          : null) ||
        (current.motoristId && current.motoristId.length > 10
          ? current.motoristId
          : null) ||
        actorId;
      if (!payerId || payerId === "local-user" || payerId.includes("@")) {
        void logPayGate("no-payer-id", {
          jobId: current.id,
          backendUserId: backendUserId || null,
          motoristId: current.motoristId || null,
          actorId: actorId || null,
        });
        setErr("Session not ready. Pull to refresh, then try again.");
        setPhase("expired");
        return;
      }
      if (current.motoristId && payerId !== current.motoristId) {
        if (backendUserId === current.motoristId) {
          /* ok */
        } else if (backendUserId) {
          void logPayGate("wrong-motorist", {
            jobId: current.id,
            actorId: actorId || null,
            motoristId: current.motoristId || null,
          });
          setErr("Sign in with the customer account that created this job.");
          setPhase("expired");
          return;
        }
      }
      const res = await apiPayJob({
        jobId: current.id,
        motoristId: current.motoristId || payerId,
        email: payEmail,
        customerName: current.motoristName || userProfile?.fullName || undefined,
        customerPhone: current.motoristPhone || userProfile?.phone || undefined,
        preferInline: true,
      });
      if (!res.ok) {
        // Failed to start pay — NOT a used 20‑min window
        void logPayGate("pay-start-failed", {
          jobId: current.id,
          message: res.message || null,
        });
        setErr(res.message || "Could not start payment. Try again.");
        setPhase("summary");
        setSessionEndsAt(null);
        setBankPay(null);
        return;
      }
      if ((res.data as { alreadyPaid?: boolean }).alreadyPaid) {
        router.replace(`/jobs/${current.id}`);
        return;
      }
      const url = (res.data.authorizationUrl || "").trim();
      const ref = (res.data.reference || "").trim();
      setReference(ref || null);
      const ends =
        res.data.paymentSessionEndsAt ||
        new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();
      setSessionEndsAt(ends);

      const again = await apiGetJob(current.id);
      if (again.ok && again.data.job) setJob(again.data.job);

      if (!ref) {
        setErr("Payment session missing. Tap Pay again.");
        setPhase("expired");
        return;
      }

      setPayUrl(url || null);

      // Dev mock only
      if (url && canEmbedCheckoutInApp(url)) {
        setPhase("mock_embed");
        return;
      }

      // Prefer bank details (any truthy account number)
      const bt = res.data.bankTransfer;
      const accountNumber = String(bt?.accountNumber || "").trim();
      if (accountNumber) {
        // Account name = bank recipient only (Ona escrow). Never instruction copy.
        let accountName = String(bt?.accountName || "Ona").trim() || "Ona";
        if (
          /please\s|make a bank transfer|transfer to|exact amount/i.test(
            accountName
          ) ||
          accountName.length > 48
        ) {
          accountName = "Ona";
        }
        let note = String(
          bt?.note ||
            "Pay into Ona escrow (account below). Funds are released after the job is confirmed. Transfer the exact amount only."
        ).trim();
        // Normalize older copy
        note = note
          .replace(/\(account above\)/gi, "(account below)")
          .replace(/Funds release after/gi, "Funds are released after");
        // If note was wrongly duplicated into account name historically, clean it
        if (/^please\s+make\s+a\s+bank\s+transfer\s+to\s+/i.test(note)) {
          const pro = note.replace(
            /^please\s+make\s+a\s+bank\s+transfer\s+to\s+/i,
            ""
          );
          note = `For ${pro}. Pay into Ona escrow (account below). Funds are released after the job is confirmed. Transfer the exact amount only.`;
        }
        setBankPay({
          accountNumber,
          bankName: String(bt?.bankName || "Flutterwave MFB"),
          accountName,
          amountMajor: Number(bt?.amountMajor || current.agreedMajor || 0),
          currency: String(bt?.currency || "NGN"),
          expiresAt: bt?.expiresAt ?? null,
          note,
          flwRef: bt?.flwRef ?? null,
        });
        setPhase("bank_pay");
        return;
      }

      setErr(
        "Could not create bank transfer details. Tap Pay again in a moment."
      );
      setPhase("summary");
      setSessionEndsAt(null);
      void resetPayTimerOnCancel();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed");
      setPhase("expired");
    }
  }, [job, jobId, actorId, backendUserId, userProfile, router, resetPayTimerOnCancel]);

  const cancelPaymentOnly = () => {
    setCancelOpen(false);
    void resetPayTimerOnCancel().then(() => {
      router.replace(jobId ? `/jobs/${jobId}` : "/jobs");
    });
  };

  const cancelEntireRequest = async () => {
    if (!job || !actorId) {
      cancelPaymentOnly();
      return;
    }
    setBusyCancel(true);
    try {
      await apiTransition({
        jobId: job.id,
        event: "CANCEL",
        actor: "motorist",
        actorId,
      });
    } catch {
      /* still leave */
    }
    setBusyCancel(false);
    setCancelOpen(false);
    router.replace("/jobs");
  };

  const sheet = isLight ? "bg-[#e8e9ed]" : "bg-[#0a0a0a]";
  const card = isLight ? "bg-white" : "bg-[#1c1c1e]";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/55";

  if (!authReady) {
    return (
      <div className={cn("flex h-full items-center justify-center", sheet)}>
        <Loader2 className="h-7 w-7 animate-spin text-[#FF6B35]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-3 px-6", sheet)}>
        <p className={cn("text-[14px] font-semibold", ink)}>Sign in to pay</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="h-11 rounded-xl bg-[#FF6B35] px-6 text-[13px] font-bold text-white"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className={cn("relative flex h-full flex-col", sheet)}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h1 className={cn("text-[18px] font-black tracking-tight", ink)}>
            Pay
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className={cn(
            "inline-flex h-9 items-center gap-1 rounded-full border-0 px-3 text-[13px] font-bold",
            isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
          )}
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
          Cancel
        </button>
      </div>

      {phase === "expired" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-10">
          <p className={cn("text-center text-[16px] font-black", ink)}>
            {attemptsLeft <= 0 ? "No attempts left" : "Payment failed"}
          </p>
          <p className={cn("text-center text-[13px] font-medium", muted)}>
            {attemptsLeft <= 0
              ? "Booking cancelled."
              : `${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`}
          </p>
          {err ? (
            <p className="text-center text-[12px] font-semibold text-red-500">
              {err}
            </p>
          ) : null}
          {attemptsLeft > 0 ? (
            <button
              type="button"
              disabled={!jobId}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setErr(null);
                setSessionEndsAt(null);
                setPayUrl(null);
                void startPay();
              }}
              className="relative z-10 mt-2 inline-flex h-14 w-full max-w-sm cursor-pointer items-center justify-center rounded-2xl border-0 bg-[#FF6B35] text-[15px] font-black text-white active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Pay again
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              router.replace(jobId ? `/jobs/${jobId}` : "/jobs")
            }
            className={cn("text-[13px] font-semibold", muted)}
          >
            Back to job
          </button>
        </div>
      ) : phase === "paying" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-10">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
          <p className={cn("text-[14px] font-semibold", ink)}>
            Loading…
          </p>
        </div>
      ) : phase === "bank_pay" && bankPay ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">
          <div className={cn("rounded-2xl px-4 py-4 shadow-sm", card)}>
            <p className={cn("text-[11px] font-bold uppercase tracking-wide", muted)}>
              Bank transfer
            </p>

            {hasOpenSession && payEndsAt ? (
              <div
                className={cn(
                  "mt-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2.5",
                  isLight ? "bg-black/[0.04]" : "bg-white/5"
                )}
              >
                <span
                  className={cn(
                    "text-[12px] font-bold uppercase tracking-wide",
                    muted
                  )}
                >
                  Time left
                </span>
                <PayTimer deadline={payEndsAt} onExpire={onPaymentExpired} />
              </div>
            ) : null}

            {/* Note first so “account below” matches the layout */}
            {bankPay.note ? (
              <div
                className={cn(
                  "mt-3 rounded-xl px-3 py-2.5 text-left",
                  isLight ? "bg-amber-50" : "bg-amber-950/30"
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Note
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[12px] font-semibold leading-snug",
                    isLight ? "text-amber-950" : "text-amber-100"
                  )}
                >
                  {bankPay.note}
                </p>
              </div>
            ) : null}

            <div className="mt-3 space-y-3">
              {(
                [
                  ["Bank", bankPay.bankName],
                  ["Account name", bankPay.accountName],
                  ["Account number", bankPay.accountNumber],
                  [
                    "Amount",
                    formatMoney(
                      bankPay.amountMajor,
                      forceNairaCurrency(bankPay.currency as "NGN")
                    ),
                  ],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5",
                    isLight ? "bg-black/[0.04]" : "bg-white/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[10px] font-bold uppercase", muted)}>
                      {label}
                    </p>
                    <p
                      className={cn(
                        "text-[15px] font-black break-all",
                        label === "Account number" ? "tabular-nums" : "",
                        ink
                      )}
                    >
                      {value}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void copyField(
                        label,
                        label === "Amount"
                          ? String(bankPay.amountMajor)
                          : value
                      )
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border-0 bg-[#FF6B35]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#FF6B35]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === label ? "Copied" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#FF6B35]" />
            <p className={cn("text-[12px] font-semibold", muted)}>
              Waiting for payment…
            </p>
          </div>

          </div>

          {/* Pinned bottom bar — I paid / Cancel always visible */}
          <div className="shrink-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                if (!reference || !jobId) return;
                void fetch("/api/payments/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reference, jobId }),
                }).then(async () => {
                  const j = await apiGetJob(jobId);
                  if (j.ok && j.data.job) {
                    setJob(j.data.job);
                    const st = j.data.job.status;
                    if (
                      st === "paid_booked" ||
                      st === "en_route" ||
                      st === "arrived" ||
                      st === "in_progress"
                    ) {
                      router.replace(`/jobs/${jobId}`);
                    }
                  }
                });
              }}
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl border-0 bg-[#FF6B35] text-[14px] font-black text-white"
            >
              I paid
            </button>
            <button
              type="button"
              onClick={() => void resetPayTimerOnCancel()}
              className={cn("mt-2 w-full text-center text-[13px] font-semibold", muted)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : phase === "mock_embed" && payUrl ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2",
              isLight ? "border-black/10 bg-white/90" : "border-white/10 bg-black/40"
            )}
          >
            <p className={cn("text-[12px] font-black", ink)}>Mock checkout</p>
            <button
              type="button"
              onClick={() => {
                setPayUrl(null);
                setPhase("summary");
              }}
              className={cn(
                "rounded-lg border-0 px-2.5 py-1.5 text-[11px] font-bold",
                isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
              )}
            >
              Close
            </button>
          </div>
          <iframe
            title="Mock secure checkout"
            src={payUrl}
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">
          {/* Amount hero */}
          <div
            className={cn(
              "relative overflow-hidden rounded-3xl px-5 py-6 shadow-sm",
              card
            )}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#FF6B35]/15" />
            <div className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-sky-500/10" />
            <p className={cn("text-[12px] font-semibold", muted)}>
              Amount
            </p>
            <p className={cn("mt-1 text-[34px] font-black tracking-tight", ink)}>
              {amountLabel}
            </p>
            {chargeBreakdown ? (
              <div className={cn("mt-3 space-y-1 text-[11px] font-semibold", muted)}>
                <div className="flex justify-between gap-2">
                  <span>Service charge</span>
                  <span className={ink}>
                    {formatMoney(
                      chargeBreakdown.totalMajor,
                      forceNairaCurrency(job?.currency)
                    )}
                  </span>
                </div>
                <p className="pt-1 text-[10px] font-medium leading-snug">
                  Pay this exact amount only. Your bank may add its own transfer
                  fee. Do not change the transfer amount.
                </p>
              </div>
            ) : null}
          </div>

          {/* Job summary */}
          <div className={cn("mt-3 rounded-2xl px-4 py-3.5 shadow-sm", card)}>
            <p className={cn("text-[11px] font-bold uppercase tracking-wide", muted)}>
              Booking
            </p>
            {!job ? (
              <div className="mt-3 flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF6B35]" />
              </div>
            ) : (
              <dl className="mt-2 space-y-2 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className={muted}>Repair Pro</dt>
                  <dd className={cn("truncate font-bold", ink)}>
                    {job.repairProName}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className={muted}>Service</dt>
                  <dd className={cn("font-bold", ink)}>
                    {PRO_SERVICE_LABELS[job.serviceType] || job.serviceType}
                  </dd>
                </div>
                {isAutomotiveTrade(job.serviceType) && job.motoristVehicle ? (
                  <div className="flex justify-between gap-3">
                    <dt className={muted}>Vehicle</dt>
                    <dd className={cn("truncate font-bold", ink)}>
                      {job.motoristVehicle}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className={muted}>Problem</dt>
                  <dd
                    className={cn(
                      "max-w-[58%] text-right font-semibold leading-snug",
                      ink
                    )}
                  >
                    {job.problem}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {/* Bank transfer only — USSD and other methods disabled */}
          <div className={cn("mt-3 rounded-2xl px-4 py-3.5 shadow-sm", card)}>
            <p className={cn("text-[11px] font-bold uppercase tracking-wide", muted)}>
              Method
            </p>
            <div className={cn("mt-2 flex w-full items-center justify-between rounded-xl border-0 px-3 py-3 text-left text-[13px] font-bold", card)}>
              <span>Bank transfer</span>
              <span className={cn("text-[11px] font-semibold", muted)}>
                Only
              </span>
            </div>
            <p className={cn("mt-2 text-[11px] font-medium leading-snug", muted)}>
              Pay by bank transfer to the account shown. USSD and card are not available.
            </p>
          </div>

          {err ? (
            <p className="mt-3 text-center text-[12px] font-semibold text-red-500">
              {err}
            </p>
          ) : null}
          </div>

          {/* Pay bar pinned to the bottom of the page */}
          <div className="shrink-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              disabled={
                !job ||
                !(
                  job.status === "agreed" ||
                  ((job.status === "cancelled" || job.status === "expired") &&
                    job.agreedMajor != null &&
                    job.agreedMajor > 0)
                )
              }
              onClick={() => void startPay()}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-0 bg-[#FF6B35] text-[15px] font-black text-white disabled:opacity-45"
            >
              <Lock className="h-4 w-4" />
              {job?.status === "cancelled" || job?.status === "expired"
                ? "Pay again"
                : "Pay"}
            </button>
          </div>
        </div>
      )}

      {/* Cancel chooser */}
      {cancelOpen ? (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 p-3">
          <div
            className={cn(
              "w-full max-w-md overflow-hidden rounded-2xl shadow-2xl",
              card
            )}
            role="dialog"
            aria-label="Cancel options"
          >
            <div className="px-4 pb-2 pt-4">
              <p className={cn("text-center text-[15px] font-black", ink)}>
                Cancel
              </p>
            </div>
            <button
              type="button"
              disabled={busyCancel}
              onClick={cancelPaymentOnly}
              className={cn(
                "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold",
                isLight
                  ? "bg-transparent text-slate-900"
                  : "bg-transparent text-white"
              )}
            >
              Cancel payment
            </button>
            <button
              type="button"
              disabled={busyCancel}
              onClick={() => void cancelEntireRequest()}
              className={cn(
                "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold text-red-500"
              )}
            >
              {busyCancel ? "Cancelling…" : "Cancel request"}
            </button>
            <button
              type="button"
              disabled={busyCancel}
              onClick={() => setCancelOpen(false)}
              className={cn(
                "flex h-11 w-full items-center justify-center border-0 text-[13px] font-semibold",
                isLight ? "text-slate-500" : "text-white/50"
              )}
            >
              Keep paying
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PaymentsCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#e8e9ed]">
          <Loader2 className="h-7 w-7 animate-spin text-[#FF6B35]" />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
