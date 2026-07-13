"use client";

import { cn } from "@/lib/utils";

/**
 * Login / signup fill — solid mid-copper sampled from brand metal field:
 * #8B5534 · RGB(139, 85, 52)
 *
 * Wheel gray — measured from brand tire ring:
 * #323231 · RGB(50, 50, 49)
 */
export const AUTH_BG = "#8B5534";
export const WHEEL_GRAY = "#323231";

export function AuthPlate({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        className
      )}
      style={{ backgroundColor: AUTH_BG }}
    >
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export const authFieldClass =
  "h-11 w-full rounded-xl border-0 bg-white/70 px-3.5 text-[14px] font-medium text-[#1e293b] outline-none placeholder:text-[#64748b] focus:bg-white focus:ring-2 focus:ring-[#e85a12]/25";

export const authLabelClass =
  "mb-1.5 block text-[12px] font-semibold text-[#475569]";

/** Primary CTA — OgaMecho wheel gray (#323231) */
export const authPrimaryBtnClass =
  "h-11 w-full rounded-lg border-0 bg-[#323231] text-[14px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] disabled:opacity-40 active:brightness-95";

export const authPrimaryBtnStyle = {
  backgroundColor: WHEEL_GRAY,
  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
} as const;

export const authSecondaryBtnClass =
  "h-11 w-full rounded-lg border-0 bg-black/10 text-[14px] font-semibold text-[#1e293b]";

export const authBackBtnClass =
  "mb-3 inline-flex items-center gap-0.5 border-0 bg-transparent p-0 text-[13px] font-semibold text-[#1e293b]";
