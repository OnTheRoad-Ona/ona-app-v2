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
import type { AccountType } from "@/lib/types";
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
  const router = useRouter();
  const {
    theme,
    location,
    toggleTheme,
    userMode,
    accountType,
    registeredAs,
    proServices,
    hasMotoristAccount,
    hasProAccount,
    switchAccount,
    isAuthenticated,
  } = useApp();
  const isLight = theme === "light";
  const isPro =
    accountType === "professional" ||
    (accountType == null && userMode === "professional");
  const nav = isPro ? PRO_NAV : CLIENT_NAV;

  const onSwitch = (type: AccountType) => {
    if (type === "motorist" && accountType === "motorist") {
      onClose();
      return;
    }
    if (type === "professional" && accountType === "professional") {
      onClose();
      return;
    }

    const result = switchAccount(type);
    if (result === null) {
      onClose();
      router.replace(type === "professional" ? "/dashboard" : "/");
      return;
    }
    if (result === "needs_signup") {
      onClose();
      router.push(type === "professional" ? "/signup/pro" : "/signup/motorist");
      return;
    }
    onClose();
    router.push("/login/signin");
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[100] flex" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/45"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative z-10 flex h-full w-[78%] max-w-[280px] flex-col shadow-2xl",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <div>
            <p className="whitespace-nowrap text-[18px] font-black tracking-tight">
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
              isLight ? "bg-[#bebfc4] text-slate-700" : "bg-black text-white"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                      ? "text-slate-700 hover:bg-[#bebfc4]/70"
                      : "text-white/90 hover:bg-white/10"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                {label}
              </Link>
            );
          })}

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

          {/* Use as — below Profile nav, above theme/logout */}
          <div className="mt-4 px-1">
            <p
              className={cn(
                "mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wide",
                isLight ? "text-slate-400" : "text-white/45"
              )}
            >
              Use as
            </p>
            <div
              className={cn(
                "grid grid-cols-2 gap-1 rounded-xl p-1",
                isLight ? "bg-[#bebfc4]/80" : "bg-white/10"
              )}
              role="group"
              aria-label="Switch account type"
            >
              <button
                type="button"
                onClick={() => onSwitch("motorist")}
                className={cn(
                  "rounded-lg border-0 px-2 py-2 text-[12px] font-bold transition-colors",
                  accountType === "motorist"
                    ? "bg-[#323231] text-white shadow-sm"
                    : isLight
                      ? "bg-transparent text-slate-600"
                      : "bg-transparent text-white/75"
                )}
              >
                Motorist
                {!hasMotoristAccount && (
                  <span className="mt-0.5 block text-[9px] font-medium opacity-80">
                    Sign up
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onSwitch("professional")}
                className={cn(
                  "rounded-lg border-0 px-2 py-2 text-[12px] font-bold transition-colors",
                  accountType === "professional"
                    ? "bg-[#323231] text-white shadow-sm"
                    : isLight
                      ? "bg-transparent text-slate-600"
                      : "bg-transparent text-white/75"
                )}
              >
                Repair Pro
                {!hasProAccount && (
                  <span className="mt-0.5 block text-[9px] font-medium opacity-80">
                    Sign up
                  </span>
                )}
              </button>
            </div>
            <p
              className={cn(
                "mt-1.5 px-2 text-[10px] leading-snug",
                isLight ? "text-slate-500" : "text-white/55"
              )}
            >
              {isAuthenticated
                ? "You can be both. Each needs its own signup. Switch here anytime."
                : "Sign up or log in for Motorist and Repair Pro separately."}
            </p>
          </div>
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
                ? "bg-[#bebfc4] text-slate-800"
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
