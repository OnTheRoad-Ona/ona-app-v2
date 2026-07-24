"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  title,
  isLight,
  children,
}: {
  title: string;
  isLight: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mb-1">
      <p
        className={cn(
          "px-2 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em]",
          isLight ? "text-slate-600" : "text-white/55"
        )}
      >
        {title}
      </p>
      {/* Flat on main page stage — no intermediate card fill */}
      <div className="overflow-hidden bg-transparent">{children}</div>
    </section>
  );
}

export function SettingsRow({
  icon: Icon,
  label,
  detail,
  href,
  onClick,
  trailing,
  isLight,
  danger,
  first: _first,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  detail?: string;
  href?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  isLight: boolean;
  danger?: boolean;
  /** Kept for call-site compatibility — dividers removed by design */
  first?: boolean;
}) {
  void _first;
  const body = (
    <>
      {Icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center">
          <Icon
            className={cn(
              "h-4 w-4",
              danger ? "text-red-500" : "text-brand"
            )}
            strokeWidth={2.2}
          />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[14px] font-semibold",
            danger
              ? "text-red-600"
              : isLight
                ? "text-slate-900"
                : "text-white"
          )}
        >
          {label}
        </span>
        {detail ? (
          <span
            className={cn(
              "mt-0.5 block text-[11px] font-medium leading-snug",
              isLight ? "text-slate-600" : "text-white/65"
            )}
          >
            {detail}
          </span>
        ) : null}
      </span>
      {trailing ?? (
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0",
            isLight ? "text-slate-500" : "text-white/40"
          )}
        />
      )}
    </>
  );

  // Compact rows on main toggle background (no card chrome)
  const className = cn(
    "flex w-full items-center gap-2 border-0 px-2 py-2.5 text-left bg-transparent",
    isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.04]"
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        onClick={() => onClick?.()}
      >
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

export function SettingsField({
  label,
  children,
  isLight,
  hint,
}: {
  label: string;
  children: ReactNode;
  isLight: boolean;
  hint?: string;
}) {
  return (
    <label className="block px-3 py-2">
      <span
        className={cn(
          "mb-1 block text-[11px] font-semibold",
          isLight ? "text-slate-600" : "text-white/65"
        )}
      >
        {label}
      </span>
      {children}
      {hint ? (
        <span
          className={cn(
            "mt-1 block text-[10px] font-medium",
            isLight ? "text-slate-500" : "text-white/45"
          )}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function settingsInputClass(isLight: boolean) {
  return cn(
    "h-10 w-full rounded-md border-0 px-3 text-[13px] font-medium outline-none",
    isLight
      ? "bg-black/[0.06] text-slate-900 placeholder:text-slate-500"
      : "bg-white/[0.08] text-white placeholder:text-white/40"
  );
}

export function SettingsComingSoon({
  isLight,
  title,
}: {
  isLight: boolean;
  title: string;
}) {
  return (
    <div
      className={cn(
        "px-3 py-4 text-center text-[12px] font-medium bg-transparent",
        isLight ? "text-slate-600" : "text-white/60"
      )}
    >
      {title} — coming soon
    </div>
  );
}

export function SettingsSaveBar({
  isLight,
  busy,
  msg,
  err,
  onSave,
  label = "Save changes",
}: {
  isLight: boolean;
  busy?: boolean;
  msg?: string | null;
  err?: string | null;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div className="space-y-2 px-3 pb-3 pt-1">
      {err ? (
        <p className="text-[11px] font-semibold text-red-500">{err}</p>
      ) : null}
      {msg ? (
        <p className="text-[11px] font-semibold text-emerald-600">{msg}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="flex h-11 w-full items-center justify-center rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}

/** Session scroll restore for Settings hub (and nested lists if keyed) */
export const SETTINGS_SCROLL_KEY = "ona-settings-scroll-y";

export function saveSettingsScroll(el: HTMLElement | null) {
  if (!el) return;
  try {
    sessionStorage.setItem(SETTINGS_SCROLL_KEY, String(el.scrollTop));
  } catch {
    /* */
  }
}

export function restoreSettingsScroll(el: HTMLElement | null) {
  if (!el) return;
  try {
    const y = Number(sessionStorage.getItem(SETTINGS_SCROLL_KEY) || "0");
    if (Number.isFinite(y) && y > 0) {
      // Double rAF so layout finishes before jump
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = y;
        });
      });
    }
  } catch {
    /* */
  }
}
