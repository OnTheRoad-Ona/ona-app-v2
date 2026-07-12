"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const { theme } = useApp();
  const isLight = theme === "light";
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMount(document.getElementById("oga-mecho-phone"));
  }, []);

  return (
    <>
      {/* Logo inset from left edge; extra top space */}
      <header className="shrink-0 px-3 pb-1 pt-5">
        <div className="flex items-center justify-between gap-3 pl-2">
          <p className="text-[17px] font-black tracking-tight whitespace-nowrap leading-none">
            <span className="text-[#e85a12]">Oga</span>
            <span className={isLight ? "text-slate-900" : "text-white"}>
              Mecho
            </span>
          </p>

          {/* Menu lines sized/aligned to sit level with the logo */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-0",
              isLight
                ? "bg-slate-100 text-slate-700"
                : "bg-white/10 text-white"
            )}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={2.35} />
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
