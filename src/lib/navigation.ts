/**
 * History-aware back navigation for the phone shell.
 * Prefers the immediate previous in-app page; falls back to a logical parent
 * (e.g. Job details → Jobs), not a random home link.
 * Never jumps into the other role’s home — only the menu “Use as” switch changes account.
 * See docs/ANTI_REGRESSION.md.
 */

import { canAccessPath } from "@/lib/routes";
import type { AccountType } from "@/lib/types";

type RouterLike = {
  back: () => void;
  push: (href: string) => void;
};

const STACK_KEY = "oga-mecho-nav-stack";
const MAX_STACK = 40;

/** Role home: Repair Pro dashboard, Motorist map home. */
export function defaultBackHref(
  accountType?: AccountType | null | undefined
): string {
  return accountType === "professional" ? "/dashboard" : "/";
}

/**
 * Logical parent for a route when the nav stack is empty or only has root.
 * Keeps Back consistent (Job details → Jobs, chat → messages, etc.).
 */
export function smartBackFallback(
  pathname: string,
  accountType?: AccountType | null | undefined
): string {
  const home = defaultBackHref(accountType);
  const path = (pathname || "/").split("?")[0] || "/";

  // Past job process (from Jobs list)
  if (/^\/requests\/[^/]+$/.test(path)) {
    return accountType === "professional" ? "/jobs" : "/history";
  }
  // Live job flow
  if (/^\/jobs\/[^/]+$/.test(path)) {
    return "/jobs";
  }
  if (path === "/jobs") return home;
  if (path === "/history") return home;
  if (path === "/requests") return home;

  // Chat is request-scoped — no messages inbox
  if (/^\/messages\/[^/]+$/.test(path)) {
    return accountType === "professional" ? "/jobs" : "/requests";
  }
  if (path === "/messages") {
    return accountType === "professional" ? "/jobs" : "/requests";
  }

  // Profile / settings
  if (path === "/profile" || path === "/settings") return home;
  if (path.startsWith("/payments")) return "/profile";

  // Artisan setup — previous page if stack empty → pro dashboard
  if (path.startsWith("/artisan/onboarding")) {
    return accountType === "professional" ? "/dashboard" : home;
  }
  if (path.startsWith("/artisan/")) {
    return accountType === "professional" ? "/dashboard" : home;
  }

  // Motorist flows
  if (path.startsWith("/technician/")) return "/";
  if (path === "/request" || path === "/search" || path === "/verify")
    return "/";
  if (path.startsWith("/signup")) return "/login";
  if (path.startsWith("/login/")) return "/login";

  return home;
}

function isDetailPath(path: string): boolean {
  const p = path.split("?")[0] || "/";
  return (
    /^\/requests\/[^/]+$/.test(p) ||
    /^\/jobs\/[^/]+$/.test(p) ||
    /^\/messages\/[^/]+$/.test(p) ||
    /^\/technician\/[^/]+$/.test(p)
  );
}

function isRoleHome(path: string): boolean {
  const p = path.split("?")[0] || "/";
  return p === "/" || p === "/dashboard";
}

function readStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STACK_KEY,
      JSON.stringify(stack.slice(-MAX_STACK))
    );
  } catch {
    /* ignore quota */
  }
}

/**
 * Call on every in-app route change so Back can return to the
 * immediate previous page (not a fixed hub).
 */
export function recordNavigation(path: string): void {
  if (typeof window === "undefined") return;
  const clean = path.split("#")[0] || "/";
  if (!clean.startsWith("/")) return;
  // Don't track admin in consumer stack
  if (clean.startsWith("/admin")) return;

  const stack = readStack();
  const top = stack[stack.length - 1];
  if (top === clean) return;
  stack.push(clean);
  writeStack(stack);
}

/**
 * Reset stack when the user deliberately switches Motorist ↔ Repair Pro
 * (menu “Use as” only). Prevents Back from hopping into the other role’s pages.
 */
export function resetNavStack(seedPath?: string): void {
  if (typeof window === "undefined") return;
  const seed = (seedPath || "").split("#")[0];
  if (seed && seed.startsWith("/") && !seed.startsWith("/admin")) {
    writeStack([seed]);
  } else {
    writeStack([]);
  }
}

function pathOnly(href: string): string {
  return (href || "/").split("?")[0] || "/";
}

/** Stack entry is valid for the *current* account — never cross-role. */
function stackEntryAllowed(
  href: string,
  accountType?: AccountType | null
): boolean {
  if (!accountType) return true;
  return canAccessPath(accountType, pathOnly(href));
}

/** True when we know there is a previous in-app page to return to. */
export function canGoBackInHistory(): boolean {
  if (typeof window === "undefined") return false;

  const stack = readStack();
  if (stack.length >= 2) return true;

  try {
    const state = window.history.state as { idx?: number; __na?: number } | null;
    if (state && typeof state.idx === "number" && state.idx > 0) {
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    if (
      window.history.length > 1 &&
      document.referrer &&
      document.referrer.startsWith(window.location.origin)
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

/** Always clear soft-exit styling so Back never leaves the shell collapsed. */
export function clearPageExitClass(): void {
  if (typeof document === "undefined") return;
  document.getElementById("oga-mecho-phone")?.classList.remove("om-page-exit");
}

/**
 * Soft visual cue then go to the immediate previous page.
 * Fallback is logical parent (e.g. Job details → /jobs), then role home.
 * Never navigates to a path the current account cannot access (no accidental
 * Motorist ↔ Pro hop — only menu “Use as” switches account).
 */
export function navigateBack(
  router: RouterLike,
  fallbackHref?: string,
  accountType?: AccountType | null
): void {
  const currentPathname =
    typeof window !== "undefined" ? window.location.pathname || "/" : "/";
  const smart = smartBackFallback(currentPathname, accountType);
  const fallback = (
    fallbackHref?.trim() ||
    smart ||
    defaultBackHref(accountType)
  ).split("#")[0];

  const go = () => {
    clearPageExitClass();

    const stack = readStack();
    const current =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "";
    const currentPath =
      typeof window !== "undefined"
        ? window.location.pathname
        : currentPathname;

    // Drop current page from our stack
    if (stack.length >= 1) {
      if (stack[stack.length - 1] === current || stack.length >= 2) {
        stack.pop();
      }
    }

    // Skip duplicate tops / same-as-current / other-role pages
    while (stack.length >= 1) {
      const top = stack[stack.length - 1];
      if (
        !top ||
        top === current ||
        top === currentPath ||
        !stackEntryAllowed(top, accountType)
      ) {
        stack.pop();
        continue;
      }
      break;
    }

    if (stack.length >= 1) {
      const prev = (stack[stack.length - 1] || fallback).split("#")[0];
      const prevPath = pathOnly(prev);

      // Detail screens: prefer list parent over bare role-home in stack
      if (
        isDetailPath(currentPath) &&
        isRoleHome(prevPath) &&
        fallback &&
        !isRoleHome(fallback) &&
        stackEntryAllowed(fallback, accountType)
      ) {
        writeStack(stack);
        router.push(fallback);
        return;
      }

      writeStack(stack);
      router.push(prev);
      return;
    }

    writeStack([]);
    const safeFallback = stackEntryAllowed(fallback, accountType)
      ? fallback
      : defaultBackHref(accountType);
    router.push(safeFallback);
  };

  if (typeof document === "undefined") {
    go();
    return;
  }

  const root = document.getElementById("oga-mecho-phone");
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
