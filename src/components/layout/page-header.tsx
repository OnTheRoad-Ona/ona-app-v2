"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import {
  clearPageExitClass,
  navigateBack,
  smartBackFallback,
} from "@/lib/navigation";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Secondary page chrome: optional back + title + hamburger menu */
export function PageHeader({
  title,
  subtitle,
  backHref,
  showBack = true,
  backOpensMenu = false,
  titleClassName,
  titleStyle,
}: {
  title: string;
  subtitle?: string;
  /**
   * Fallback when there is no useful previous page in the stack.
   * Defaults from current route + role (e.g. Job details → /jobs).
   */
  backHref?: string;
  /** Hide back control (e.g. Professional Dashboard home) */
  showBack?: boolean;
  /** Back opens the ☰ three-line menu list instead of history back */
  backOpensMenu?: boolean;
  /** Optional title color/class (e.g. brand orange for Dashboard) */
  titleClassName?: string;
  titleStyle?: CSSProperties;
}) {
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  const fallback =
    backHref?.trim() ||
    smartBackFallback(pathname, accountType);

  useEffect(() => {
    setMount(document.getElementById("oga-mecho-phone"));
    // Never leave shell dimmed/shifted if a prior back animation was interrupted
    clearPageExitClass();
  }, []);

  const onBack = () => {
    clearPageExitClass();
    // Prefer explicit backHref (e.g. Settings → role home) over menu-open trap
    if (backOpensMenu && !backHref?.trim()) {
      setMenuOpen(true);
      return;
    }
    navigateBack(router, fallback, accountType);
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
              isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
            )}
            style={{
              backgroundColor: isLight ? "#c8c9cd" : "#000000",
            }}
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
              titleClassName ||
                (isLight ? "text-slate-900" : "text-white")
            )}
            style={titleStyle}
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
            isLight ? "bg-[#c8c9cd] text-black" : "bg-black text-white"
          )}
          style={{
            backgroundColor: isLight ? "#c8c9cd" : "#000000",
          }}
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
