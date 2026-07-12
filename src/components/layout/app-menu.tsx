"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Clock3,
  Home,
  MessageCircle,
  Settings,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/requests", label: "Requests", icon: Clock3 },
  { href: "/bookings", label: "Bookings", icon: Briefcase },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/dashboard", label: "Tech Dashboard", icon: Wrench },
] as const;

export function AppMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { theme, location } = useApp();
  const isLight = theme === "light";

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[100] flex" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/45 border-0"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative z-10 flex h-full w-[78%] max-w-[280px] flex-col shadow-2xl",
          isLight ? "bg-white" : "matte-metal"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <div>
            <p className="text-[18px] font-black tracking-tight">
              <span className="text-[#e85a12]">OGA</span>{" "}
              <span className={isLight ? "text-slate-900" : "text-white"}>
                MECHO
              </span>
            </p>
            <p
              className={cn(
                "mt-1 text-[11px]",
                isLight ? "text-slate-500" : "text-white/70"
              )}
            >
              {location.city} · {location.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg border-0",
              isLight ? "bg-slate-100 text-slate-700" : "matte-metal-inset text-white"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "metallic-orange text-white"
                    : isLight
                      ? "text-slate-700 hover:bg-slate-100"
                      : "text-white/90 hover:bg-white/10"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "px-4 py-3 text-[10px]",
            isLight ? "text-slate-400" : "text-white/55"
          )}
        >
          <p className="flex items-center gap-2 font-medium">
            <Settings className="h-3.5 w-3.5" />
            Double-tap empty space for light / dark
          </p>
        </div>
      </aside>
    </div>
  );
}
