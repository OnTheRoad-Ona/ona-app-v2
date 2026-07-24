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
import { NewAccountBadge } from "@/components/profile/new-account-badge";
import { getArtisanProfile } from "@/lib/artisan/local-store";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { MESSAGE_ORANGE } from "@/lib/map-trade-icons";
import { defaultBackHref, resetNavStack } from "@/lib/navigation";
import { useApp } from "@/lib/store";
import { isProService, PRO_TRADE_OPTIONS } from "@/lib/services";
import type { AccountType, ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Trade glyph + orange accents (My Service) */
const TRADE_ICON_GLYPH = "#FF6B35";

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
const CLIENT_NAV: {
  href: string;
  labelKey: MessageKey;
  icon: typeof Home;
}[] = [
  { href: "/", labelKey: "nav.dashboard", icon: Home },
  { href: "/history", labelKey: "nav.history", icon: History },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound },
  { href: "/settings", labelKey: "menu.settings", icon: Settings },
];

const PRO_NAV: {
  href: string;
  labelKey: MessageKey;
  icon: typeof Home;
}[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: Wrench },
  { href: "/jobs", labelKey: "nav.jobs", icon: Clock3 },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound },
  { href: "/settings", labelKey: "menu.settings", icon: Settings },
];

/** Map pro trade id → i18n key so My Service follows chosen language */
const TRADE_LABEL_KEY: Record<ProService, MessageKey> = {
  mechanic: "trade.mechanic",
  vulcanizer: "trade.vulcanizer",
  towing: "trade.towing",
  battery: "trade.battery",
  ac: "trade.ac",
  body: "trade.body",
  electrical: "trade.electrical",
  diagnostics: "trade.diagnostics",
  wash: "trade.wash",
  plumber: "trade.plumber",
  carpenter: "trade.carpenter",
  painter: "trade.painter",
  solar: "trade.solar",
  generator: "trade.generator",
};

function homeForRole(type: AccountType): string {
  return type === "professional" ? "/dashboard" : "/";
}

/**
 * ☰ header: first + last name only (drop middle names).
 * "Chinedu James Okafor" → "Chinedu Okafor"; single token stays as-is.
 */
