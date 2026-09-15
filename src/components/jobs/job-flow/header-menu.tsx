"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import { cn } from "@/lib/utils";

/** ☰ header button (same look as the Dashboard) portaled into the phone shell.
 * Self-contained so opening the menu never re-renders the whole job screen. */
export function HeaderMenu({ isLight }: { isLight: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMount(document.getElementById("ona-phone"));
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-0",
          isLight ? "bg-[#c8c9cd]" : "bg-black",
        )}
        style={{ backgroundColor: isLight ? "#c8c9cd" : "#000000" }}
        aria-label="Open menu"
        aria-expanded={menuOpen}
      >
        <Menu
          className="h-[18px] w-[18px]"
          strokeWidth={2.35}
          style={{ color: "#FF6B35" }}
        />
      </button>
      {mount &&
        createPortal(
          <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />,
          mount,
        )}
    </>
  );
}
