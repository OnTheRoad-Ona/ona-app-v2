"use client";

import { useCallback, type MouseEvent, type ReactNode } from "react";
import { AcceptTripPopup } from "@/components/home/accept-trip-popup";
import { IncomingJobPopup } from "@/components/home/incoming-job-popup";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

/** True when the event target is an interactive control — not free space. */
function isInteractiveTarget(el: HTMLElement): boolean {
  const tag = el.tagName?.toLowerCase();
  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "option" ||
    tag === "button" ||
    tag === "a" ||
    tag === "label" ||
    el.isContentEditable
  ) {
    return true;
  }

  if (
    el.closest(
      "input, textarea, select, option, button, a, label, [contenteditable='true'], [contenteditable=''], [role='textbox'], [role='button'], [role='tab'], [role='link'], [role='menuitem'], [role='switch'], [role='checkbox'], [role='slider']"
    )
  ) {
    return true;
  }

  return false;
}

/**
 * App chrome:
 * - Real phones / narrow viewports: full-screen (no desktop “phone frame” gaps)
 * - Wide desktops: centered phone mock (max 390px)
 *
 * Height uses vh + dvh + svh fallbacks so older mobile WebViews never get height:0.
 */
export function PhoneShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { theme, toggleTheme } = useApp();
  const isLight = theme === "light";

  const onDoubleClick = useCallback(
    (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (isInteractiveTarget(el)) return;
      const sel =
        typeof window !== "undefined" ? window.getSelection()?.toString() : "";
      if (sel && sel.length > 0) return;
      toggleTheme();
    },
    [toggleTheme]
  );

  return (
    <div
      className={cn(
        // Outer stage — full bleed on mobile, padded frame on sm+
        "box-border flex w-full items-stretch justify-center",
        "min-h-[100vh] min-h-[100dvh] min-h-[100svh]",
        "px-0 py-0 sm:items-center sm:px-3 sm:py-3",
        isLight ? "bg-[#060d0a]" : "bg-[#0a0605]"
      )}
    >
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-none",
          // Mobile: fill the real screen (critical for phone browsers & in-app WebViews)
          "h-[100vh] h-[100dvh] h-[100svh] max-h-none max-w-none",
          // Desktop: phone mock
          "sm:h-[min(844px,calc(100dvh-1.5rem))] sm:max-h-[min(844px,calc(100dvh-1.5rem))] sm:max-w-[390px]",
          isLight ? "bg-[#c8c9cd]" : "bg-black",
          className
        )}
        style={{
          // Avoid inline width on mobile so full width works; desktop caps at 390
          width: "100%",
          maxWidth: "100%",
          // Safe area for notched phones (iOS)
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: undefined,
        }}
        onDoubleClick={onDoubleClick}
      >
        {/* Desktop-only shadow via class would need media query; apply in CSS for sm+ */}
        <div
          className={cn(
            "relative flex min-h-0 min-h-full flex-1 flex-col",
            "sm:shadow-[0_24px_48px_rgba(0,0,0,0.65)]"
          )}
          style={{
            // Force a real height chain for children (flex-1)
            height: "100%",
            minHeight: "100%",
          }}
        >
          {children}
          <AcceptTripPopup />
          <IncomingJobPopup />
        </div>
      </div>
    </div>
  );
}
