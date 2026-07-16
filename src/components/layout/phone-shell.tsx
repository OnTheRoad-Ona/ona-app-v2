"use client";

import {
  useCallback,
  useRef,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { AcceptTripPopup } from "@/components/home/accept-trip-popup";
import { IncomingJobPopup } from "@/components/home/incoming-job-popup";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

/**
 * Free-space only: not buttons, links, inputs, cards, or other controls.
 * Empty padding, list gaps, and header chrome may toggle theme.
 */
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
    tag === "video" ||
    tag === "canvas" ||
    el.isContentEditable
  ) {
    return true;
  }

  // Cards + real controls — not plain text/padding/gaps
  if (
    el.closest(
      [
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "option",
        "label",
        "video",
        "canvas",
        "[contenteditable='true']",
        "[contenteditable='']",
        "[role='button']",
        "[role='link']",
        "[role='tab']",
        "[role='menuitem']",
        "[role='switch']",
        "[role='checkbox']",
        "[role='slider']",
        "[role='textbox']",
        "[role='combobox']",
        "[data-no-theme-toggle]",
        ".card-surface",
        "[data-card]",
      ].join(", ")
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Fixed phone app frame. Double-click / double-tap free space fully toggles light/dark.
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
  const lastTapRef = useRef(0);

  const tryToggleTheme = useCallback(
    (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return;
      if (isInteractiveTarget(el)) return;
      const sel =
        typeof window !== "undefined" ? window.getSelection()?.toString() : "";
      if (sel && sel.length > 0) return;
      toggleTheme();
    },
    [toggleTheme]
  );

  const onDoubleClick = useCallback(
    (e: MouseEvent) => {
      tryToggleTheme(e.target);
    },
    [tryToggleTheme]
  );

  /** Mobile: double-tap free space toggles theme */
  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || isInteractiveTarget(el)) {
        lastTapRef.current = 0;
        return;
      }
      const now = Date.now();
      if (now - lastTapRef.current < 320 && now - lastTapRef.current > 40) {
        lastTapRef.current = 0;
        tryToggleTheme(e.target);
        return;
      }
      lastTapRef.current = now;
    },
    [tryToggleTheme]
  );

  return (
    <div
      className={cn(
        "box-border flex w-full items-center justify-center overflow-hidden",
        "h-[100vh] max-h-[100vh]",
        "h-[100dvh] max-h-[100dvh]",
        "h-[100svh] max-h-[100svh]",
        "px-3 py-3",
        // Outer stage flips with full theme (green-black ↔ red-black)
        isLight ? "bg-[#060d0a]" : "bg-[#0a0605]"
      )}
      // Outer stage free space also toggles
      onDoubleClick={onDoubleClick}
      onTouchEnd={onTouchEnd}
    >
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative box-border flex flex-col overflow-hidden",
          "w-[390px] max-w-[calc(100vw-1.5rem)]",
          "h-[min(844px,calc(100dvh-1.5rem))] max-h-[min(844px,calc(100dvh-1.5rem))]",
          "h-[min(844px,calc(100svh-1.5rem))] max-h-[min(844px,calc(100svh-1.5rem))]",
          "shadow-[0_24px_48px_rgba(0,0,0,0.55)]",
          // App sheet flips with full theme (gray ↔ black)
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
        onTouchEnd={onTouchEnd}
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
