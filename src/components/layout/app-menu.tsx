"use client";

import { useEffect, useState } from "react";
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

function homeForRole(type: AccountType): string {
  return type === "professional" ? "/dashboard" : "/";
}

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
    proServices,
    hasMotoristAccount,
    hasProAccount,
    switchAccount,
    isAuthenticated,
    displayName,
    userProfile,
  } = useApp();
  const isLight = theme === "light";
  const isPro =
    accountType === "professional" ||
    (accountType == null && userMode === "professional");
  const nav = isPro ? PRO_NAV : CLIENT_NAV;
  const [warn, setWarn] = useState<string | null>(null);
  const [signupTarget, setSignupTarget] = useState<AccountType | null>(null);

  const fullNameDisplay = (
    userProfile?.fullName ||
    displayName ||
    ""
  ).trim();

  const timeGreeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  })();

  // Location stays stagnant in the menu (GPS refreshes in store every 10 min)
  useEffect(() => {
    if (!open) return;
    setWarn(null);
    setSignupTarget(null);
  }, [open]);

  const [switching, setSwitching] = useState(false);

  const onSwitch = async (type: AccountType) => {
    // Already on this role → only navigate to its home page
    if (
      (type === "motorist" && accountType === "motorist") ||
      (type === "professional" && accountType === "professional")
    ) {
      onClose();
      router.replace(homeForRole(type));
      return;
    }

    if (!isAuthenticated) {
      setWarn("Log in to switch between Motorist and Repair Pro.");
      setSignupTarget(null);
      return;
    }

    // Must complete signup for the target role before switching
    if (type === "motorist" && !hasMotoristAccount) {
      setSignupTarget("motorist");
      setWarn(
        "Sign up as Motorist first so your account is saved to the database."
      );
      return;
    }
    if (type === "professional" && !hasProAccount) {
      setSignupTarget("professional");
      setWarn(
        "Sign up as Repair Pro first so your skill and profile are saved to the database."
      );
      return;
    }

    setWarn(null);
    setSignupTarget(null);
    setSwitching(true);
    try {
      const result = await switchAccount(type);
      if (result === null) {
        onClose();
        router.replace(homeForRole(type));
        return;
      }
      if (result === "needs_login") {
        setWarn("Log in to switch between Motorist and Repair Pro.");
        return;
      }
      if (result === "needs_signup") {
        setSignupTarget(type);
        setWarn(
          type === "professional"
            ? "Sign up as Repair Pro first so your skill and profile are saved to the database."
            : "Sign up as Motorist first so your account is saved to the database."
        );
        return;
      }
      setWarn(typeof result === "string" ? result : "Could not switch.");
    } finally {
      setSwitching(false);
    }
  };

  if (!open) return null;

  const placeLine = [location.label, location.city]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" · ");

  const useAsBtnClass = (active: boolean) =>
    cn(
      "rounded-lg border-0 px-2 py-2.5 text-[12px] font-bold transition-colors",
      active
        ? "bg-[#323231] text-white shadow-sm"
        : isLight
          ? "bg-transparent text-slate-700 hover:bg-[#b0b1b6]/60"
          : "bg-transparent text-white/85 hover:bg-white/10"
    );

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
          "relative z-10 flex h-full w-[75%] max-w-none flex-col shadow-2xl",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1 pr-2">
            {/* Signed-in: greeting + full name. Guest: OgaMecho brand */}
            {isAuthenticated && fullNameDisplay ? (
              <div className="min-w-0 space-y-0.5">
                <p
                  className={cn(
                    "text-[16px] font-black leading-tight tracking-tight",
                    isLight ? "text-black" : "text-white"
                  )}
                >
                  {timeGreeting}
                </p>
                <p
                  className={cn(
                    "truncate text-[13px] font-semibold leading-snug",
                    isLight ? "text-slate-700" : "text-white/75"
                  )}
                >
                  {fullNameDisplay}
                </p>
              </div>
            ) : (
              <p className="whitespace-nowrap text-[18px] font-black tracking-tight">
                <span className="text-[#e85a12]">Oga</span>
                <span className={isLight ? "text-black" : "text-white"}>
                  Mecho
                </span>
              </p>
            )}
            <div className="mt-2.5 min-w-0">
              <div
                className={cn(
                  "flex items-start gap-1 text-[10px] leading-snug",
                  isLight ? "text-slate-600" : "text-white/70"
                )}
              >
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
                <p className="min-w-0 font-medium">
                  {placeLine || "Current location"}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent",
              isLight ? "text-black" : "text-white"
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
              <button
                key={href + label}
                type="button"
                onClick={() => {
                  onClose();
                  // Instant client navigation — no full document reload
                  router.push(href);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                  active
                    ? isLight
                      ? "text-[#e85a12]"
                      : "text-[#ffb07a]"
                    : isLight
                      ? "text-slate-700"
                      : "text-white/90"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                {label}
              </button>
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
                My Service
              </p>
              <p className="px-2 py-1 text-[12px] font-semibold text-[#e85a12]">
                {SERVICE_LABELS[proServices[0]] ?? proServices[0]}
              </p>
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
                isLight ? "bg-[#bebfc4]/80" : "bg-white/10",
                switching && "opacity-70 pointer-events-none"
              )}
              role="group"
              aria-label="Switch account type"
              aria-busy={switching}
            >
              <button
                type="button"
                disabled={switching}
                onClick={() => void onSwitch("motorist")}
                className={useAsBtnClass(accountType === "motorist")}
                aria-current={accountType === "motorist" ? "true" : undefined}
              >
                {switching && accountType !== "motorist" ? "…" : "Motorist"}
              </button>
              <button
                type="button"
                disabled={switching}
                onClick={() => void onSwitch("professional")}
                className={useAsBtnClass(accountType === "professional")}
                aria-current={
                  accountType === "professional" ? "true" : undefined
                }
              >
                {switching && accountType !== "professional"
                  ? "…"
                  : "Repair Pro"}
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
                {signupTarget && (
                  <button
                    type="button"
                    className="mt-1.5 border-0 bg-transparent p-0 text-[11px] font-bold text-brand underline"
                    onClick={() => {
                      onClose();
                      router.push(
                        signupTarget === "professional"
                          ? "/signup/pro?from=menu&next=/dashboard"
                          : "/signup/motorist?from=menu&next=/"
                      );
                    }}
                  >
                    {signupTarget === "professional"
                      ? "Start Repair Pro signup"
                      : "Start Motorist signup"}
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
                Tap to Switch
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
              // Same color set as dark toggle for both themes
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-red-500/15 px-3 py-2.5 text-sm font-semibold text-red-400"
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
