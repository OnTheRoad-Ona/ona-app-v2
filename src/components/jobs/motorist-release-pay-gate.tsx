"use client";

/**
 * MotoristReleasePayGate — Confirm Job & Release Payment
 *
 * Only while status=completed AND customer has NOT yet confirmed (no satisfiedAt)
 * and escrow is not already released.
 *
 * After one confirm (even if Flutterwave payout fails): never re-prompt.
 * After release: never re-prompt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, Loader2, X } from "lucide-react";
import {
  canNotify,
  ensureNotifyPermission,
  showAppNotification,
  vibrateCallPattern,
} from "@/lib/app-notify";
import { apiListJobs, apiTransition } from "@/lib/jobs/client";
import {
  COMPLETED_AUTO_RELEASE_WINDOW_MS,
  needsCustomerReleaseConfirm,
  SATISFIED_REMINDER_INTERVAL_MS,
  satisfiedReleaseEndsAtIso,
} from "@/lib/jobs/constants";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney, forceNairaCurrency } from "@/lib/pricing";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const ALERTED_KEY = "om-release-pay-alerted";
const MINIMIZED_KEY = "om-release-pay-minimized";
const LAST_BUZZ_KEY = "om-release-pay-last-buzz";
/** Jobs that must never show the release UI again this browser */
const DONE_KEY = "om-release-pay-done";

function readSet(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, s: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...s].slice(-80)));
  } catch {
    /* */
  }
}

function markDone(id: string) {
  const s = readSet(DONE_KEY);
  s.add(id);
  writeSet(DONE_KEY, s);
}

function isDone(id: string): boolean {
  return readSet(DONE_KEY).has(id);
}

function markAlerted(id: string) {
  const s = readSet(ALERTED_KEY);
  s.add(id);
  writeSet(ALERTED_KEY, s);
}

function isMinimized(id: string): boolean {
  return readSet(MINIMIZED_KEY).has(id);
}

function setMinimized(id: string, on: boolean) {
  const s = readSet(MINIMIZED_KEY);
  if (on) s.add(id);
  else s.delete(id);
  writeSet(MINIMIZED_KEY, s);
}

function readLastBuzz(id: string): number {
  try {
    const raw = sessionStorage.getItem(LAST_BUZZ_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, number>;
    return Number(map[id]) || 0;
  } catch {
    return 0;
  }
}

function writeLastBuzz(id: string, ts: number) {
  try {
    const raw = sessionStorage.getItem(LAST_BUZZ_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    map[id] = ts;
    sessionStorage.setItem(LAST_BUZZ_KEY, JSON.stringify(map));
  } catch {
    /* */
  }
}

export function SwipeToRelease({
  onRelease,
  busy,
  isLight,
}: {
  onRelease: () => void;
  busy: boolean;
  isLight?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const released = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy || released.current) return;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setProgress(x / rect.width);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (progress >= 0.85 && !released.current) {
      released.current = true;
      setProgress(1);
      onRelease();
    } else {
      setProgress(0);
    }
  };

  return (
    <div
      ref={trackRef}
      className="relative mt-5 h-14 w-full select-none overflow-hidden rounded-full border-0 bg-[#FF6B35]/20"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none" }}
    >
      {/* Background text */}
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-[12px] font-bold tracking-wide",
          isLight ? "text-slate-600" : "text-zinc-300"
        )}
      >
        {busy ? "Confirming…" : "I am Satisfied Release Payment"}
      </span>

      {/* Slider knob */}
      <div
        className="absolute inset-y-1 flex items-center justify-center rounded-full bg-[#FF6B35] text-white shadow-lg transition-shadow active:shadow-xl"
        style={{
          left: 4,
          width: `${Math.max(progress * 100, busy ? 100 : 14)}%`,
          minWidth: 56,
        }}
      >
        <ChevronRight className="h-5 w-5" strokeWidth={3} />
      </div>
    </div>
  );
}

function needsRelease(j: JobRecord, motoristId: string): boolean {
  if (!j.id || j.motoristId !== motoristId) return false;
  if (isDone(j.id)) return false;
  return needsCustomerReleaseConfirm(j);
}

