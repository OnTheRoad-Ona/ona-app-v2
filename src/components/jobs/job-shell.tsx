"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Job flow chrome — same solid stage as the rest of the app
 * (light #c8c9cd / dark black). No glass, no double panels.
 */
export function JobShell({
  isLight,
  title,
  subtitle,
  onBack,
  children,
  footer,
  fullBleed,
}: {
  isLight: boolean;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  fullBleed?: boolean;
}) {
  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", stage)}>
      <header className="relative z-10 shrink-0 flex items-start gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-0",
              isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
            )}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1 pt-1">
          <h1 className={cn("text-[22px] font-black tracking-tight", ink)}>
            {title}
          </h1>
          {subtitle && (
            <p className={cn("mt-0.5 text-[13px] font-medium", muted)}>
              {subtitle}
            </p>
          )}
        </div>
      </header>

      <div
        className={cn(
          "relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide",
          fullBleed ? "px-0" : "px-4 pb-6"
        )}
      >
        {children}
      </div>

      {footer && (
        <div
          className={cn(
            "relative z-20 shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
            stage
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

/** Solid content block on the main stage — no glass / transparency */
export function JobCard({
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
        "rounded-2xl p-4",
        isLight
          ? "bg-[#bebfc4] text-slate-900"
          : "bg-[#141414] text-white",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CopperButton({
  children,
  onClick,
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-0 bg-[#e07a3d] text-[15px] font-black text-white transition active:scale-[0.99] disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  isLight,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  isLight: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center rounded-2xl border-0 text-[14px] font-bold transition",
        isLight
          ? "bg-black/10 text-slate-900"
          : "bg-white/10 text-white",
        className
      )}
    >
      {children}
    </button>
  );
}
