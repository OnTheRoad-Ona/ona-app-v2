"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AcceptTripPopup } from "@/components/home/accept-trip-popup";
import { IncomingJobPopup } from "@/components/home/incoming-job-popup";
import { MotoristReleasePayGate } from "@/components/jobs/motorist-release-pay-gate";
import { DeletionBanner } from "@/components/profile/deletion-banner";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

/** Real controls / cards — never toggle theme when these are the target. */
const CONTROL_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "video",
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
].join(", ");

/**
 * Free space = anything that is not a real control or card.
 * Map tiles, headers, padding, empty list areas are free (Motorist home included).
 */
function isBlockedTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return true;
  const node = el instanceof HTMLElement ? el : el.parentElement;
  if (!node) return true;

  if (node.closest(CONTROL_SELECTOR)) return true;

  const tag = node.tagName?.toLowerCase();
  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "option" ||
    tag === "button" ||
    tag === "a" ||
    tag === "label" ||
    tag === "video" ||
    node.isContentEditable
  ) {
    return true;
  }

  return false;
}

/**
 * Fixed phone app frame. Double-click / double-tap free space fully toggles light/dark.
 *
 * Capture-phase native listeners so Motorist pages work: Google Maps and many
 * child handlers stop bubble-phase events that React onTouchEnd never sees.
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
  /** Phone frame interior — explicit colors avoid browser class lag */
  const phoneInterior = isLight ? "#c8c9cd" : "#000000";
  const lastTapRef = useRef(0);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const toggleThemeRef = useRef(toggleTheme);
  toggleThemeRef.current = toggleTheme;
  /** Suppress synthetic dblclick after touch double-tap (browser inconsistency) */
  const ignoreDblClickUntilRef = useRef(0);
  const togglingRef = useRef(false);

  useEffect(() => {
    // Listen on phone interior only — theme chrome inside the frame
    const phone = document.getElementById("ona-phone");
    if (!phone) return;

    const runToggle = () => {
      // Coalesce rapid double fires (touch + mouse) so interior doesn't land wrong
      if (togglingRef.current) return;
      togglingRef.current = true;
      toggleThemeRef.current();
      window.setTimeout(() => {
        togglingRef.current = false;
      }, 350);
    };

    const onDblClick = (e: MouseEvent) => {
      if (Date.now() < ignoreDblClickUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (isBlockedTarget(e.target)) return;
      // Only when click is inside phone frame
      if (!phone.contains(e.target as Node)) return;
      const sel = window.getSelection()?.toString();
      if (sel && sel.length > 0) {
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
      e.stopPropagation();
      runToggle();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isBlockedTarget(e.target)) {
        lastTapRef.current = 0;
        lastPointRef.current = null;
        return;
      }
      if (!phone.contains(e.target as Node)) return;
      // Multi-touch / pinch → ignore
      if (e.touches.length > 0 || e.changedTouches.length !== 1) {
        lastTapRef.current = 0;
        lastPointRef.current = null;
        return;
      }

      const t = e.changedTouches[0];
      const now = Date.now();
      const prev = lastTapRef.current;
      const prevPt = lastPointRef.current;
      const gap = now - prev;

      // Same spot double-tap (allow small finger drift)
      const near =
        prevPt != null &&
        Math.hypot(t.clientX - prevPt.x, t.clientY - prevPt.y) < 40;

      if (gap < 400 && gap > 25 && near) {
        lastTapRef.current = 0;
        lastPointRef.current = null;
        // Block the synthetic dblclick some browsers fire after double-tap
        ignoreDblClickUntilRef.current = now + 500;
        e.preventDefault();
        e.stopPropagation();
        runToggle();
        return;
      }

      lastTapRef.current = now;
      lastPointRef.current = { x: t.clientX, y: t.clientY };
    };

    // Capture + non-passive so map taps reach us and preventDefault works
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    phone.addEventListener("dblclick", onDblClick, opts);
    phone.addEventListener("touchend", onTouchEnd, opts);
    return () => {
      phone.removeEventListener("dblclick", onDblClick, opts);
      phone.removeEventListener("touchend", onTouchEnd, opts);
    };
  }, []);

  // Keep phone data-theme + paint in lockstep with React theme
  useEffect(() => {
    const phone = document.getElementById("ona-phone");
    if (!phone) return;
    phone.dataset.theme = theme;
    phone.style.backgroundColor = phoneInterior;
    // Inner content root inherits solid fill so pages don't flash wrong stage
    const inner = phone.firstElementChild as HTMLElement | null;
    if (inner) {
      inner.style.backgroundColor = phoneInterior;
    }
  }, [theme, phoneInterior]);

  return (
    <div
      id="ona-stage"
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
        id="ona-phone"
        data-theme={theme}
        className={cn(
          "relative box-border flex flex-col overflow-hidden",
          "w-[390px] max-w-[calc(100vw-1.5rem)]",
          "h-[min(844px,calc(100dvh-1.5rem))] max-h-[min(844px,calc(100dvh-1.5rem))]",
          "h-[min(844px,calc(100svh-1.5rem))] max-h-[min(844px,calc(100svh-1.5rem))]",
          "shadow-[0_24px_48px_rgba(0,0,0,0.55)]",
          className
        )}
        style={{
          width: "min(390px, calc(100vw - 1.5rem))",
          maxWidth: "min(390px, calc(100vw - 1.5rem))",
          height: "min(844px, calc(100dvh - 1.5rem))",
          maxHeight: "min(844px, calc(100dvh - 1.5rem))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingTop: "env(safe-area-inset-top, 0px)",
          backgroundColor: phoneInterior,
        }}
      >
        <div
          className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
          style={{ backgroundColor: phoneInterior }}
        >
          <DeletionBanner />
          {children}
          <AcceptTripPopup />
          <IncomingJobPopup />
          <MotoristReleasePayGate />
        </div>
      </div>
    </div>
  );
}