function firstAndLastName(full: string): string {
  const parts = full
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
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
  const t = useT();
  const {
    theme,
    userMode,
    accountType,
    proServices,
    hasMotoristAccount,
    hasProAccount,
    switchAccount,
    isAuthenticated,
    displayName,
    userProfile,
    backendUserId,
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

  const fullNameDisplay = firstAndLastName(
    userProfile?.fullName || displayName || ""
  );

  const timeGreeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t("menu.goodMorning");
    if (h < 17) return t("menu.goodAfternoon");
    return t("menu.goodEvening");
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
      setWarn(t("menu.needLogin"));
      setSignupTarget(null);
      return;
    }

    // Do not block on client-only dual flags here — switchAccount refreshes
    // from the server (vault alone was falsely saying "no Repair Pro account").
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
        setWarn(t("menu.needLogin"));
        return;
      }
      if (result === "needs_signup") {
        setSignupTarget(type);
        setWarn(
          type === "professional" ? t("menu.noPro") : t("menu.noMotorist")
        );
        return;
      }
      setWarn(typeof result === "string" ? result : t("menu.couldNotSwitch"));
    } finally {
      setSwitching(false);
    }
  };

  if (!open) return null;

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
      {/* Free ~20% stage (right): soft dim + brand mark — tap closes */}
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/50 transition-opacity duration-200"
        aria-label={t("menu.closeMenu")}
        onClick={onClose}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-[5] flex w-[20%] flex-col items-center justify-center gap-3 px-1"
        aria-hidden
      >
        <span className="select-none text-[22px] font-black tracking-tight leading-none opacity-90">
          <span className="text-[#FF6B35]">O</span>
          <span className="text-white/80">na</span>
        </span>
        <span className="max-w-[4.5rem] text-center text-[10px] font-semibold leading-snug text-white/55">
          {t("menu.tapToClose")}
        </span>
      </div>
      {/* 80% width drawer (X-style left rail); free 20% stays dimmed stage */}
      <aside
        className={cn(
          "relative z-10 flex h-full max-h-full w-[80%] max-w-full flex-col overflow-hidden animate-[om-sheet-up_0.22s_ease-out]",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex items-start justify-between px-4 pb-4 pt-5">
          <div className="min-w-0 flex-1 pr-2">
            {/* Signed-in: greeting + full name only (no street address). Guest: Ona brand */}
            {isAuthenticated && fullNameDisplay ? (
              <div className="min-w-0 space-y-1">
                <p
                  className={cn(
                    "text-[22px] font-black leading-tight tracking-tight",
                    isLight ? "text-black" : "text-white"
                  )}
                >
                  {timeGreeting}
                </p>
                <p
                  className={cn(
                    "flex flex-wrap items-center gap-1.5 text-[17px] font-semibold leading-snug",
                    isLight ? "text-slate-700" : "text-white/80"
                  )}
                >
                  <span className="truncate">{fullNameDisplay}</span>
                  {isPro ? (
                    <NewAccountBadge
                      visibilityTier={
                        getArtisanProfile(
                          userProfile?.identityId || backendUserId || ""
                        )?.visibilityTier ?? 1
                      }
                      status={
                        getArtisanProfile(
                          userProfile?.identityId || backendUserId || ""
                        )?.status
                      }
                      isProfessional
                      size="sm"
                    />
                  ) : null}
                </p>
              </div>
            ) : (
              <p
                className="whitespace-nowrap text-[32px] font-black tracking-tight leading-none"
                aria-label={t("brand.name")}
              >
                <span className="text-[#FF6B35]">O</span>
                <span className={isLight ? "text-black" : "text-[#C8C9CD]"}>
                  na
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent",
              isLight ? "text-black" : "text-white"
            )}
            aria-label={t("common.close")}
          >
            <X className="h-6 w-6" strokeWidth={2.2} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {nav.map(({ href, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const roleHome = defaultBackHref(accountType);
            const isHomeItem =
              href === "/" || href === "/dashboard" || href === roleHome;
            // Only the current page lights orange — never force Dashboard always-on
            const active = isHomeItem
              ? pathname === "/" ||
                pathname === "/dashboard" ||
                pathname === roleHome
              : pathname === href || pathname.startsWith(`${href}/`);
            const activeColor = isLight ? "text-[#FF6B35]" : "text-[#ffb07a]";
            const idleColor = isLight ? "text-slate-700" : "text-white/90";
            return (
              <button
                key={href + labelKey}
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
                  "flex w-full items-center gap-3.5 rounded-xl border-0 bg-transparent px-3 py-3.5 text-left text-[17px] font-semibold transition-colors",
                  active ? activeColor : idleColor
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6 shrink-0",
                    active ? activeColor : idleColor
                  )}
                  strokeWidth={2}
                />
                <span>{label}</span>
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
              "flex w-full items-center gap-3.5 rounded-xl border-0 bg-transparent px-3 py-3.5 text-left text-[17px] font-semibold transition-colors",
              isLight ? "text-slate-700" : "text-white/90"
            )}
          >
            <Bell className="h-6 w-6 shrink-0" strokeWidth={2} />
            <span className="min-w-0 flex-1">{t("menu.notifications")}</span>
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

          {/* Role block — no divider line (app-wide clean cards) */}
          <div className="mt-5 px-1 pt-3">
            {isPro && proServices.length > 0 && (
              <div className="mb-4">
                {/* Line 1: same size as Dashboard / Jobs / Profile */}
                <div
                  className={cn(
                    "flex w-full items-center gap-3.5 rounded-xl border-0 px-3 py-3.5 text-[17px] font-semibold",
                    isLight ? "text-slate-700" : "text-white/90"
                  )}
                >
                  <Briefcase className="h-6 w-6 shrink-0" strokeWidth={2} />
                  <span className="min-w-0 flex-1">{t("menu.myService")}</span>
                </div>
                {/* Line 2: trade name + skill icon far right (glassy soft orange plate) */}
                <div className="mt-0.5 flex w-full items-center gap-3 px-3 py-1.5">
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-sm font-semibold",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    {isProService(proServices[0])
                      ? t(TRADE_LABEL_KEY[proServices[0]])
                      : proServices[0]}
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
              {t("menu.useAs")}
            </p>
            <div
              className={cn(
                "grid grid-cols-2 gap-1 rounded-xl p-1",
                isLight ? "bg-[#bebfc4]" : "bg-[#1c1c1e]",
                switching && "opacity-70 pointer-events-none"
              )}
              role="group"
              aria-label={t("menu.switchRole")}
              aria-busy={switching}
            >
              <button
                type="button"
                disabled={switching}
                onClick={() => void onSwitch("motorist")}
                className={useAsBtnClass(accountType === "motorist")}
                aria-current={accountType === "motorist" ? "true" : undefined}
              >
                {switching && accountType !== "motorist"
                  ? "…"
                  : t("auth.motorist")}
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
                  : t("auth.pro")}
              </button>
            </div>
            {warn ? (
              <div
                className={cn(
                  "mt-2 rounded-lg px-2.5 py-2 text-[11px] font-medium leading-snug",
                  // Same solid stage as Customer / Repair Pro app chrome
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
                    className="mt-1.5 border-0 bg-transparent p-0 text-[11px] font-bold text-[#FF6B35] underline"
                    onClick={() => {
                      onClose();
                      router.push(
                        signupTarget === "professional"
                          ? "/signup/pro?from=menu&next=/dashboard"
                          : "/signup/motorist?from=menu&next=/"
                      );
                    }}
                  >
                    {t("menu.signUpHere")}
                  </button>
                )}
                {warn === t("menu.needLogin") && (
                  <button
                    type="button"
                    className="mt-1.5 border-0 bg-transparent p-0 text-[11px] font-bold text-[#FF6B35] underline"
                    onClick={() => {
                      onClose();
                      router.push("/login/signin");
                    }}
                  >
                    {t("menu.logIn")}
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
                {t("menu.tapToSwitch")}
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
            {t("menu.logOut")}
          </button>
        </div>
      </aside>
    </div>
  );
}
