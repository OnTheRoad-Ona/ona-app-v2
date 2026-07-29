"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Show OnTheRoad for 20s every 3 minutes while Home stays mounted */
const BRAND_CYCLE_MS = 3 * 60 * 1000;
const BRAND_FLASH_MS = 20 * 1000;

export function AppHeader() {
  const { theme } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  /** false = Ona · true = OnTheRoad (20s window) */
  const [showOnTheRoad, setShowOnTheRoad] = useState(false);

  useEffect(() => {
    setMount(document.body);
  }, []);

  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    let cycleTimer: ReturnType<typeof setInterval> | null = null;

    const flash = () => {
      setShowOnTheRoad(true);
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => setShowOnTheRoad(false), BRAND_FLASH_MS);
    };

    const first = setTimeout(() => {
      flash();
      cycleTimer = setInterval(flash, BRAND_CYCLE_MS);
    }, BRAND_CYCLE_MS);

    return () => {
      clearTimeout(first);
      if (flashTimer) clearTimeout(flashTimer);
      if (cycleTimer) clearInterval(cycleTimer);
    };
  }, []);

  const roadColor = isLight ? "#000000" : "#FFFFFF";
  const onaRest = isLight ? "text-black" : "text-white";

  return (
    <>
      <header className="shrink-0 px-3 pb-1 pt-5">
        <div className="flex items-center justify-between gap-3 pl-2">
          {/*
            Fixed box so Ona ↔ OnTheRoad never shifts layout.
            Crossfade both labels in place (soft / almost unnoticeable).
          */}
          <div
            className="relative h-8 w-[9.5rem] shrink-0"
            aria-label={showOnTheRoad ? "OnTheRoad" : "Ona"}
          >
            {/* Ona */}
            <p
              className={cn(
                "absolute inset-0 flex items-center text-[28px] font-black leading-none tracking-tight transition-opacity duration-500 ease-out",
                showOnTheRoad ? "opacity-0" : "opacity-100"
              )}
              aria-hidden={showOnTheRoad}
            >
              <span className="text-[#FF6B35]">O</span>
              <span className={onaRest}>na</span>
            </p>
            {/* OnTheRoad — same box, slightly smaller, fades in */}
            <p
              className={cn(
                "absolute inset-0 flex items-center text-[22px] font-black leading-none tracking-tight transition-opacity duration-500 ease-out",
                showOnTheRoad ? "opacity-100" : "opacity-0"
              )}
              aria-hidden={!showOnTheRoad}
            >
              <span className="text-[#FF6B35]">OnThe</span>
              <span style={{ color: roadColor }}>Road</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-0",
              isLight ? "bg-[#c8c9cd]" : "bg-black"
            )}
            style={{
              backgroundColor: isLight ? "#c8c9cd" : "#000000",
            }}
            aria-label={t("home.openMenu")}
            aria-expanded={menuOpen}
          >
            <Menu
              className="h-[18px] w-[18px]"
              strokeWidth={2.35}
              style={{ color: "#FF6B35" }}
            />
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
