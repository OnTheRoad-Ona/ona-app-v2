"use client";

import Link from "next/link";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Soft warning after 2nd–4th request (book or accept). */
export function VerificationWarningBanner({
  message,
  onDismiss,
  isLight = true,
}: {
  message: string;
  onDismiss?: () => void;
  isLight?: boolean;
}) {
  return (
    <div
      role="status"
      className={cn(
        "relative rounded-xl px-3 py-2.5 pr-9 text-[12px] leading-snug",
        isLight
          ? "bg-[#FF6B35]/15 text-[#FF6B35] ring-1 ring-[#FF6B35]/40"
          : "bg-[#FF6B35]/150/15 text-[#FF6B35] ring-1 ring-[#FF6B35]/40/30"
      )}
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B35]" />
        <div className="min-w-0">
          <p className="font-semibold">Verify soon to keep full access</p>
          <p className="mt-0.5 opacity-90">{message}</p>
          <Link
            href="/verify"
            className="mt-1.5 inline-flex text-[12px] font-bold text-brand underline-offset-2 hover:underline"
          >
            Verify your ID now
          </Link>
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-2 top-2 rounded-md p-1 opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Hard block at 5th request until identity is verified. */
export function VerificationBlockedPanel({
  message,
  isLight = true,
  onClose,
}: {
  message: string;
  isLight?: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal
      className={cn(
        "rounded-2xl p-4 shadow-lg",
        isLight ? "bg-white ring-1 ring-black/10" : "bg-zinc-900 ring-1 ring-white/10"
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15">
        <ShieldCheck className="h-6 w-6 text-brand" />
      </div>
      <h2
        className={cn(
          "mt-3 text-[16px] font-bold",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        Verification required
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{message}</p>
      <p className="mt-2 text-[12px] text-muted">
        You explored the app freely. Verify your ID once to book without
        limits.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href="/verify"
          className="flex h-11 items-center justify-center rounded-lg bg-[#323231] text-[14px] font-semibold text-white"
        >
          Verify identity now
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "h-10 rounded-lg text-[13px] font-semibold",
              isLight ? "bg-slate-100 text-slate-700" : "bg-white/10 text-white"
            )}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
