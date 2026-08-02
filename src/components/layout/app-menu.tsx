"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  Bell,
  Briefcase,
  Clock3,
  Gift,
  History,
  Home,
  Loader2,
  LogOut,
  Settings,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";
import { useNotificationsOptional } from "@/components/notifications/notification-provider";
import { NewAccountBadge } from "@/components/profile/new-account-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getArtisanProfile } from "@/lib/artisan/local-store";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { useT } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n";
import { MESSAGE_ORANGE } from "@/lib/map-trade-icons";
import { defaultBackHref, resetNavStack } from "@/lib/navigation";
import { useApp } from "@/lib/store";
import { isProService, PRO_TRADE_OPTIONS } from "@/lib/services";
import type { AccountType, ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Trade glyph */
const TRADE_ICON_GLYPH = "#FF6B35";

function TradeIcon({ service }: { service: ProService }) {
  const opt = PRO_TRADE_OPTIONS.find((t) => t.id === service);
  const Icon = opt?.icon ?? Wrench;
  return (
    <Icon
      className="h-3.5 w-3.5 shrink-0"
      strokeWidth={2}
      style={{ color: TRADE_ICON_GLYPH }}
      aria-hidden
    />
  );
}

/** Settings sits in the same list arrangement as other menu items (not inside Profile).
 *  Messages removed from ☰ — chat only via active request/job.
 *  Notifications opens the Notification Center (text + unread badge).
 */
/** Customer: money setup lives under Settings (not side drawer). */
const CLIENT_NAV: {
  href: string;
  labelKey: MessageKey;
  icon: typeof Home;
}[] = [
  { href: "/", labelKey: "nav.dashboard", icon: Home },
  { href: "/history", labelKey: "nav.history", icon: History },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound },
  { href: "/wallet", labelKey: "nav.referralEarn", icon: Gift },
  { href: "/settings", labelKey: "menu.settings", icon: Settings },
];

