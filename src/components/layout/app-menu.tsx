"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Briefcase,
  Clock3,
  History,
  Home,
  LogOut,
  Settings,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { useNotificationsOptional } from "@/components/notifications/notification-provider";
import { MESSAGE_ORANGE } from "@/lib/map-trade-icons";
import { defaultBackHref, resetNavStack } from "@/lib/navigation";
import { useApp } from "@/lib/store";
import {
  isProService,
  PRO_SERVICE_LABELS,
  PRO_TRADE_OPTIONS,
} from "@/lib/services";
import type { AccountType, ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Trade glyph + orange accents (My Service) */
const TRADE_ICON_GLYPH = "#e85a12";
const LINE_ACCENT = "#e85a12";

function TradeIcon({ service }: { service: ProService }) {
  const opt = PRO_TRADE_OPTIONS.find((t) => t.id === service);
  const Icon = opt?.icon ?? Wrench;
  return (
    <Icon
      className="h-4 w-4 shrink-0"
      strokeWidth={2.2}
      style={{ color: TRADE_ICON_GLYPH }}
      aria-hidden
    />
  );
}

/** Settings sits in the same list arrangement as other menu items (not inside Profile).
 *  Messages removed from ☰ — chat only via active request/job.
 *  Notifications opens the Notification Center (text + unread badge).
 */
const CLIENT_NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/history", label: "History", icon: History },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const PRO_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Wrench },
  { href: "/jobs", label: "Jobs", icon: Clock3 },
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
    isLocating,
  } = useApp();
  const isLight = theme === "light";
  const isPro =
    accountType === "professional" ||
    (accountType == null && userMode === "professional");
  const nav = isPro ? PRO_NAV : CLIENT_NAV;
  const notif = useNotificationsOptional();
  const unread = notif?.unreadCount ?? 0;
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
      setWarn("You don't have a Motorist account yet.");
      return;
    }
    if (type === "professional" && !hasProAccount) {
      setSignupTarget("professional");
      setWarn(
        "You don't have a Repair Pro account yet. Finish signup to go Live and receive jobs."
      );
      return;
    }

    setWarn(null);
    setSignupTarget(null);
    setSwitching(true);
    try {
      const result = await switchAccount(type);
      if (result === null) {
        // Only “Use as” switches roles — reset stack so Back stays in this role
        resetNavStack(homeForRole(type));
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
            ? "You don't have a Repair Pro account yet. Finish signup to go Live and receive jobs."
            : "You don't have a Motorist account yet."
        );
        return;
      }
      setWarn(typeof result === "string" ? result : "Could not switch.");
    } finally {
      setSwitching(false);
    }
  };

  if (!open) return null;

  // Immediate place name only (e.g. "Dr. Frank Okafor Cl, Lekki, Lagos")
  const placeLine = (location.label || "").trim();

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
    <div
      className="absolute inset-0 z-[100] flex max-h-full max-w-full overflow-hidden"
      role="dialog"
      aria-modal
    >
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/45 transition-opacity duration-200"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative z-10 flex h-full max-h-full w-[min(75%,300px)] max-w-full flex-col overflow-hidden animate-[om-sheet-up_0.22s_ease-out]",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1 pr-2">
            {/* Signed-in: greeting + full name. Guest: Ona brand */}
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
              <p
                className="whitespace-nowrap text-[28px] font-black tracking-tight leading-none"
                aria-label="Ona"
              >
                <span className="text-[#FF6B35]">O</span>
                <span className={isLight ? "text-black" : "text-[#C8C9CD]"}>
                  na
                </span>
              </p>
            )}
            <div className="mt-2.5 min-w-0">
              <p
                className={cn(
                  "min-w-0 text-[11px] font-semibold leading-snug",
                  isLight ? "text-slate-800" : "text-white/85"
                )}
              >
                {isLocating
                  ? "Updating location…"
                  : placeLine || "Getting your address…"}
              </p>
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
            const roleHome = defaultBackHref(accountType);
            const isHomeItem =
              href === "/" || href === "/dashboard" || href === roleHome;
            const active = isHomeItem
              ? pathname === "/" || pathname === "/dashboard"
              : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <button
                key={href + label}
                type="button"
                onClick={() => {
                  onClose();
                  // Home/Dashboard: reset stack so Back never traps on Settings
                  if (isHomeItem) {
                    resetNavStack(href);
                    router.replace(href);
                    return;
                  }
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

          {/* Notifications — same icon row as Home / History / Profile / Settings */}
          <button
            type="button"
            onClick={() => {
              onClose();
              notif?.openCenter();
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-sm font-semibold transition-colors",
              isLight ? "text-slate-700" : "text-white/90"
            )}
          >
            <Bell className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span className="min-w-0 flex-1">Notifications</span>
            {unread > 0 ? (
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                style={{
                  backgroundColor: MESSAGE_ORANGE,
                }}
                aria-label={`${unread} unread`}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>

          {/* Role block — solid orange line demarcation */}
          <div className="mt-5 px-1 pt-3">
            <div
              className="mb-3 h-px w-full"
              style={{ backgroundColor: LINE_ACCENT }}
              aria-hidden
            />
            {isPro && proServices.length > 0 && (
              <div className="mb-4">
                {/* Line 1: same size as Dashboard / Jobs / Profile */}
                <div
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold",
                    isLight ? "text-slate-700" : "text-white/90"
                  )}
                >
                  <Briefcase className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <span className="min-w-0 flex-1">My Service</span>
                </div>
                {/* Line 2: trade name + skill icon far right (glassy soft orange plate) */}
                <div className="mt-0.5 flex w-full items-center gap-3 px-3 py-1.5">
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-sm font-semibold",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    {SERVICE_LABELS[proServices[0]] ?? proServices[0]}
                  </span>
                  {isProService(proServices[0]) ? (
                    <TradeIcon service={proServices[0]} />
                  ) : (
                    <TradeIcon service="mechanic" />
                  )}
                </div>
              </div>
            )}
            <p
              className={cn(
                "mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wide",
                isLight ? "text-slate-700" : "text-white/70"
              )}
            >
              Use as
            </p>
            <div
              className={cn(
                "grid grid-cols-2 gap-1 rounded-xl p-1",
                isLight ? "bg-[#bebfc4]" : "bg-[#1c1c1e]",
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
                  // Same solid stage as Motorist / Repair Pro app chrome
                  isLight
                    ? "bg-[#c8c9cd] text-slate-900"
                    : "bg-black text-white"
                )}
                role="alert"
              >
                <p
                  className={cn(
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  {warn}
                </p>
                {signupTarget && (
                  <button
                    type="button"
                    className="mt-1.5 border-0 bg-transparent p-0 text-[11px] font-bold text-[#e85a12] underline"
                    onClick={() => {
                      onClose();
                      router.push(
                        signupTarget === "professional"
                          ? "/signup/pro?from=menu&next=/dashboard"
                          : "/signup/motorist?from=menu&next=/"
                      );
                    }}
                  >
                    Sign Up here
                  </button>
                )}
                {warn.includes("Log in") && (
                  <button
                    type="button"
                    className="mt-1.5 border-0 bg-transparent p-0 text-[11px] font-bold text-[#e85a12] underline"
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
                  "mt-1.5 px-2 text-[10px] font-medium leading-snug",
                  isLight ? "text-slate-700" : "text-white/70"
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
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold shadow-none ring-0 outline-none",
              // Soft red fill + red text — no border / ring
              isLight
                ? "bg-red-500/18 text-red-700 hover:bg-red-500/28"
                : "bg-red-500/20 text-red-300 hover:bg-red-500/30"
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
