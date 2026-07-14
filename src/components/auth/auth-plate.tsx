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
 * Login text-box standard — same for Motorist, Repair Pro, Log In, Admin.
 * `!` Tailwind + `om-auth-field` CSS force the gray well (no white override).
 * #E2E3E7 fill · #9A9EA6 border · h-10 · rounded-md · 13px
 */
export const authFieldClass =
  "om-auth-field h-10 w-full rounded-md border !border-[#9A9EA6] !bg-[#E2E3E7] px-3 text-[13px] font-medium !text-[#0f172a] outline-none placeholder:!text-[#6b7280] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] focus:!border-[#6B7280] focus:!bg-[#E8E9ED] focus:ring-0";

/** Same as authFieldClass with left padding for an icon */
export const authFieldIconClass =
  "om-auth-field h-10 w-full rounded-md border !border-[#9A9EA6] !bg-[#E2E3E7] py-0 pl-9 pr-3 text-[13px] font-medium !text-[#0f172a] outline-none placeholder:!text-[#6b7280] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] focus:!border-[#6B7280] focus:!bg-[#E8E9ED] focus:ring-0";

/** Country / select sibling of Motorist phone row */
export const authSelectClass =
  "om-auth-field h-10 shrink-0 rounded-md border !border-[#9A9EA6] !bg-[#E2E3E7] px-1.5 text-[11px] font-semibold !text-[#0f172a] outline-none focus:!border-[#6B7280]";

/** Multiline field matching login wells */
export const authTextareaClass =
  "om-auth-field min-h-[72px] w-full resize-none rounded-md border !border-[#9A9EA6] !bg-[#E2E3E7] px-3 py-2.5 text-[13px] font-medium leading-relaxed !text-[#0f172a] outline-none placeholder:!text-[#6b7280] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] focus:!border-[#6B7280] focus:!bg-[#E8E9ED] focus:ring-0";

/** Inline style twin — use when a field still paints white */
export const authFieldStyle: CSSProperties = {
  backgroundColor: "#E2E3E7",
  borderColor: "#9A9EA6",
  color: "#0f172a",
  boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.05)",
};

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