/** Repair Pro: dedicated Payments & Payouts in the side bar → full hub. */
const PRO_NAV: {
  href: string;
  labelKey: MessageKey;
  icon: typeof Home;
}[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: Wrench },
  { href: "/jobs", labelKey: "nav.jobs", icon: Clock3 },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound },
  { href: "/wallet", labelKey: "nav.referralEarn", icon: Gift },
  { href: "/settings/payments", labelKey: "settings.hub.payments", icon: Banknote },
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
    userMode === "professional";
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

  /**
   * Drawer + capsule share one clock (MENU_MS). Stay mounted on exit so both
   * finish together — fixes capsule appearing early / “paused” open.
   * Ona X stays removed. Chip row is separate (data-menu-open).
   */
  const MENU_MS = 200;
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, MENU_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  // Signal menu state to home panel for chip row slide
  useEffect(() => {
    const phone = document.getElementById("ona-phone");
    if (!phone) return;
    if (open) {
      phone.dataset.menuOpen = "true";
    } else {
      delete phone.dataset.menuOpen;
    }
  }, [open]);

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

  if (!mounted) return null;

  const useAsBtnClass = (active: boolean) =>
    cn(
      "rounded-lg border-0 px-2 py-2.5 text-[12px] font-bold transition-colors",
      active
        ? "bg-[#323231] text-white shadow-sm"
        : isLight
          ? "bg-transparent text-slate-700 hover:bg-[#b0b1b6]/60"
          : "bg-transparent text-white/85 hover:bg-white/10"
    );

  const rowIdle = isLight ? "text-slate-800" : "text-white/90";
  const rowActive = "text-[#FF6B35]";

  /*
   * Shared open geometry (light ≡ dark) — no layer lapping:
   *   left  80% = solid theme drawer + dim under it only
   *   right 20% = capsule rail (pill + close hit)
   * ONE chrome transform moves drawer + capsule together (not separate anims).
   */
  return (
    <div
      className="om-x-menu absolute inset-0 z-[100] max-h-full max-w-full overflow-hidden bg-transparent"
      role="dialog"
      aria-modal
    >
      {/*
        Single sliding unit: dim + drawer + capsule rail share one transform.
        Capsule is a window over the page — separate rail fade left it “paused”.
      */}
      <div
        className={cn(
          "om-x-chrome absolute inset-0",
          exiting ? "om-x-chrome-out" : "om-x-chrome-in"
        )}
      >
      {/* Dim only under the solid menu (never under the capsule rail) */}
      <button
        type="button"
        className={cn(
          "om-x-dim absolute bottom-0 left-0 top-0 z-[1] border-0",
          isLight ? "bg-black/15" : "bg-black/30"
        )}
        aria-label={t("menu.closeMenu")}
        onClick={onClose}
      />
      {/* Solid theme sidebar — left extension only (not curved out) */}
      <aside
        className={cn(
          "om-x-drawer absolute bottom-0 left-0 top-0 z-10 flex flex-col",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex items-start pl-3 pr-4 pb-3 pt-2">
          <div className="min-w-0 flex-1">
            {isAuthenticated && fullNameDisplay ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                  <AvatarImage
                    src={userProfile?.avatarUrl || DEFAULT_VENDOR_PHOTO}
                    alt={fullNameDisplay}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-brand text-[13px] font-bold text-white">
                    {avatarInitials(fullNameDisplay)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-[12px] font-semibold leading-tight",
                      isLight ? "text-slate-600" : "text-white/70"
                    )}
                  >
                    {timeGreeting}
                  </p>
                  <p
                    className={cn(
                      "flex flex-wrap items-center gap-1 text-[15px] font-bold leading-snug",
                      isLight ? "text-black" : "text-white"
                    )}
                  >
                    <span className="truncate">{fullNameDisplay}</span>
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
                      size="sm"
                      className="text-[8px] leading-none tracking-normal"
                    />
                  </p>
                </div>
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
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 pt-3 scrollbar-hide">
          {nav.map(({ href, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const roleHome = defaultBackHref(accountType);
            const isHomeItem =
              href === "/" || href === "/dashboard" || href === roleHome;
            const isPaymentsItem = href === "/settings/payments";
            const isSettingsRoot = href === "/settings";
            const active = isHomeItem
              ? pathname === "/" ||
                pathname === "/dashboard" ||
                pathname === roleHome
              : isPaymentsItem
                ? pathname === "/settings/payments" ||
                  pathname.startsWith("/settings/payments/")
                : isSettingsRoot
                  ? pathname === "/settings" ||
                    (pathname.startsWith("/settings/") &&
                      !pathname.startsWith("/settings/payments"))
                  : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <button
                key={href + labelKey}
                type="button"
                onClick={() => {
                  onClose();
                  if (isHomeItem) {
                    resetNavStack(href);
                    router.replace(href);
                    return;
                  }
                  router.push(href);
                }}
                className={cn(
                  "flex w-full items-center gap-3 border-0 bg-transparent px-3 py-3.5 text-left text-[17px] font-semibold transition-colors",
                  active ? rowActive : rowIdle
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6 shrink-0",
                    active ? rowActive : rowIdle
                  )}
                  strokeWidth={2}
                />
                <span>{label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              onClose();
              notif?.openCenter();
            }}
            className={cn(
              "flex w-full items-center gap-3 border-0 bg-transparent px-3 py-3.5 text-left text-[17px] font-semibold transition-colors",
              rowIdle
            )}
          >
            <Bell className={cn("h-6 w-6 shrink-0", rowIdle)} strokeWidth={2} />
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

          <div className="mt-5 px-1 pt-3">
            {isPro && proServices.length > 0 && (
              <div className="mb-3">
                <div
                  className={cn(
                    "flex w-full items-center gap-2 border-0 px-3 py-2 text-[13px] font-semibold",
                    rowIdle
                  )}
                >
                  <Briefcase className="h-4 w-4 shrink-0" strokeWidth={2} />
                  <span className="min-w-0 flex-1">{t("menu.myService")}</span>
                </div>
                <div className="mt-0.5 flex w-full items-center gap-2 px-3 py-1">
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[12px] font-medium",
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
                isLight ? "text-slate-600" : "text-white/55"
              )}
            >
              {t("menu.useAs")}
            </p>
            {hasMotoristAccount && hasProAccount ? (
              <p
                className={cn(
                  "mb-1.5 px-2 text-[11px] font-bold",
                  isLight ? "text-[#FF6B35]" : "text-[#FF6B35]"
                )}
              >
                Dual Role
                {userProfile?.primaryAccountType === "professional"
                  ? " · Professional Role first"
                  : userProfile?.primaryAccountType === "motorist"
                    ? " · Customer Role first"
                    : ""}
              </p>
            ) : null}
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
                className={cn(
                  useAsBtnClass(accountType === "motorist"),
                  switching && "relative"
                )}
                aria-current={accountType === "motorist" ? "true" : undefined}
              >
                {switching && accountType !== "motorist" ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-[#FF6B35]"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    <span className="sr-only">Switching</span>
                  </span>
                ) : (
                  t("auth.motorist")
                )}
              </button>
              <button
                type="button"
                disabled={switching}
                onClick={() => void onSwitch("professional")}
                className={cn(
                  useAsBtnClass(accountType === "professional"),
                  switching && "relative"
                )}
                aria-current={
                  accountType === "professional" ? "true" : undefined
                }
              >
                {switching && accountType !== "professional" ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-[#FF6B35]"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    <span className="sr-only">Switching</span>
                  </span>
                ) : (
                  t("auth.pro")
                )}
              </button>
            </div>
            {warn ? (
              <div
                className={cn(
                  "mt-2 rounded-lg px-2.5 py-2 text-[11px] font-medium leading-snug",
                  isLight
                    ? "bg-black/10 text-slate-900"
                    : "bg-white/10 text-white"
                )}
                role="alert"
              >
                <p className={isLight ? "text-slate-900" : "text-white"}>
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
                          ? "/signup/pro?from=menu&attach=1&next=/dashboard"
                          : "/signup/motorist?from=menu&attach=1&next=/"
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
                  isLight ? "text-slate-600" : "text-white/55"
                )}
              >
                {t("menu.tapToSwitch")}
              </p>
            )}
          </div>
        </nav>

        <div
          className={cn(
            "shrink-0 border-t px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            isLight ? "border-black/10" : "border-white/10"
          )}
        >
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/logout");
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold shadow-none ring-0 outline-none",
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

      {/*
        Right capsule rail — exclusive strip (starts at 80%, no drawer overlap).
        Rides inside om-x-chrome so it slides with the drawer.
      */}
      <div className="om-x-rail pointer-events-none absolute z-20">
        <div className="om-x-capsule pointer-events-none absolute" aria-hidden />
        <button
          type="button"
          className="om-x-capsule-hit absolute z-[1] border-0 bg-transparent pointer-events-auto"
          aria-label={t("menu.closeMenu")}
          onClick={onClose}
        />
      </div>
      </div>
    </div>
  );
}
