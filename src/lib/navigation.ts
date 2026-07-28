/**
 * Back navigation for the phone shell.
 *
 * RULE:
 *   Prefer the true previous page (browser history) when available.
 *   If there is no history entry, fall back to the logical parent route.
 *
 * Explicit `backHref` is used only as that fallback parent.
 * Role homes (`/` / `/dashboard`) still resolve to role home when no history.
 */

import { canAccessPath } from "@/lib/routes";
import type { AccountType } from "@/lib/types";

type RouterLike = {
  back?: () => void;
  push: (href: string) => void;
  replace?: (href: string) => void;
};

/** Role home: Repair Pro dashboard, Customer map home. */
export function defaultBackHref(
  accountType?: AccountType | null | undefined
): string {
  return accountType === "professional" ? "/dashboard" : "/";
}

function pathOnly(href: string): string {
  return (href || "/").split("?")[0].split("#")[0] || "/";
}

/**
 * Logical parent for a route — the single source of truth for Back.
 * Order: most specific paths first.
 */
export function smartBackFallback(
  pathname: string,
  accountType?: AccountType | null | undefined
): string {
  const home = defaultBackHref(accountType);
  const path = pathOnly(pathname);

  // ── Auth / guest ──────────────────────────────────────────
  if (path === "/login" || path === "/logout") return "/login";
  if (path.startsWith("/login/")) return "/login";
  if (path === "/signup" || path.startsWith("/signup/")) return "/login/role";

  // ── Settings tree ─────────────────────────────────────────
  if (path.startsWith("/settings/legal/")) return "/settings/legal";
  if (path.startsWith("/settings/") && path !== "/settings") {
    return "/settings";
  }
  if (path === "/settings") return home;

  // ── Profile & payments ────────────────────────────────────
  if (path === "/profile") return home;
  if (path.startsWith("/payments")) return "/settings";

  // ── Jobs / requests / history ─────────────────────────────
  if (/^\/jobs\/[^/]+$/.test(path)) return "/jobs";
  if (path === "/jobs") {
    return accountType === "professional" ? "/dashboard" : home;
  }
  if (/^\/requests\/[^/]+$/.test(path)) {
    return accountType === "professional" ? "/jobs" : "/history";
  }
  if (path === "/requests") return home;
  if (path === "/history") return home;
  if (path === "/bookings" || path === "/orders") {
    return accountType === "professional" ? "/dashboard" : home;
  }

  // ── Chat (request-scoped) ─────────────────────────────────
  if (/^\/messages\/[^/]+$/.test(path)) {
    return accountType === "professional" ? "/jobs" : "/requests";
  }
  if (path === "/messages") {
    return accountType === "professional" ? "/jobs" : "/requests";
  }

  // ── Motorist discovery ────────────────────────────────────
  if (path.startsWith("/technician/")) return "/";
  if (path === "/request" || path === "/search") return "/";

  // ── Verification / artisan ────────────────────────────────
  if (path === "/verify") return home;
  if (path.startsWith("/artisan/onboarding")) {
    return accountType === "professional" ? "/dashboard" : home;
  }
  if (path.startsWith("/artisan/")) {
    return accountType === "professional" ? "/dashboard" : home;
  }

  // ── Role homes ────────────────────────────────────────────
  if (path === "/" || path === "/dashboard") return home;

  return home;
}

/**
 * Resolve final Back target: explicit page override, else hierarchy.
 * Guarantees a path the current account may open.
 */
export function resolveBackHref(
  pathname: string,
  accountType?: AccountType | null,
  explicitHref?: string | null
): string {
  const home = defaultBackHref(accountType);
  const current = pathOnly(pathname);
  const raw = (explicitHref?.trim() || smartBackFallback(current, accountType))
    .split("#")[0]
    .trim();
  let target = pathOnly(raw) === current ? home : raw || home;

  if (accountType && !canAccessPath(accountType, pathOnly(target))) {
    target = home;
  }
  // Never back to self
  if (pathOnly(target) === current) {
    target = home;
  }
  return target;
}

/** Always clear soft-exit styling so Back never leaves the shell collapsed. */
export function clearPageExitClass(): void {
  if (typeof document === "undefined") return;
  document.getElementById("ona-phone")?.classList.remove("om-page-exit");
}

/**
 * Back = previous page when history exists; else hierarchical parent fallback.
 */
export function navigateBack(
  router: RouterLike,
  fallbackHref?: string,
  accountType?: AccountType | null
): void {
  const currentPathname =
    typeof window !== "undefined" ? window.location.pathname || "/" : "/";
  const target = resolveBackHref(currentPathname, accountType, fallbackHref);

  const go = () => {
    clearPageExitClass();
    // True previous page first (settings → verification → back returns to settings, etc.)
    if (
      typeof window !== "undefined" &&
      typeof router.back === "function" &&
      window.history.length > 1
    ) {
      router.back();
      return;
    }
    router.push(target);
  };

  if (typeof document === "undefined") {
    go();
    return;
  }

  const root = document.getElementById("ona-phone");
  if (!root) {
    go();
    return;
  }

  root.classList.add("om-page-exit");
  window.setTimeout(() => {
    clearPageExitClass();
    go();
  }, 120);
}

/**
 * Kept for call sites that reset after role switch — no-op for history
 * (Back no longer uses a stack). Seeds optional future telemetry only.
 */
export function resetNavStack(_seedPath?: string): void {
  /* hierarchical Back does not use a stack */
}

/** @deprecated No stack — kept so AppFrame route effect stays harmless. */
export function recordNavigation(_path: string): void {
  /* hierarchical Back does not use a stack */
}

/** @deprecated Always false — do not branch UX on browser history. */
export function canGoBackInHistory(): boolean {
  return false;
}
