"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import {
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
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  const fallback = backHref ?? defaultBackHref(accountType);

  useEffect(() => {
    setMount(document.getElementById("oga-mecho-phone"));
  }, []);

  const onBack = () => {
    navigateBack(router, fallback);
  };

  return (
    <>
      <header className="flex items-center gap-2 px-3 py-2.5">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border-0 transition-transform duration-150 active:scale-95",
              isLight ? "bg-slate-100 text-slate-700" : "bg-black text-white"
            )}
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
                isLight ? "text-slate-500" : "text-white/70"
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
            "flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent",
            isLight ? "text-black" : "text-white"
          )}
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
