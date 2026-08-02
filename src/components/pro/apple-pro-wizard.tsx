"use client";

/**
 * Apple-premium Pro onboarding system (initial signup + Tap-to-switch setup).
 * One surface only: #c8c9cd light / black dark. No nested gray cards.
 * Hairline list rows + large title + bottom primary CTA.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const PRO_SHEET_LIGHT = "#c8c9cd";
export const PRO_SHEET_DARK = "#000000";
export const PRO_CTA = "#323231";
export const PRO_ACCENT = "#FF6B35";

export function proSheetBg(isLight: boolean) {
  return isLight ? PRO_SHEET_LIGHT : PRO_SHEET_DARK;
}

/** Full-height wizard frame — single sheet color, no extra stage fills */
export function AppleProWizard({
  isLight,
  children,
  className,
}: {
  isLight: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden",
        className
      )}
      style={{ backgroundColor: proSheetBg(isLight) }}
    >
      {children}
    </div>
  );
}

/** Large title block (Apple-style) */
export function AppleProTitle({
  title,
  subtitle,
  isLight,
  stepLabel,
}: {
  title: string;
  subtitle?: string;
  isLight: boolean;
  stepLabel?: string;
}) {
  return (
    <div className="shrink-0 px-5 pb-3 pt-2">
      {stepLabel ? (
        <p
          className={cn(
            "mb-1 text-[12px] font-semibold tracking-wide",
            isLight ? "text-slate-500" : "text-white/45"
          )}
        >
          {stepLabel}
        </p>
      ) : null}
      <h1
        className={cn(
          "text-[28px] font-bold leading-tight tracking-tight",
          isLight ? "text-[#1c1c1e]" : "text-white"
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={cn(
            "mt-1.5 text-[14px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/55"
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/** Thin progress dashes */
export function AppleProProgress({
  total,
  index,
  isLight,
}: {
  total: number;
  index: number;
  isLight: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-1 px-5 pb-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-0.5 flex-1 rounded-full",
            i <= index
              ? "bg-[#FF6B35]"
              : isLight
                ? "bg-black/12"
                : "bg-white/15"
          )}
        />
      ))}
    </div>
  );
}

/** Grouped list — hairline only, no fill cards */
export function AppleProList({
  children,
  isLight,
  className,
}: {
  children: ReactNode;
  isLight: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl",
        isLight ? "bg-transparent" : "bg-transparent",
        className
      )}
    >
      <div
        className={cn(
          "divide-y",
          isLight ? "divide-black/10" : "divide-white/10"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Single hairline field row */
export function AppleProRow({
  label,
  children,
  isLight,
  last,
}: {
  label?: string;
  children: ReactNode;
  isLight: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-1 py-2.5",
        !last && (isLight ? "border-b border-black/10" : "border-b border-white/10")
      )}
    >
      {label ? (
        <p
          className={cn(
            "mb-1 text-[11px] font-semibold",
            isLight ? "text-slate-500" : "text-white/45"
          )}
        >
          {label}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** Input: transparent on sheet, hairline underline only */
export function appleProFieldClass(isLight: boolean, locked?: boolean) {
  return cn(
    "h-11 w-full border-0 border-b bg-transparent px-0 text-[16px] font-medium outline-none ring-0 focus:ring-0",
    isLight
      ? "border-black/15 text-[#1c1c1e] placeholder:text-slate-400"
      : "border-white/20 text-white placeholder:text-white/35",
    locked && "opacity-55"
  );
}

export function appleProSelectClass(isLight: boolean) {
  return cn(
    "h-11 w-full appearance-none border-0 border-b bg-transparent px-0 text-[16px] font-medium outline-none",
    isLight
      ? "border-black/15 text-[#1c1c1e]"
      : "border-white/20 text-white"
  );
}

export function appleProTextareaClass(isLight: boolean) {
  return cn(
    "min-h-[88px] w-full resize-none border-0 border-b bg-transparent px-0 py-2 text-[16px] font-medium leading-snug outline-none",
    isLight
      ? "border-black/15 text-[#1c1c1e] placeholder:text-slate-400"
      : "border-white/20 text-white placeholder:text-white/35"
  );
}

/** Selectable list row (trade / option) — no gray well */
export function AppleProOptionRow({
  active,
  isLight,
  onClick,
  children,
}: {
  active: boolean;
  isLight: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[52px] w-full items-center gap-3 border-0 border-b bg-transparent px-1 py-3 text-left transition-opacity",
        isLight ? "border-black/10" : "border-white/10",
        active ? "opacity-100" : "opacity-80 active:opacity-100"
      )}
    >
      {children}
      {active ? (
        <span className="ml-auto text-[13px] font-bold text-[#FF6B35]">✓</span>
      ) : null}
    </button>
  );
}

/** Fixed bottom bar: Back + Continue on same sheet color */
export function AppleProFooter({
  isLight,
  onBack,
  onNext,
  backLabel = "Back",
  nextLabel = "Continue",
  nextDisabled,
  nextBusy,
  hideBack,
}: {
  isLight: boolean;
  onBack?: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextBusy?: boolean;
  hideBack?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
      style={{ backgroundColor: proSheetBg(isLight) }}
    >
      <button
        type="button"
        disabled={nextDisabled || nextBusy}
        onClick={onNext}
        className="flex h-12 w-full items-center justify-center rounded-xl border-0 bg-[#323231] text-[16px] font-semibold text-white disabled:opacity-40"
      >
        {nextBusy ? "Please wait…" : nextLabel}
      </button>
      {!hideBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "h-10 w-full border-0 bg-transparent text-[15px] font-semibold",
            isLight ? "text-slate-600" : "text-white/60"
          )}
        >
          {backLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Scrollable body between title and footer */
export function AppleProBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-5 pb-2 scrollbar-hide",
        className
      )}
    >
      {children}
    </div>
  );
}
