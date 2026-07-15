"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return (
    <div
      className={cn(
        "relative flex min-h-full flex-col",
        isLight
          ? "bg-gradient-to-b from-[#f4f6fa] via-[#eef1f6] to-[#e8ecf3]"
          : "bg-gradient-to-b from-[#0b1220] via-[#0f172a] to-[#0a0f1a]"
      )}
    >
      {/* Copper glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% -10%, rgba(224,122,61,0.35), transparent)",
        }}
      />

      <header className="relative z-10 flex items-start gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-0",
              isLight
                ? "bg-white/80 text-slate-800 shadow-sm backdrop-blur"
                : "bg-white/10 text-white backdrop-blur"
            )}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1 pt-1">
          <h1
            className={cn(
              "text-[22px] font-black tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={cn(
                "mt-0.5 text-[13px] font-medium",
                isLight ? "text-slate-500" : "text-white/55"
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </header>

      <div
        className={cn(
          "relative z-10 flex-1",
          fullBleed ? "px-0" : "px-4 pb-4"
        )}
      >
        {children}
      </div>

      {footer && (
        <div
          className={cn(
            "sticky bottom-0 z-20 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl",
            isLight
              ? "border-black/5 bg-white/85"
              : "border-white/10 bg-[#0b1220]/90"
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

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
          ? "border border-white/60 bg-white/75 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl"
          : "border border-white/10 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl",
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
        "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-0 bg-[#e07a3d] text-[15px] font-black text-white shadow-lg shadow-[#e07a3d]/30 transition active:scale-[0.99] disabled:opacity-50",
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
          ? "bg-slate-900/8 text-slate-900"
          : "bg-white/10 text-white",
        className
      )}
    >
      {children}
    </button>
  );
}
