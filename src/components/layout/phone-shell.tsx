"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

/**
 * Phone app on pure black stage.
 * Dark mode shell = matte metallic blue (not flat paint).
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
    if (
      el.closest(
        "button, a, input, textarea, select, label, [role='button'], [role='tab'], [role='slider'], [contenteditable='true']"
      )
    ) {
      return;
    }
    toggleTheme();
  };

  return (
    <div className="box-border flex min-h-dvh w-full items-center justify-center bg-black px-3 py-3">
      <div
        id="oga-mecho-phone"
        className={cn(
          "relative flex w-full flex-col overflow-hidden",
          "h-[min(844px,calc(100dvh-1.5rem))]",
          "max-h-[min(844px,calc(100dvh-1.5rem))]",
          "max-w-[390px] rounded-[28px]",
          isLight ? "bg-white" : "matte-metal",
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
