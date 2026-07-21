"use client";

import Link from "next/link";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Soft warning during Tier 1 free period (before Tier 2). */
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
          <p className="font-semibold">Verify to keep full access</p>
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

/** Hard block when free period ends until ID submitted + admin-approved. */
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
        isLight
          ? "bg-[#d4d5d9] ring-1 ring-black/10"
          : "bg-zinc-900 ring-1 ring-white/10"
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
        Full access needs your ID submitted and approved by admin / customer
        care (Tier 2).
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
              isLight ? "bg-black/10 text-slate-700" : "bg-white/10 text-white"
            )}
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Home lower-panel only — phone verify nudge after free period ends.
 * Parent controls visibility (hidden once phone is verified).
 */
export function HomeVerifyPanel({
  message,
  isLight = true,
}: {
  message?: string | null;
  isLight?: boolean;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[25%] flex-col justify-center rounded-2xl px-4 py-3",
        isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
      )}
    >
      <div className="flex gap-2.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#FF6B35]" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[13px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Complete verification
          </p>
          <p
            className={cn(
              "mt-1 text-[12px] leading-snug",
              isLight ? "text-slate-600" : "text-white/65"
            )}
          >
            {message || "Verify your phone number to request help"}
          </p>
          <Link
            href="/verify"
            className="mt-2.5 inline-flex h-9 items-center justify-center rounded-lg bg-[#323231] px-3 text-[12px] font-bold text-white"
          >
            Verify now
          </Link>
        </div>
      </div>
    </div>
  );
}
