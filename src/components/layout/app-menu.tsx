"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Clock3,
  Home,
  LogOut,
  MessageCircle,
  Moon,
  Sun,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { cn } from "@/lib/utils";

const CLIENT_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/requests", label: "Requests", icon: Clock3 },
  { href: "/bookings", label: "Bookings", icon: Briefcase },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

const PRO_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Wrench },
  { href: "/orders", label: "Orders", icon: Briefcase },
  { href: "/requests", label: "Jobs", icon: Clock3 },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

const SERVICE_LABELS = PRO_SERVICE_LABELS;

export function AppMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter(); // logout
  const {
    theme,
    location,
    toggleTheme,
    userMode,
    accountType,
    registeredAs,
    proServices,
  } = useApp();
  const isLight = theme === "light";
  // Mode locked to account type — pros cannot enter client home
  const isPro =
    accountType === "professional" ||
    (accountType == null && userMode === "professional");
  const nav = isPro ? PRO_NAV : CLIENT_NAV;

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
          isLight ? "bg-white" : "bg-black"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <div>
            <p className="text-[18px] font-black tracking-tight whitespace-nowrap">
              <span className="text-[#e85a12]">Oga</span>
              <span className={isLight ? "text-slate-900" : "text-white"}>
                Mecho
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
              isLight ? "bg-slate-100 text-slate-700" : "bg-black text-white"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Account type badge — no free switch (pro stays pro; motorist stays client) */}
        <div className="px-3 pb-3">
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-center text-[12px] font-bold",
              isLight ? "bg-slate-100 text-slate-700" : "bg-white/10 text-white"
            )}
          >
            {isPro ? "Professional account" : "Motorist account"}
            <p
              className={cn(
                "mt-0.5 text-[10px] font-medium",
                isLight ? "text-slate-500" : "text-white/55"
              )}
            >
              {isPro
                ? "You can only use professional pages"
                : "You can only use client pages"}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href + label}
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

          {/* One skill only — display, no add */}
          {isPro && proServices.length > 0 && (
            <div className="mt-3 px-1">
              <p
                className={cn(
                  "mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wide",
                  isLight ? "text-slate-400" : "text-white/45"
                )}
              >
                Your skill (1 only)
              </p>
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-[12px] font-semibold",
                  isLight
                    ? "bg-orange-50 text-[#e85a12]"
                    : "bg-[#e85a12]/15 text-[#e85a12]"
                )}
              >
                {SERVICE_LABELS[proServices[0]] ?? proServices[0]}
                {registeredAs === proServices[0] ? " · primary" : ""}
              </div>
            </div>
          )}
        </nav>

        <div className="space-y-2 px-3 pb-4">
          <button
            type="button"
            onClick={() => {
              toggleTheme();
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold",
              isLight
                ? "bg-slate-100 text-slate-800"
                : "bg-white/10 text-white"
            )}
          >
            {isLight ? (
              <>
                <Moon className="h-4 w-4" />
                Dark mode
              </>
            ) : (
              <>
                <Sun className="h-4 w-4" />
                Light mode
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/logout");
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold",
              isLight
                ? "bg-red-50 text-red-600"
                : "bg-red-500/15 text-red-400"
            )}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>
    </div>
  );
}
