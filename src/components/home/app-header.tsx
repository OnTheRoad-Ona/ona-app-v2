"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Menu } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const { location, isLocating, theme } = useApp();
  const isLight = theme === "light";
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMount(document.getElementById("oga-mecho-phone"));
  }, []);

  return (
    <>
      <header className="shrink-0 px-3 pb-0.5 pt-1">
        <div className="flex items-center justify-between gap-2">
          <div className="leading-[0.9]">
            <p className="text-[17px] font-black tracking-tight">
              <span className="text-[#e85a12]">OGA</span>
              <br />
              <span className={isLight ? "text-slate-900" : "text-white"}>
                MECHO
              </span>
            </p>
          </div>

          <button
            type="button"
            className="flex flex-col items-center text-center"
            aria-label={`Location: ${location.city}, ${location.label}`}
          >
            <span
              className={cn(
                "flex items-center gap-1 text-[11px] font-semibold",
                isLight ? "text-slate-800" : "text-white"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isLocating ? "animate-pulse bg-amber-400" : "bg-emerald-500"
                )}
              />
              {location.city}
              <ChevronDown
                className={cn(
                  "h-3 w-3",
                  isLight ? "text-slate-400" : "text-white/70"
                )}
                aria-hidden
              />
            </span>
            <span
              className={cn(
                "text-[10px]",
                isLight ? "text-slate-500" : "text-white/75"
              )}
            >
              {location.label}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border-0",
              isLight ? "bg-slate-100 text-slate-700" : "bg-black text-white"
            )}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
      </header>

      {mount &&
        createPortal(
          <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />,
          mount
        )}
    </>
  );
}
