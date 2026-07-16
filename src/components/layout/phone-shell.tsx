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
 * App chrome — content is locked to a single viewport-sized frame.
 * Prevents UI from “lapping” / spilling outside the app bounds.
 *
 * - Mobile: full screen, overflow clipped
 * - Desktop (sm+): centered 390px phone mock
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
        "box-border flex w-full items-stretch justify-center overflow-hidden",
        // Lock outer stage to one viewport — no page growth
        "h-[100vh] max-h-[100vh] w-full",
        "h-[100dvh] max-h-[100dvh]",
        "h-[100svh] max-h-[100svh]",
        "px-0 py-0 sm:items-center sm:px-3 sm:py-3",
        isLight ? "bg-[#060d0a]" : "bg-[#0a0605]"
      )}
    >
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative box-border flex w-full flex-col overflow-hidden",
          // Fixed height chain so children cannot expand the shell
          "h-full max-h-full min-h-0",
          "max-w-full",
          // Desktop phone mock
          "sm:h-[min(844px,calc(100dvh-1.5rem))] sm:max-h-[min(844px,calc(100dvh-1.5rem))] sm:max-w-[390px] sm:shadow-[0_24px_48px_rgba(0,0,0,0.65)]",
          isLight ? "bg-[#c8c9cd]" : "bg-black",
          className
        )}
        style={{
          width: "100%",
          // Keep safe-area inside the height (border-box), not outside it
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
        onDoubleClick={onDoubleClick}
      >
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
          {children}
          <AcceptTripPopup />
          <IncomingJobPopup />
        </div>
      </div>
    </div>
  );
}
