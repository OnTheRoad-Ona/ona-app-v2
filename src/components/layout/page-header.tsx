"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import {
  clearPageExitClass,
  defaultBackHref,
  navigateBack,
} from "@/lib/navigation";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Secondary page chrome: optional back + title + hamburger menu */
export function PageHeader({
  title,
  subtitle,
  backHref,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  /**
   * Fallback only when there is no previous page in history
   * (e.g. opened this screen from a cold link). Defaults by role.
   */
  backHref?: string;
  /** Hide back control (e.g. Professional Dashboard home) */
  showBack?: boolean;
}) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  // Fallback is always Home when history has no previous page
  const fallback = backHref ?? defaultBackHref();

  useEffect(() => {
    setMount(document.getElementById("oga-mecho-phone"));
    // Never leave shell dimmed/shifted if a prior back animation was interrupted
    clearPageExitClass();
  }, []);

  const onBack = () => {
    clearPageExitClass();
    navigateBack(router, fallback);
  };

  return (
    <>
      <header
        className={cn(
          "flex items-center gap-2 px-3 py-2.5",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
        style={{ backgroundColor: isLight ? "#c8c9cd" : "#000000" }}
      >
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border-0 transition-transform duration-150 active:scale-95",
              isLight
                ? "bg-transparent text-slate-800"
                : "bg-[#1c1c1e] text-white"
            )}
            style={isLight ? undefined : { backgroundColor: "#1c1c1e" }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-1" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              "truncate text-base font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={cn(
                "truncate text-[11px]",
                isLight ? "text-slate-500" : "text-[#a1a1a6]"
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border-0",
            isLight ? "bg-transparent text-black" : "bg-[#1c1c1e] text-white"
          )}
          style={isLight ? undefined : { backgroundColor: "#1c1c1e" }}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </header>

      {mount &&
        createPortal(
          <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />,
          mount
        )}
    </>
  );
}
