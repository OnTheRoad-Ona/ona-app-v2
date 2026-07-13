"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Login / signup fill — original sheet gray (not landing/brand copper):
 * #C8C9CD · RGB(200, 201, 205)
 *
 * Field well — soft cool gray, clearly an input, not pure white, not invisible:
 * #E2E3E7 fill · #9A9EA6 border
 *
 * Primary CTA — wheel gray as "Continue to sign up": #323231
 */
export const AUTH_BG = "#C8C9CD";
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

/**
 * Visible text boxes on the sheet: soft gray well + clear border.
 * Same cool family as AUTH_BG, but light enough to read as inputs.
 */
export const authFieldClass =
  "h-11 w-full rounded-xl border border-[#9A9EA6] bg-[#E2E3E7] px-3.5 text-[14px] font-medium text-[#1e293b] outline-none placeholder:text-[#6b7280] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] focus:border-[#6B7280] focus:bg-[#E8E9ED] focus:ring-0";

export const authLabelClass =
  "mb-1.5 block text-[12px] font-semibold text-[#475569]";

/**
 * Primary CTA dark gray — exact match for "Continue to sign up" / "Next".
 * Class `om-cta-dark-gray` is defined in globals.css with !important.
 * #323231 · RGB(50, 50, 49)
 */
export const authPrimaryBtnClass = "om-cta-dark-gray gap-1.5";

/** Inline styles as a second lock (same dark gray as Continue to sign up) */
export const authPrimaryBtnStyle: CSSProperties = {
  backgroundColor: "#323231",
  backgroundImage: "none",
  color: "#ffffff",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
};

export const authSecondaryBtnClass =
  "h-11 w-full rounded-lg border-0 bg-black/10 text-[14px] font-semibold text-[#1e293b]";

export const authBackBtnClass =
  "mb-3 inline-flex items-center gap-0.5 border-0 bg-transparent p-0 text-[13px] font-semibold text-[#1e293b]";
