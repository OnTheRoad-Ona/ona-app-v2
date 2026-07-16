/**
 * History-aware back navigation for the phone shell.
 * Prefers the immediate previous in-app page; falls back to Home (`/`).
 * See docs/ANTI_REGRESSION.md — after tel:/external handoff, prefer stack push
 * over history.back() so Back never dies and the shell never stays collapsed.
 */

import type { AccountType } from "@/lib/types";

type RouterLike = {
  back: () => void;
  push: (href: string) => void;
};

const STACK_KEY = "oga-mecho-nav-stack";
const MAX_STACK = 40;

/** Always Home when there is no previous page (per product rule). */
export function defaultBackHref(
  _accountType?: AccountType | null | undefined
): string {
  return "/";
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
 * Fallback is always Home (`/`) unless a custom fallback is passed
 * (still defaults to `/`).
 */
export function navigateBack(
  router: RouterLike,
  fallbackHref: string = "/"
): void {
  const fallback = fallbackHref?.trim() || "/";

  const go = () => {
    clearPageExitClass();

    const stack = readStack();
    const current =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "";

    // Drop current page from our stack
    if (stack.length >= 1) {
      if (stack[stack.length - 1] === current || stack.length >= 2) {
        stack.pop();
      }
    }

    // Skip duplicate tops / same-as-current so Back always moves
    while (
      stack.length >= 1 &&
      (stack[stack.length - 1] === current || !stack[stack.length - 1])
    ) {
      stack.pop();
    }

    if (stack.length >= 1) {
      const prev = stack[stack.length - 1] || fallback;
      writeStack(stack);
      // Prefer explicit push to a known in-app path — more reliable than
      // history.back() after tel: dialer / external app handoff.
      router.push(prev);
      return;
    }

    writeStack([]);
    router.push(fallback);
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