function AutoReleaseCountdown({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(endsAt).getTime() - Date.now())
  );

  useEffect(() => {
    const tick = () => {
      setLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const totalSec = Math.floor(left / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const pct = Math.min(
    100,
    Math.max(0, (left / COMPLETED_AUTO_RELEASE_WINDOW_MS) * 100)
  );

  return (
    <div className="mt-3 w-full">
      <p className="text-center text-[11px] font-semibold text-black">
        Auto-release in
      </p>
      <p
        className="mt-0.5 text-center text-[22px] font-black tabular-nums tracking-tight"
        style={{ color: totalSec <= 3600 ? "#ef4444" : undefined }}
        role="timer"
        aria-live="polite"
      >
        {label}
      </p>
      <div className="mx-auto mt-2 h-[3px] w-full max-w-[200px] overflow-hidden rounded-full bg-black/15">
        <div
          className="h-full rounded-full bg-[#FF6B35] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-center text-[10px] font-medium opacity-70">
        Confirm job completion
      </p>
    </div>
  );
}

function buzzForJob(job: JobRecord) {
  unlockAudio();
  playAppSound("success_soft");
  vibrateCallPattern();
  void ensureNotifyPermission().then(() => {
    if (canNotify()) {
      showAppNotification({
        title: "Release payment",
        body: "Confirm to release escrow.",
        tag: `job-complete-${job.id}`,
        href: `/jobs/${job.id}`,
        requireInteraction: false,
      });
    }
  });
  writeLastBuzz(job.id, Date.now());
}

export function MotoristReleasePayGate() {
  const { backendUserId, isAuthenticated, theme } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const pathname = usePathname() || "";
  const knownCompleted = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<JobRecord | null>(null);
  const [minimized, setMinimizedUi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [receipt, setReceipt] = useState<{
    amount: string;
    pro: string;
    platform: string;
    note?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !backendUserId) {
      setPending(null);
      return;
    }
    // Soft sweep — never re-open UI for done jobs
    try {
      const { apiExpireStaleBookedJobs } = await import("@/lib/jobs/client");
      await apiExpireStaleBookedJobs();
    } catch {
      /* */
    }

    const res = await apiListJobs(backendUserId, "motorist");
    if (!res.ok) return;

    // Permanently silence finished / already-confirmed jobs
    for (const j of res.data.jobs) {
      if (j.motoristId !== backendUserId) continue;
      if (
        j.status === "released" ||
        j.status === "satisfied" ||
        j.status === "refunded" ||
        j.releasedAt ||
        j.satisfiedAt ||
        j.escrowStatus === "released"
      ) {
        markDone(j.id);
      }
    }

    const needs = res.data.jobs
      .filter((j) => needsRelease(j, backendUserId))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );

    const top = needs[0] || null;
    if (!top) {
      setPending(null);
      return;
    }

    const firstSighting = !knownCompleted.current.has(top.id);
    if (firstSighting) knownCompleted.current.add(top.id);

    setPending(top);
    const min = isMinimized(top.id);
    setMinimizedUi(min);

    // Alert only once per job — never re-spam full modal every poll
    if (firstSighting && !readSet(ALERTED_KEY).has(top.id)) {
      markAlerted(top.id);
      buzzForJob(top);
    }

    // Hourly gentle buzz only if still minimized (does not force full modal open)
    const last = readLastBuzz(top.id);
    if (
      min &&
      Date.now() - last >= SATISFIED_REMINDER_INTERVAL_MS
    ) {
      buzzForJob(top);
    }
  }, [backendUserId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !backendUserId) {
      setPending(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (cancelled) return;
      await refresh();
    };
    void poll();
    const t = window.setInterval(() => {
      void poll();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [backendUserId, isAuthenticated, refresh]);

  const onMinimize = () => {
    if (!pending) return;
    setMinimized(pending.id, true);
    setMinimizedUi(true);
  };

  const onExpand = () => {
    if (!pending) return;
    setMinimized(pending.id, false);
    setMinimizedUi(false);
  };

  const onSatisfied = async () => {
    if (!pending) return;
    const actor =
      (pending.motoristId && pending.motoristId.length > 10
        ? pending.motoristId
        : null) ||
      (backendUserId && backendUserId.length > 10 ? backendUserId : null);
    if (!actor) {
      setErr("Sign in as the customer who booked this job to release payment.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await apiTransition({
        jobId: pending.id,
        event: "SATISFIED",
        actor: "motorist",
        actorId: actor,
      });

      // Always stop re-prompting after the customer has acted once
      markDone(pending.id);
      setMinimized(pending.id, false);

      if (!res.ok) {
        setErr(
          res.message ||
            "Could not confirm release. Funds stay in escrow. Try again or contact support."
        );
        try {
          const raw = sessionStorage.getItem(DONE_KEY);
          if (raw) {
            const arr = (JSON.parse(raw) as string[]).filter(
              (id) => id !== pending.id
            );
            sessionStorage.setItem(DONE_KEY, JSON.stringify(arr));
          }
        } catch {
          /* */
        }
        setBusy(false);
        return;
      }

      const job = res.data.job;
      const released =
        job.status === "released" ||
        job.escrowStatus === "released" ||
        Boolean(job.releasedAt);
      const pendingSettlement =
        job.status === "satisfied" ||
        job.escrowStatus === "pending_settlement" ||
        job.escrowStatus === "release_pending";

      const currency = forceNairaCurrency(job.currency || pending.currency);
      const total =
        job.agreedMajor != null
          ? job.agreedMajor
          : pending.agreedMajor != null
            ? pending.agreedMajor
            : 0;
      // Service S: pro 87.5% · Ona 5% · VAT 7.5% on FLW
      const proShare = Math.round(total * 0.875 * 100) / 100;
      const platformShare = Math.round(total * 0.05 * 100) / 100;

      unlockAudio();
      playAppSound("payment_success");
      if (released || pendingSettlement) {
        setReceipt({
          amount: formatMoney(total, currency),
          pro: formatMoney(proShare, currency),
          platform: formatMoney(platformShare, currency),
          note: released
            ? "Payment confirmed"
            : "Payout processing — waiting for settlement. We’ll notify you when released.",
        });
        setSuccess(true);
        setPending(null);
      } else {
        router.replace("/dashboard");
      }
    } catch (e) {
      markDone(pending.id);
      setErr(e instanceof Error ? e.message : "Release failed");
    }
    setBusy(false);
  };

  if (success && receipt) {
    const ink = isLight ? "#1a1b1e" : "#ffffff";
    const card = isLight ? "#d4d5d9" : "#1c1c1e";
    return (
      <div className="absolute inset-0 z-[98] flex flex-col" role="status">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: isLight ? "#00000066" : "#000000b3" }}
        />
        <div
          className="relative z-10 m-auto flex w-[min(100%-1.5rem,360px)] flex-col items-center rounded-2xl px-5 py-6 text-center shadow-xl"
          style={{ backgroundColor: card }}
        >
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <p className="mt-3 text-[17px] font-black" style={{ color: ink }}>
            {receipt.note?.toLowerCase().includes("process")
              ? "Processing"
              : "Released"}
          </p>
          <p
            className="mt-2 text-[13px] font-medium leading-snug opacity-80"
            style={{ color: ink }}
          >
            {receipt.note || "Payment confirmed"}
          </p>
          <p
            className="mt-3 text-[22px] font-black tabular-nums"
            style={{ color: ink }}
          >
            {receipt.amount}
          </p>
          <div
            className="mt-3 w-full space-y-1 text-[12px] font-semibold"
            style={{ color: ink }}
          >
            <p>Pro 87.5% · {receipt.pro}</p>
            <p>Ona 5% · {receipt.platform}</p>
            <p className="opacity-70">VAT 7.5% held on Flutterwave</p>
          </div>
        </div>
      </div>
    );
  }

  if (!pending) return null;

  // On the live job page the job shell already has the single CTA —
  // do not stack another modal (avoids 2–3 identical buttons).
  const onThisJobPage =
    pathname === `/jobs/${pending.id}` ||
    pathname.startsWith(`/jobs/${pending.id}/`);
  if (onThisJobPage && !minimized) return null;

  const ink = isLight ? "#1a1b1e" : "#ffffff";
  const muted = isLight ? "#5c6370" : "rgba(255,255,255,0.65)";
  const card = isLight ? "#d4d5d9" : "#1c1c1e";
  const currency = forceNairaCurrency(pending.currency);
  const endsAt = satisfiedReleaseEndsAtIso(pending);

  if (minimized) {
    return (
      <div
        className="absolute bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-3 right-3 z-[97]"
        role="status"
      >
        <button
          type="button"
          onClick={onExpand}
          className="flex w-full items-center gap-3 rounded-2xl border-0 px-4 py-3 text-left shadow-lg active:opacity-95"
          style={{ backgroundColor: "#FF6B35" }}
          aria-label="Release payment"
        >
          <CheckCircle2 className="h-8 w-8 shrink-0 text-white" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-black uppercase tracking-wide text-white">
              Release payment
            </p>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-white/95">
              Tap to confirm
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-bold text-white/90">
            Open
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-[96] flex flex-col"
      role="dialog"
      aria-modal
      aria-label="Release payment"
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: isLight ? "#00000066" : "#000000b3" }}
        onClick={onMinimize}
        aria-hidden
      />
      <div
        className="relative z-10 m-auto flex w-[min(100%-1.5rem,380px)] flex-col rounded-2xl px-5 py-6 shadow-xl"
        style={{ backgroundColor: card }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-[#FF6B35]">
            Release
          </p>
          <button
            type="button"
            onClick={onMinimize}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border-0",
              isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
            )}
            aria-label="Minimize"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <p
          className="mt-3 text-center text-[17px] font-black leading-snug"
          style={{ color: ink }}
        >
          Release payment
        </p>
        <p
          className="mt-2 text-center text-[12px] font-medium leading-snug"
          style={{ color: muted }}
        >
          Confirm the job is done to release payment to your Repair Pro
        </p>
        {pending.agreedMajor != null ? (
          <p
            className="mt-3 text-center text-[22px] font-black tabular-nums"
            style={{ color: ink }}
          >
            {formatMoney(pending.agreedMajor, currency)}
          </p>
        ) : null}

        {endsAt ? <AutoReleaseCountdown endsAt={endsAt} /> : null}

        {err ? (
          <div
            className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-red-500/40 bg-red-50 px-3 py-2 text-left"
            role="alert"
          >
            <p className="text-[12px] font-semibold leading-snug text-red-700">
              {err}
            </p>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(err)}
                className="text-[11px] font-bold text-red-700 underline"
              >
                Copy error
              </button>
              <button
                type="button"
                onClick={() => setErr(null)}
                className="text-[11px] font-bold text-red-700 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <SwipeToRelease
          onRelease={() => void onSatisfied()}
          busy={busy || !backendUserId}
          isLight={isLight}
        />

      </div>
    </div>
  );
}
