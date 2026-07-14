"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Clock3,
  Home,
  LogOut,
  MapPin,
  MessageCircle,
  Settings,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Settings sits in the same list arrangement as other menu items (not inside Profile). */
const CLIENT_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/requests", label: "Requests", icon: Clock3 },
  { href: "/bookings", label: "Bookings", icon: Briefcase },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const PRO_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Wrench },
  { href: "/orders", label: "Orders", icon: Briefcase },
  { href: "/requests", label: "Jobs", icon: Clock3 },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
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
  const [warn, setWarn] = useState<string | null>(null);

  // Location stays stagnant in the menu (GPS refreshes in store every 10 min)
  useEffect(() => {
    if (!open) return;
    setWarn(null);
  }, [open]);

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
      setWarn(null);
      onClose();
      router.replace(type === "professional" ? "/dashboard" : "/");
      return;
    }
    if (result === "needs_signup") {
      const missing = type === "professional" ? "Repair Pro" : "Motorist";
      setWarn(
        `You don't have a ${missing} account yet. Sign up for ${missing} to switch.`
      );
      return;
    }
    if (result === "needs_login") {
      setWarn(
        type === "professional"
          ? "Log in to use your Repair Pro account."
          : "Log in to use your Motorist account."
      );
      return;
    }
    onClose();
    router.push("/login/signin");
  };

  if (!open) return null;

  const placeLine = [location.label, location.city]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" · ");

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
          // 75% of the phone width
          "relative z-10 flex h-full w-[75%] max-w-none flex-col shadow-2xl",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-2 pt-4">
          <div className="min-w-0 flex-1 pr-2">
            <p className="whitespace-nowrap text-[18px] font-black tracking-tight">
              <span className="text-[#e85a12]">Oga</span>
              <span className={isLight ? "text-slate-900" : "text-white"}>
                Mecho
              </span>
            </p>
            {/* Stagnant current location — no Updating… blink */}
            <div
              className={cn(
                "mt-2 flex items-start gap-1.5 text-[11px] leading-snug",
                isLight ? "text-slate-600" : "text-white/75"
              )}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              <p className="min-w-0 font-semibold">
                {placeLine || "Current location"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0",
              isLight ? "bg-[#bebfc4] text-slate-700" : "bg-white/10 text-white"
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
                Your skill
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
              </button>
            </div>
            {warn ? (
              <div
                className={cn(
                  "mt-2 rounded-lg px-2.5 py-2 text-[11px] font-medium leading-snug",
                  isLight
                    ? "bg-amber-50 text-amber-950"
                    : "bg-amber-500/15 text-amber-100"
                )}
                role="alert"
              >
                <p>{warn}</p>
                {warn.includes("don't have") && (
                  <button
                    type="button"
                    className="mt-1.5 border-0 bg-transparent p-0 text-[11px] font-bold text-brand underline"
                    onClick={() => {
                      onClose();
                      router.push(
                        warn.includes("Repair Pro")
                          ? "/signup/pro"
                          : "/signup/motorist"
                      );
                    }}
                  >
                    Sign up now
                  </button>
                )}
                {warn.includes("Log in") && (
                  <button
                    type="button"
                    className="mt-1.5 border-0 bg-transparent p-0 text-[11px] font-bold text-brand underline"
                    onClick={() => {
                      onClose();
                      router.push("/login/signin");
                    }}
                  >
                    Log in
                  </button>
                )}
              </div>
            ) : (
              <p
                className={cn(
                  "mt-1.5 px-2 text-[10px] leading-snug",
                  isLight ? "text-slate-500" : "text-white/55"
                )}
              >
                {hasMotoristAccount && hasProAccount
                  ? "Both accounts ready. Switch anytime."
                  : isAuthenticated
                    ? "Sign up for the other role to switch."
                    : "Sign up or log in for each role separately."}
              </p>
            )}
          </div>

        </nav>

        <div className="px-3 pb-4 pt-1">
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
