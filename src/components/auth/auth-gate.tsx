"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandEntryScreen } from "@/components/auth/brand-entry-screen";
import { BrandHeroMotion, BRAND_COPPER } from "@/components/auth/brand-hero-motion";
import {
  canAccessPath,
  homePathForAccount,
  isPublicPath,
} from "@/lib/routes";
import { AUTH_TRANSITION_MS } from "@/components/auth/auth-transition";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const ENTRY_SESSION_KEY = "oga-mecho-entry-done";
/** Minimum splash so intro never flash-cuts (phone-shell only) */
const SPLASH_MIN_MS = 900;
/** Soft crossfade splash → Welcome */
const HANDOFF_MS = 560;

/** Exact welcome routes only — not /login/signin or /login/role */
function isWelcomeRoute(pathname: string) {
  return pathname === "/login" || pathname === "/";
}

type BootPhase = "loading" | "handoff" | "entry" | "ready";

function isDualRoleSignupPath(
  pathname: string,
  hasMotoristAccount: boolean,
  hasProAccount: boolean
): boolean {
  if (pathname.startsWith("/signup/error")) return true;

  if (
    typeof window !== "undefined" &&
    (pathname.startsWith("/signup/motorist") ||
      pathname.startsWith("/signup/pro"))
  ) {
    try {
      const from = new URLSearchParams(window.location.search).get("from");
      if (from === "menu" || from === "profile") return true;
    } catch {
      /* ignore */
    }
  }

  if (pathname.startsWith("/signup/motorist") && !hasMotoristAccount) {
    return true;
  }
  if (pathname.startsWith("/signup/pro") && !hasProAccount) {
    return true;
  }
  return false;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    authReady,
    isAuthenticated,
    accountType,
    serverSessionReady,
    hasMotoristAccount,
    hasProAccount,
  } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<BootPhase>("loading");
  const [splashExiting, setSplashExiting] = useState(false);
  /** Soft exit of Welcome before Log In / Sign Up route */
  const [entryExiting, setEntryExiting] = useState(false);
  const bootStartedAt = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );
  const handoffTimer = useRef<number | null>(null);
  /** Prevents welcome effect from undoing a Log In / Sign Up navigation */
  const navigatingAwayRef = useRef(false);

  // After auth is known, hold splash briefly then hand off with transition
  useEffect(() => {
    if (!authReady) return;
    if (phase !== "loading") return;

    const elapsed =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      bootStartedAt.current;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);

    const t = window.setTimeout(() => {
      if (isAuthenticated) {
        setSplashExiting(true);
        handoffTimer.current = window.setTimeout(() => {
          setPhase("ready");
          setSplashExiting(false);
        }, HANDOFF_MS);
        return;
      }

      setPhase("handoff");
      setSplashExiting(true);
      handoffTimer.current = window.setTimeout(() => {
        setPhase("entry");
        setSplashExiting(false);
      }, HANDOFF_MS);
    }, wait);

    return () => {
      window.clearTimeout(t);
      if (handoffTimer.current) window.clearTimeout(handoffTimer.current);
    };
  }, [authReady, isAuthenticated, phase]);

  /**
   * Welcome only when guest is on / or /login and has not chosen Log In / Sign Up.
   * Never pull user back to welcome while navigating to /login/signin or /login/role.
   */
  useEffect(() => {
    if (!authReady || isAuthenticated) return;
    if (phase === "loading" || phase === "handoff") return;
    if (navigatingAwayRef.current) return;

    // Already past welcome (sign-in form, role pick, signup, …)
    if (!isWelcomeRoute(pathname)) {
      if (phase !== "ready") setPhase("ready");
      return;
    }

    // Explicit welcome routes — show entry unless mid-navigation
    try {
      const entryDone = sessionStorage.getItem(ENTRY_SESSION_KEY) === "1";
      if (entryDone) {
        // Stale flag on welcome URL (e.g. Back cleared path) — allow welcome again
        sessionStorage.removeItem(ENTRY_SESSION_KEY);
      }
    } catch {
      /* ignore */
    }
    if (phase !== "entry") setPhase("entry");
  }, [authReady, isAuthenticated, pathname, phase]);

  const finishEntry = useCallback(
    (path: string) => {
      if (entryExiting) return;
      navigatingAwayRef.current = true;
      setEntryExiting(true);
      try {
        sessionStorage.setItem(ENTRY_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      // Soft fade out Welcome, then navigate (Log In / Sign Up)
      window.setTimeout(() => {
        setPhase("ready");
        router.replace(path);
        setEntryExiting(false);
        window.setTimeout(() => {
          navigatingAwayRef.current = false;
        }, 800);
      }, AUTH_TRANSITION_MS);
    },
    [entryExiting, router]
  );

  // Signed-in → leave login; allow dual-role signup when the other account is missing
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (phase !== "ready") return;

    if (pathname.startsWith("/login")) {
      router.replace(homePathForAccount(accountType));
      return;
    }

    if (pathname.startsWith("/signup")) {
      if (
        isDualRoleSignupPath(pathname, hasMotoristAccount, hasProAccount)
      ) {
        return;
      }
      router.replace(homePathForAccount(accountType));
    }
  }, [
    authReady,
    phase,
    isAuthenticated,
    pathname,
    accountType,
    hasMotoristAccount,
    hasProAccount,
    router,
  ]);

  // Role lock
  useEffect(() => {
    if (!authReady || phase !== "ready" || !isAuthenticated) return;
    if (isPublicPath(pathname)) return;
    if (!canAccessPath(accountType, pathname)) {
      router.replace(homePathForAccount(accountType));
    }
  }, [authReady, phase, isAuthenticated, pathname, accountType, router]);

  // Guest on protected route → welcome
  useEffect(() => {
    if (!authReady || phase === "loading" || phase === "handoff") return;
    if (navigatingAwayRef.current) return;
    if (isAuthenticated && serverSessionReady) return;
    if (isAuthenticated) return;
    if (isPublicPath(pathname) && !isWelcomeRoute(pathname)) return;
    if (!isPublicPath(pathname)) {
      setPhase("entry");
      router.replace("/login");
    }
  }, [
    authReady,
    phase,
    isAuthenticated,
    serverSessionReady,
    pathname,
    router,
  ]);

  const frame =
    "relative flex h-full min-h-0 w-full flex-col overflow-hidden";

  const splashLayer = (
    <div
      className={cn(
        "absolute inset-0 z-20 overflow-hidden om-intro-splash-layer",
        splashExiting && "is-exiting"
      )}
      style={{ backgroundColor: BRAND_COPPER }}
      // Never block Log In during handoff
      aria-hidden={splashExiting}
    >
      <BrandHeroMotion
        size="splash"
        bottomFade={false}
        motion={false}
        introMotion
      />
      <p
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-10 z-10 text-center text-[12px] font-medium transition-opacity duration-300",
          splashExiting ? "opacity-0" : "opacity-70"
        )}
        style={{ color: "#C8C9CD" }}
      >
        Loading Ona…
      </p>
    </div>
  );

  if (phase === "loading" || phase === "handoff") {
    return (
      <div
        className={cn(frame)}
        style={{ backgroundColor: BRAND_COPPER }}
      >
        {phase === "handoff" && !isAuthenticated ? (
          <div
            className={cn(
              "absolute inset-0 z-10 overflow-hidden om-intro-welcome-layer",
              entryExiting && "om-auth-exit"
            )}
          >
            <BrandEntryScreen
              onLogIn={() => finishEntry("/login/signin")}
              onSignUp={() => finishEntry("/login/role")}
              animateIn
            />
          </div>
        ) : null}
        {splashLayer}
      </div>
    );
  }

  if (phase === "entry" && !isAuthenticated) {
    return (
      <div
        className={cn(frame)}
        style={{ backgroundColor: BRAND_COPPER }}
      >
        <div
          className={cn(
            "absolute inset-0 overflow-hidden om-auth-enter",
            entryExiting && "om-auth-exit"
          )}
        >
          <BrandEntryScreen
            onLogIn={() => finishEntry("/login/signin")}
            onSignUp={() => finishEntry("/login/role")}
            animateIn
          />
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath(pathname)) {
    return (
      <div
        className={cn(frame)}
        style={{ backgroundColor: BRAND_COPPER }}
      >
        <div
          className={cn(
            "absolute inset-0 overflow-hidden om-auth-enter",
            entryExiting && "om-auth-exit"
          )}
        >
          <BrandEntryScreen
            onLogIn={() => finishEntry("/login/signin")}
            onSignUp={() => finishEntry("/login/role")}
            animateIn={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        frame,
        "bg-[#c8c9cd] dark:bg-black"
      )}
    >
      {children}
    </div>
  );
}
