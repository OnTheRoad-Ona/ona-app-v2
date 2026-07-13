"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

const TOAST_MS = 2200;

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
 * Double-click free space toggles background (light/dark) and shows a toast.
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
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTheme, setToastTheme] = useState<"light" | "dark">(theme);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const showThemeToast = useCallback(
    (next: "light" | "dark") => {
      setToastTheme(next);
      setToastVisible(true);
      clearHideTimer();
      hideTimer.current = setTimeout(() => {
        setToastVisible(false);
        hideTimer.current = null;
      }, TOAST_MS);
    },
    [clearHideTimer]
  );

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const onDoubleClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;

    // Only free space (not form controls, buttons, links, map markers, etc.)
    if (isInteractiveTarget(el)) return;

    // Don't toggle if user is selecting text
    const sel =
      typeof window !== "undefined" ? window.getSelection()?.toString() : "";
    if (sel && sel.length > 0) return;

    // Toggle background theme and show confirmation
    const next: "light" | "dark" = theme === "light" ? "dark" : "light";
    toggleTheme();
    showThemeToast(next);
  };

  return (
    <div className="box-border flex min-h-dvh w-full items-center justify-center bg-black px-3 py-3">
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-none",
          "h-[min(844px,calc(100dvh-1.5rem))]",
          "max-h-[min(844px,calc(100dvh-1.5rem))]",
          "max-w-[390px]",
          isLight ? "bg-[#e3e6ec]" : "bg-black",
          className
        )}
        style={{
          width: "min(390px, calc(100vw - 1.5rem))",
          boxShadow: "0 24px 48px rgba(0,0,0,0.55)",
        }}
        onDoubleClick={onDoubleClick}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>

        {/* Background toggle feedback — shown after free-space double-click */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-20 z-[200] flex justify-center px-4 transition-all duration-200",
            toastVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0"
          )}
          aria-live="polite"
          aria-atomic
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold shadow-lg",
              toastTheme === "light"
                ? "bg-white text-slate-800 ring-1 ring-slate-200/80"
                : "bg-[#2a2a2a] text-white ring-1 ring-white/10"
            )}
            role="status"
          >
            {toastTheme === "light" ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                Light background
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-sky-300" aria-hidden />
                Dark background
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
