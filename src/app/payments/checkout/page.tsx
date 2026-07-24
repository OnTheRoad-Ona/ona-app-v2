"use client";

/**
 * In-app Flutterwave checkout — modern Ona pay shell.
 * Initializes escrow charge, then loads Flutterwave checkout (iframe + fallback).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Lock,
  Shield,
  X,
} from "lucide-react";
import { apiGetJob, apiPayJob, apiTransition } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney, LABOUR_SPLIT_LINE } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Phase = "summary" | "paying" | "redirecting" | "error";

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
  const [iframeKey, setIframeKey] = useState(0);
  const [reference, setReference] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busyCancel, setBusyCancel] = useState(false);

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

  /**
   * When Flutterwave redirects the iframe back to our /payments/callback
   * (same origin), leave the frame and open the full Ona app.
   */
  useEffect(() => {
    if (phase !== "redirecting" || !payUrl) return;

    const leaveFrame = (href: string) => {
      setPayUrl(null);
      setPhase("summary");
      window.location.replace(href);
    };

    const onIframeLoad = () => {
      const el = document.getElementById(
        "ona-flw-frame"
      ) as HTMLIFrameElement | null;
      if (!el?.contentWindow) return;
      try {
        const href = el.contentWindow.location.href;
        if (
          href &&
          (href.includes("/payments/callback") ||
            href.includes("/jobs/") ||
            href.includes("status=successful") ||
            href.includes("status=completed"))
        ) {
          leaveFrame(href.includes("/payments/callback") ? href : href);
        }
      } catch {
        // Still on Flutterwave (cross-origin) — ignore
      }
    };

    // Poll job: payment verified → drop iframe and open booked job
    const poll = window.setInterval(() => {
      if (!jobId) return;
      void apiGetJob(jobId).then((res) => {
        if (!res.ok || !res.data.job) return;
        const st = res.data.job.status;
        if (
          st === "paid_booked" ||
          st === "en_route" ||
          st === "arrived" ||
          st === "in_progress"
        ) {
          window.clearInterval(poll);
          leaveFrame(`/jobs/${jobId}`);
        }
      });
    }, 2500);

    window.addEventListener("message", (ev) => {
      // Optional: future FLW / callback postMessage
      if (
        ev.data &&
        typeof ev.data === "object" &&
        (ev.data as { type?: string }).type === "ona-payment-done"
      ) {
        const dest =
          (ev.data as { href?: string }).href ||
          (jobId ? `/jobs/${jobId}` : "/jobs");
        leaveFrame(dest);
      }
    });

    const el = document.getElementById("ona-flw-frame");
    el?.addEventListener("load", onIframeLoad);

    return () => {
      window.clearInterval(poll);
      el?.removeEventListener("load", onIframeLoad);
    };
  }, [phase, payUrl, jobId, iframeKey]);

  const amountLabel = useMemo(() => {
    if (!job?.agreedMajor) return "—";
    return formatMoney(job.agreedMajor, job.currency);
  }, [job]);

  const startPay = useCallback(async () => {
    if (!job) return;
    setErr(null);
    setPhase("paying");
    try {
      const payEmail = (userProfile?.email || "").trim();
      if (!payEmail.includes("@")) {
        setErr("Add a valid email on your profile before paying.");
        setPhase("error");
        return;
      }
      if (!actorId || actorId === "local-user" || actorId.includes("@")) {
        setErr("Session not ready. Pull to refresh, then try again.");
        setPhase("error");
        return;
      }
      const res = await apiPayJob({
        jobId: job.id,
        motoristId: actorId,
        email: payEmail,
        customerName: job.motoristName || userProfile?.fullName || undefined,
        customerPhone: job.motoristPhone || userProfile?.phone || undefined,
      });
      if (!res.ok) {
        setErr(res.message || "Could not start payment.");
        setPhase("error");
        return;
      }
      // Server detected existing successful payment
      if (
        (res.data as { alreadyPaid?: boolean }).alreadyPaid ||
        !res.data.authorizationUrl
      ) {
        if ((res.data as { alreadyPaid?: boolean }).alreadyPaid) {
          router.replace(`/jobs/${job.id}`);
          return;
        }
      }
      const url = res.data.authorizationUrl?.trim();
      setReference(res.data.reference || null);
      if (!url) {
        // Re-check job status before erroring
        const again = await apiGetJob(job.id);
        if (
          again.ok &&
          again.data.job &&
          again.data.job.status !== "agreed" &&
          again.data.job.status !== "negotiating"
        ) {
          router.replace(`/jobs/${job.id}`);
          return;
        }
        setErr("Checkout link missing. Try again in a moment.");
        setPhase("error");
        return;
      }
      setPayUrl(url);
      setPhase("redirecting");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed");
      setPhase("error");
    }
  }, [job, actorId, userProfile]);

  const cancelPaymentOnly = () => {
    setCancelOpen(false);
    router.replace(jobId ? `/jobs/${jobId}` : "/jobs");
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
          <p className={cn("text-[11px] font-bold uppercase tracking-[0.14em]", muted)}>
            Secure checkout
          </p>
          <h1 className={cn("text-[18px] font-black tracking-tight", ink)}>
            Pay to book
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

      {phase === "redirecting" && payUrl ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <div
            className={cn(
              "mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold",
              isLight ? "bg-emerald-50 text-emerald-800" : "bg-emerald-950/40 text-emerald-300"
            )}
          >
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Flutterwave secure payment · escrow holds labour only
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden rounded-2xl shadow-lg ring-1",
              isLight ? "bg-white ring-black/10" : "bg-black ring-white/10"
            )}
          >
            <iframe
              id="ona-flw-frame"
              key={iframeKey}
              title="Flutterwave checkout"
              src={payUrl}
              className="h-full w-full border-0"
              allow="payment *"
              sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation allow-top-navigation-by-user-activation allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <p className={cn("text-center text-[11px] font-medium", muted)}>
              After you pay, this screen closes and Ona opens your booked job.
            </p>
            <button
              type="button"
              onClick={() => setIframeKey((k) => k + 1)}
              className={cn(
                "h-11 w-full rounded-xl border-0 text-[13px] font-bold",
                isLight
                  ? "bg-black/8 text-slate-900"
                  : "bg-white/10 text-white"
              )}
            >
              Reload payment screen
            </button>
            {reference ? (
              <p className={cn("text-center text-[10px] font-mono", muted)}>
                Ref · {reference}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-6 scrollbar-hide">
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
              Labour fee (escrow)
            </p>
            <p className={cn("mt-1 text-[34px] font-black tracking-tight", ink)}>
              {amountLabel}
            </p>
            <p className={cn("mt-1 text-[11px] font-medium leading-snug", muted)}>
              {LABOUR_SPLIT_LINE}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#FF6B35]/15">
                <Shield className="h-4 w-4 text-[#FF6B35]" />
              </span>
              <p className={cn("text-[12px] font-semibold leading-snug", ink)}>
                Funds held until the job is completed
              </p>
            </div>
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
                {job.motoristVehicle ? (
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

          {/* Methods hint */}
          <div
            className={cn(
              "mt-3 rounded-2xl px-4 py-3 text-[12px] font-medium leading-relaxed",
              isLight ? "bg-black/[0.04] text-slate-600" : "bg-white/5 text-white/60"
            )}
          >
            Pay with card, bank transfer, or USSD via Flutterwave. You will
            return here automatically after payment.
          </div>

          {err ? (
            <p className="mt-3 text-center text-[12px] font-semibold text-red-500">
              {err}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!job || phase === "paying" || job?.status !== "agreed"}
            onClick={() => void startPay()}
            className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-0 bg-[#FF6B35] text-[15px] font-black text-white shadow-[0_8px_24px_rgba(255,107,53,0.35)] disabled:opacity-45"
          >
            {phase === "paying" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Preparing secure pay…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Pay with Flutterwave
              </>
            )}
          </button>

          <p className={cn("mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium", muted)}>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Encrypted · PCI handled by Flutterwave
          </p>
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
              <p className={cn("mt-1 text-center text-[12px] font-medium", muted)}>
                Choose what you want to cancel
              </p>
            </div>
            <button
              type="button"
              disabled={busyCancel}
              onClick={cancelPaymentOnly}
              className={cn(
                "flex h-12 w-full items-center justify-center border-0 border-t text-[14px] font-bold",
                isLight
                  ? "border-black/10 bg-transparent text-slate-900"
                  : "border-white/10 bg-transparent text-white"
              )}
            >
              Cancel payment
            </button>
            <button
              type="button"
              disabled={busyCancel}
              onClick={() => void cancelEntireRequest()}
              className={cn(
                "flex h-12 w-full items-center justify-center border-0 border-t text-[14px] font-bold text-red-500",
                isLight ? "border-black/10" : "border-white/10"
              )}
            >
              {busyCancel ? "Cancelling…" : "Cancel request"}
            </button>
            <button
              type="button"
              disabled={busyCancel}
              onClick={() => setCancelOpen(false)}
              className={cn(
                "flex h-11 w-full items-center justify-center border-0 border-t text-[13px] font-semibold",
                isLight
                  ? "border-black/10 text-slate-500"
                  : "border-white/10 text-white/50"
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
