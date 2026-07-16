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
 * Fixed phone app frame (390 × ≤844). Expanding the browser only grows the
 * dark stage around the app — the panel never stretches wider or taller.
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
        "px-3 py-3",
        isLight ? "bg-[#060d0a]" : "bg-[#0a0605]"
      )}
    >
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative box-border flex flex-col overflow-hidden",
          "w-[390px] max-w-[calc(100vw-1.5rem)]",
          // Cap height so a tall browser does not stretch the app into a desktop page
          "h-[min(844px,calc(100dvh-1.5rem))] max-h-[min(844px,calc(100dvh-1.5rem))]",
          "h-[min(844px,calc(100svh-1.5rem))] max-h-[min(844px,calc(100svh-1.5rem))]",
          "shadow-[0_24px_48px_rgba(0,0,0,0.55)]",
          isLight ? "bg-[#c8c9cd]" : "bg-black",
          className
        )}
        style={{
          width: "min(390px, calc(100vw - 1.5rem))",
          maxWidth: "min(390px, calc(100vw - 1.5rem))",
          height: "min(844px, calc(100dvh - 1.5rem))",
          maxHeight: "min(844px, calc(100dvh - 1.5rem))",
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
