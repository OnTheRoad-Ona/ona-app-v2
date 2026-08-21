"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, LogOut, Wrench } from "lucide-react";
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
import { isProService } from "@/lib/pro-service-id";
import { PRO_TRADE_OPTIONS } from "@/lib/services";
import type { AccountType, ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Trade glyph */
const TRADE_ICON_GLYPH = "#FF6B35";

type MenuIconName =
  | "dashboard"
  | "history"
  | "profile"
  | "referral"
  | "settings"
  | "jobs"
  | "payments"
  | "notifications"
  | "service"
  | "shop";

/**
 * Solid orange icons built with DIVs (not SVG).
 * SVG stroke/fill CSS kept fighting us; these cannot render as hollow outlines.
 */
function SolidMenuIcon({ name, isLight }: { name: MenuIconName; isLight: boolean }) {
  const cls = "h-5 w-5 shrink-0 text-[#FF6B35]";
  const bgCol = isLight ? "#c8c9cd" : "#000000";
  switch (name) {
    case "dashboard":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <rect x="3" y="3" width="8" height="8" rx="2" fill="#FF6B35" />
          <rect x="13" y="3" width="8" height="8" rx="2" fill="#FF6B35" />
          <rect x="3" y="13" width="8" height="8" rx="2" fill="#FF6B35" />
          <rect x="13" y="13" width="8" height="8" rx="2" fill="#FF6B35" />
        </svg>
      );
    case "history":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="#FF6B35" />
          <path d="M12 7v5l3.5 2.1" stroke={bgCol} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "profile":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      );
    case "referral":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.89-2-2-2zm-11-1c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zm6 0c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zm4 12H4v-2h16v2zm0-4H4v-2h16v2z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.44.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.04.64.09.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
      );
    case "jobs":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm10 15H4V8h16v11z" />
        </svg>
      );
    case "payments":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
        </svg>
      );
    case "notifications":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V10a6 6 0 1 0-12 0v6l-2 2v1h16v-1l-2-2z" />
        </svg>
      );
    case "service":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.5 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
        </svg>
      );
    case "shop":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="#FF6B35" aria-hidden>
          <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2zM7.16 14.26l.03-.12L8.1 12h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 3H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 14.37 5.48 16 7 16h12v-2H7.42c-.14 0-.25-.11-.26-.24z" />
        </svg>
      );
    default:
      return null;
  }
}

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
  icon: MenuIconName;
}[] = [
  { href: "/", labelKey: "nav.dashboard", icon: "dashboard" },
  { href: "/history", labelKey: "nav.history", icon: "history" },
  { href: "/profile", labelKey: "nav.profile", icon: "profile" },
  { href: "/wallet", labelKey: "nav.referralEarn", icon: "referral" },
  { href: "/settings", labelKey: "menu.settings", icon: "settings" },
  /** ONA Shop — full repair commerce (catalog, cart, checkout, orders) */
  { href: "/shop", labelKey: "nav.myShop", icon: "shop" },
];

