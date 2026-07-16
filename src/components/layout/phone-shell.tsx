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
 * Phone-width app on pure black stage.
 * Double-click free space toggles background (light/dark) — no toast popup.
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
        "box-border flex min-h-dvh w-full items-center justify-center px-3 py-3",
        isLight ? "bg-[#060d0a]" : "bg-[#0a0605]"
      )}
    >
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-none",
          "h-[min(844px,calc(100dvh-1.5rem))]",
          "max-h-[min(844px,calc(100dvh-1.5rem))]",
          "max-w-[390px]",
          isLight ? "bg-[#c8c9cd]" : "bg-black",
          className
        )}
        style={{
          width: "min(390px, calc(100vw - 1.5rem))",
          boxShadow: isLight
            ? "0 24px 48px rgba(6, 13, 10, 0.65)"
            : "0 24px 48px rgba(0, 0, 0, 0.75)",
        }}
        onDoubleClick={onDoubleClick}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          {children}
          <AcceptTripPopup />
          {/* Repair Pro: keep multi-motorist alerts even mid-job */}
          <IncomingJobPopup />
        </div>
      </div>
    </div>
  );
}
