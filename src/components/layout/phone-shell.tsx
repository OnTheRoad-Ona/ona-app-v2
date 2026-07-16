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
 * Always present as a mobile app frame (max ~390px), not a full desktop site.
 * Full height of the viewport; content scrolls inside the frame only.
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
        "box-border flex w-full items-center justify-center overflow-hidden",
        "h-[100vh] max-h-[100vh]",
        "h-[100dvh] max-h-[100dvh]",
        "h-[100svh] max-h-[100svh]",
        // Tiny padding on large screens so it still feels like an app, not a website
        "px-0 py-0 sm:px-3 sm:py-3",
        isLight ? "bg-[#060d0a]" : "bg-[#0a0605]"
      )}
    >
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative box-border flex w-full flex-col overflow-hidden",
          // Always app-width (never full desktop layout)
          "h-full max-h-full min-h-0",
          "max-w-[390px]",
          "shadow-[0_24px_48px_rgba(0,0,0,0.55)]",
          isLight ? "bg-[#c8c9cd]" : "bg-black",
          className
        )}
        style={{
          width: "min(390px, 100%)",
          maxWidth: "min(390px, 100vw)",
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
