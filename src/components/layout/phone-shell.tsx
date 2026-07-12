"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

/**
 * Phone-width app on pure black stage.
 * Double-click free space toggles theme — never steals input selection.
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

  const onDoubleClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;

    // Never intercept form controls / editable text
    const tag = el.tagName?.toLowerCase();
    if (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      el.isContentEditable
    ) {
      return;
    }
    if (
      el.closest(
        "input, textarea, select, option, [contenteditable='true'], [contenteditable=''], label, button, a, [role='textbox']"
      )
    ) {
      return;
    }
    // Don't toggle if user is selecting text
    const sel = typeof window !== "undefined" ? window.getSelection()?.toString() : "";
    if (sel && sel.length > 0) return;

    toggleTheme();
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
          isLight ? "bg-white" : "bg-black",
          className
        )}
        style={{
          width: "min(390px, calc(100vw - 1.5rem))",
          boxShadow: "0 24px 48px rgba(0,0,0,0.55)",
        }}
        onDoubleClick={onDoubleClick}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
