/**
 * History-aware back navigation for the phone shell.
 * Prefers the real previous page; falls back when there is no stack.
 */

import type { AccountType } from "@/lib/types";

type RouterLike = {
  back: () => void;
  push: (href: string) => void;
};

export function defaultBackHref(accountType: AccountType | null | undefined): string {
  return accountType === "professional" ? "/dashboard" : "/";
}

/** True when Next.js / browser has a previous entry in this app session. */
export function canGoBackInHistory(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const state = window.history.state as { idx?: number } | null;
    if (state && typeof state.idx === "number" && state.idx > 0) {
      return true;
    }
  } catch {
    /* ignore */
  }
  // Same-origin referrer + stack depth (cold open of deep link → no)
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

/**
 * Soft visual cue then navigate back (or to fallback).
 */
export function navigateBack(router: RouterLike, fallbackHref: string): void {
  const go = () => {
    if (canGoBackInHistory()) {
      router.back();
      return;
    }
    router.push(fallbackHref);
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
    root.classList.remove("om-page-exit");
    go();
  }, 120);
}