/** Repair Pro: dedicated Payments & Payouts in the side bar → full hub. */
const PRO_NAV: {
  href: string;
  labelKey: MessageKey;
  icon: MenuIconName;
}[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
  { href: "/jobs", labelKey: "nav.jobs", icon: "jobs" },
  { href: "/profile", labelKey: "nav.profile", icon: "profile" },
  { href: "/wallet", labelKey: "nav.referralEarn", icon: "referral" },
  {
    href: "/settings/payments",
    labelKey: "settings.hub.payments",
    icon: "payments",
  },
  { href: "/settings", labelKey: "menu.settings", icon: "settings" },
  /** ONA Shop — same commerce engine as customers (Ona is seller) */
  { href: "/shop", labelKey: "nav.myShop", icon: "shop" },
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
  fashion: "trade.fashion",
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
    accountType,
    proServices,
    hasMotoristAccount,
    hasProAccount,
    switchAccount,
    isAuthenticated,
    displayName,
    userProfile,
    backendUserId,
    setCategory,
    setSelectedTechId,
  } = useApp();
  const isLight = theme === "light";
  /**
   * Menu role must follow active accountType only.
   * userMode can lag/mismatch dual-role and wrongly show Pro nav (or hide
   * customer-only placement). My Shop lives on both CLIENT_NAV and PRO_NAV.
   */
  const isPro = accountType === "professional";
  /**
   * Pro My Shop deep-link: single-trade Pros land directly inside their own
   * trade shop (e.g. /shop/c/solar). Multi-trade / customers stay general.
   */
  const myShopHref =
    isPro && proServices.length === 1
      ? `/shop/c/${proServices[0]}`
      : "/shop";
  const navBase = (isPro ? PRO_NAV : CLIENT_NAV).map((i) =>
    i.href === "/shop" ? { ...i, href: myShopHref } : i
  );
  /** Hard-guarantee My Shop is present for both roles (never drop the row). */
  const nav = navBase.some((i) => i.href === myShopHref)
    ? navBase
    : [
        ...navBase,
        {
          href: myShopHref,
          labelKey: "nav.myShop" as MessageKey,
          icon: "shop" as MenuIconName,
        },
      ];
  /** Active account first (left Use-as button when dual) */
  const useAsOrder: AccountType[] =
    hasMotoristAccount && hasProAccount
      ? accountType === "professional"
        ? ["professional", "motorist"]
        : ["motorist", "professional"]
      : ["motorist", "professional"];
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
      let result = await switchAccount(type);
      // Cold-start / navigation race: the very first tap can hit a session that
      // is still rehydrating (getSession empty) and fail; a manual re-tap then
      // succeeds. Absorb it here with ONE automatic retry so users never have
      // to tap twice. Real needs_* outcomes are not retried and surfaced as-is.
      if (
        result !== null &&
        result !== "needs_login" &&
        result !== "needs_signup"
      ) {
        try {
          const { ensureAppSession } = await import("@/lib/supabase/session");
          await ensureAppSession({ waitForSessionMs: 2200, forceRefresh: true });
        } catch {
          /* retry anyway */
        }
        result = await switchAccount(type);
      }
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

  const asBtnClass = (active: boolean) =>
    cn(
      "rounded-lg border-0 px-2 py-2 text-[12px] font-bold transition-colors",
      active
        ? "bg-[#323231] text-white"
        : isLight
          ? "bg-transparent text-black hover:bg-[#b0b1b6]/60"
          : "bg-transparent text-white/85 hover:bg-white/10"
    );

  /** Menu row labels: pure black (light) / white (dark) */
  const rowIdle = isLight ? "text-black" : "text-white";
  const rowActive = "text-[#FF6B35]";

  /** Solid orange DIV icons (Dashboard energy) — no SVG outline possible. */
  const renderMenuIcon = (name: MenuIconName) => (
    <span className="om-menu-icon-slot inline-flex shrink-0" aria-hidden>
      <SolidMenuIcon name={name} isLight={isLight} />
    </span>
  );

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
          isLight ? "bg-transparent" : "bg-black/30"
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
        <div className="flex shrink-0 items-start pl-3 pr-4 pb-2.5 pt-5">
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
                <div className="min-w-0 space-y-0.5">
                  <p
                    className={cn(
                      "text-[12px] font-semibold leading-tight",
                      isLight ? "text-black" : "text-white/70"
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

        <nav className="min-h-0 flex-1 space-y-0 overflow-y-auto overflow-x-hidden px-2 pb-1 pt-2.5 scrollbar-hide">
          {nav.map(({ href, labelKey, icon }) => {
            // Fallback label if i18n key missing (must never blank the My Shop row)
            const label =
              labelKey === "nav.myShop"
                ? t(labelKey) || "My Shop"
                : t(labelKey);
            const roleHome = defaultBackHref(accountType);
            const isHomeItem =
              href === "/" || href === "/dashboard" || href === roleHome;
            const isPaymentsItem = href === "/settings/payments";
            const isSettingsRoot = href === "/settings";
            const isShopItem = href === myShopHref || href === "/shop";
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
                  : isShopItem
                    ? pathname === "/shop" || pathname.startsWith("/shop/")
                    : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <button
                key={href + labelKey}
                type="button"
                data-menu-item={isShopItem ? "my-shop" : undefined}
                onClick={() => {
                  onClose();
                  if (isHomeItem) {
                    // Dashboard must always open on a blank selector — never
                    // re-open a previously selected trade/flow.
                    setCategory("none");
                    setSelectedTechId(null);
                    resetNavStack(href);
                    router.replace(href);
                    return;
                  }
                  router.push(href);
                }}
                className={cn(
                  "flex w-full items-center gap-3.5 border-0 bg-transparent px-3 py-2.5 text-left text-[16px] font-medium tracking-[-0.01em] transition-colors",
                  active ? rowActive : rowIdle
                )}
              >
                {renderMenuIcon(icon)}
                <span className="leading-none">
                  {label === "nav.myShop" ? "My Shop" : label}
                </span>
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
              "flex w-full items-center gap-3.5 border-0 bg-transparent px-3 py-2.5 text-left text-[16px] font-medium tracking-[-0.01em] transition-colors",
              rowIdle
            )}
          >
            {renderMenuIcon("notifications")}
            <span className="min-w-0 flex-1 leading-none">
              {t("menu.notifications")}
            </span>
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

          <div className="mt-1 px-1">
            {isPro && proServices.length > 0 && (
              <div
                className={cn(
                  "mb-1.5 border-t pt-1.5",
                  isLight ? "border-black/10" : "border-white/10"
                )}
              >
                <div
                  className={cn(
                    "flex w-full items-center gap-3.5 border-0 px-3 py-2.5 text-left text-[16px] font-medium tracking-[-0.01em]",
                    rowIdle
                  )}
                >
                  {renderMenuIcon("service")}
                  <span className="min-w-0 flex-1 leading-none">
                    {t("menu.myService")}
                  </span>
                </div>
                <div className="flex w-full items-center gap-2 px-3 py-0.5">
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[12px] font-medium",
                      isLight ? "text-black" : "text-white"
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
            <div
              className={cn(
                "mt-3 border-t pt-3",
                isLight ? "border-black/10" : "border-white/10"
              )}
            >
            <p
              className={cn(
                "mb-1 px-2 text-[10px] font-bold uppercase tracking-wide",
                isLight ? "text-black" : "text-white/55"
              )}
            >
              {t("menu.useAs")}
            </p>
            {hasMotoristAccount && hasProAccount ? (
              <p className="mb-1 px-2 text-[11px] font-bold text-[#FF6B35]">
                Dual Role
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
              {useAsOrder.map((role) => {
                const active = accountType === role;
                const label =
                  role === "motorist" ? t("auth.motorist") : t("auth.pro");
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={switching}
                    onClick={() => void onSwitch(role)}
                    className={cn(
                      asBtnClass(active),
                      switching && "relative"
                    )}
                    aria-current={active ? "true" : undefined}
                  >
                    {switching && !active ? (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin text-[#FF6B35]"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                        <span className="sr-only">Switching</span>
                      </span>
                    ) : (
                      label
                    )}
                  </button>
                );
              })}
            </div>
            {warn ? (
              <div
                className={cn(
                  "mt-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium leading-snug",
                  isLight
                    ? "bg-black/10 text-black"
                    : "bg-white/10 text-white"
                )}
                role="alert"
              >
                <p className={isLight ? "text-black" : "text-white"}>
                  {warn}
                </p>
                {signupTarget && (
                  <button
                    type="button"
                    className="mt-1 border-0 bg-transparent p-0 text-[11px] font-bold text-[#FF6B35] underline"
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
                    className="mt-1 border-0 bg-transparent p-0 text-[11px] font-bold text-[#FF6B35] underline"
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
                  "mt-1 px-2 text-[10px] font-medium leading-snug",
                  isLight ? "text-black" : "text-white/55"
                )}
              >
                {t("menu.tapToSwitch")}
              </p>
            )}
            </div>
          </div>
        </nav>

        <div
          className={cn(
            "shrink-0 border-t px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
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
              "flex w-full items-center justify-center gap-2 rounded-lg border-0 px-3 py-2 text-sm font-semibold shadow-none ring-0 outline-none",
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
