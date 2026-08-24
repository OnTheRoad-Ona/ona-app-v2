"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandEntryScreen } from "@/components/auth/brand-entry-screen";
import {
  BrandHeroMotion,
  BRAND_COPPER,
} from "@/components/auth/brand-hero-motion";
import { canAccessPath, homePathForAccount, isPublicPath } from "@/lib/routes";
import { AUTH_TRANSITION_MS } from "@/components/auth/auth-transition";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Brief branded splash (photo + Loading Ona) before Welcome / app */
const SPLASH_MIN_MS = 120;
/** Soft crossfade splash → Welcome */
const HANDOFF_MS = 100;
/** Absolute max splash long enough for session restore to win over guest flash */
const SPLASH_FAILSAFE_MS = 2800;

/** Exact welcome routes only not /login/signin or /login/role */
function isWelcomeRoute(pathname: string) {
  return pathname === "/login" || pathname === "/";
}

/** Auth forms should skip brand splash once session is known */
function isAuthFormRoute(pathname: string) {
  if (pathname.startsWith("/login/signin")) return true;
  if (pathname.startsWith("/login/role")) return true;
  if (pathname.startsWith("/login/reset-password")) return true;
  if (pathname.startsWith("/login/pro-service")) return true;
  if (pathname.startsWith("/signup")) return true;
  return false;
}

type BootPhase = "loading" | "handoff" | "entry" | "ready";

function isDualRoleSignupPath(
  pathname: string,
  hasMotoristAccount: boolean,
  hasProAccount: boolean,
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

function initialPhase(pathname: string): BootPhase {
  // Deep-link into forms: never trap on splash
  if (isAuthFormRoute(pathname)) return "ready";
  return "loading";
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    authReady,
    isAuthenticated,
    accountType,
    hasMotoristAccount,
    hasProAccount,
  } = useApp();
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<BootPhase>(() => initialPhase(pathname));
  const [splashExiting, setSplashExiting] = useState(false);
  /** Soft exit of Welcome before Log In / Sign Up route */
  const [entryExiting, setEntryExiting] = useState(false);
  /** Set on first splash timing effect (keep render pure). */
  const bootStartedAt = useRef<number | null>(null);
  const handoffTimer = useRef<number | null>(null);
  /** Prevents welcome effect from undoing a Log In / Sign Up navigation */
  const navigatingAwayRef = useRef(false);
  /** Once we leave splash, never re-enter loading (stops render loops) */
  const leftSplashRef = useRef(isAuthFormRoute(pathname));
  const redirectingRef = useRef(false);

  // Pathname moved to auth form → always ready (no splash bounce)
  useEffect(() => {
    if (!isAuthFormRoute(pathname)) return;
    leftSplashRef.current = true;
    if (phase !== "ready") setPhase("ready");
    setSplashExiting(false);
    setEntryExiting(false);
  }, [pathname, phase]);

  // After auth is known, hold splash briefly then hand off
  useEffect(() => {
    if (!authReady) return;
    if (phase !== "loading") return;
    if (leftSplashRef.current) {
      // Auth form path already ready; everyone else leave splash once
      if (isAuthFormRoute(pathname)) {
        setPhase("ready");
        return;
      }
      if (isAuthenticated) {
        setPhase("ready");
        return;
      }
      // Guest on welcome: go to entry, never blank "ready"
      setPhase(isWelcomeRoute(pathname) ? "entry" : "ready");
      return;
    }

    if (!isAuthenticated && isAuthFormRoute(pathname)) {
      leftSplashRef.current = true;
      setPhase("ready");
      setSplashExiting(false);
      return;
    }

    if (bootStartedAt.current == null) {
      bootStartedAt.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    }
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - bootStartedAt.current;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);

    const tmr = window.setTimeout(() => {
      leftSplashRef.current = true;
      if (isAuthenticated) {
        setSplashExiting(true);
        handoffTimer.current = window.setTimeout(() => {
          setPhase("ready");
          setSplashExiting(false);
        }, HANDOFF_MS);
        return;
      }

      // Guest: always land on welcome entry (not empty ready shell)
      setPhase("handoff");
      setSplashExiting(true);
      handoffTimer.current = window.setTimeout(() => {
        setPhase("entry");
        setSplashExiting(false);
      }, HANDOFF_MS);
    }, wait);

    return () => {
      window.clearTimeout(tmr);
      if (handoffTimer.current) window.clearTimeout(handoffTimer.current);
    };
  }, [authReady, isAuthenticated, phase, pathname]);

  // Absolute failsafe: never stay on splash forever
  useEffect(() => {
    if (phase !== "loading") return;
    const tmr = window.setTimeout(() => {
      leftSplashRef.current = true;
      setSplashExiting(false);
      if (isAuthenticated) {
        setPhase("ready");
      } else if (isAuthFormRoute(pathname)) {
        setPhase("ready");
      } else {
        setPhase("entry");
      }
    }, SPLASH_FAILSAFE_MS);
    return () => window.clearTimeout(tmr);
  }, [phase, isAuthenticated, pathname]);

  /**
   * Guest on / or /login → force welcome UI (never empty light-gray login shell).
   * Guest past welcome on forms → ready.
   */
  useEffect(() => {
    if (!authReady || isAuthenticated) return;
    if (phase === "loading" || phase === "handoff") return;
    if (navigatingAwayRef.current) return;

    if (isAuthFormRoute(pathname)) {
      leftSplashRef.current = true;
      if (phase !== "ready") setPhase("ready");
      return;
    }

    if (isWelcomeRoute(pathname)) {
      leftSplashRef.current = true;
      if (phase !== "entry") setPhase("entry");
      return;
    }

    // Other public paths (logout etc.)
    leftSplashRef.current = true;
    if (phase !== "ready") setPhase("ready");
  }, [authReady, isAuthenticated, pathname, phase]);

  const finishEntry = useCallback(
    (path: string) => {
      // One tap must open the next page (Vercel cold starts felt like double-click)
      if (navigatingAwayRef.current) return;
      navigatingAwayRef.current = true;
      leftSplashRef.current = true;
      setEntryExiting(true);
      setPhase("ready");
      // Navigate immediately fade is visual only, not a second required click
      router.replace(path);
      window.setTimeout(
        () => {
          setEntryExiting(false);
          navigatingAwayRef.current = false;
        },
        Math.max(AUTH_TRANSITION_MS, 200) + 100,
      );
    },
    [router],
  );

  // Signed-in → leave login; allow dual-role signup when the other account is missing
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (phase !== "ready" && phase !== "entry" && phase !== "handoff") return;
    // Promote to ready when session appears mid-splash
    if (phase !== "ready") {
      leftSplashRef.current = true;
      setPhase("ready");
      return;
    }
    if (redirectingRef.current) return;

    if (pathname.startsWith("/login")) {
      redirectingRef.current = true;
      router.replace(homePathForAccount(accountType));
      window.setTimeout(() => {
        redirectingRef.current = false;
      }, 500);
      return;
    }

    if (pathname.startsWith("/signup")) {
      if (isDualRoleSignupPath(pathname, hasMotoristAccount, hasProAccount)) {
        return;
      }
      redirectingRef.current = true;
      router.replace(homePathForAccount(accountType));
      window.setTimeout(() => {
        redirectingRef.current = false;
      }, 500);
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
    if (redirectingRef.current) return;
    if (isPublicPath(pathname)) return;
    if (!canAccessPath(accountType, pathname)) {
      redirectingRef.current = true;
      router.replace(homePathForAccount(accountType));
      window.setTimeout(() => {
        redirectingRef.current = false;
      }, 500);
    }
  }, [authReady, phase, isAuthenticated, pathname, accountType, router]);

  // Guest on protected route → welcome + /login (never blank)
  useEffect(() => {
    if (!authReady || phase === "loading" || phase === "handoff") return;
    if (navigatingAwayRef.current || redirectingRef.current) return;
    if (isAuthenticated) return;
    if (isPublicPath(pathname) && !isWelcomeRoute(pathname)) return;
    if (!isPublicPath(pathname)) {
      leftSplashRef.current = true;
      setPhase("entry");
      if (pathname !== "/login") {
        redirectingRef.current = true;
        router.replace("/login");
        window.setTimeout(() => {
          redirectingRef.current = false;
        }, 500);
      }
    }
  }, [authReady, phase, isAuthenticated, pathname, router]);

  const frame = "relative flex h-full min-h-0 w-full flex-col overflow-hidden";

  const welcomeUi = (animateIn: boolean) => (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden",
        animateIn && "om-auth-enter",
        entryExiting && "om-auth-exit",
      )}
      style={{ backgroundColor: BRAND_COPPER }}
    >
      <BrandEntryScreen
        onLogIn={() => finishEntry("/login/signin")}
        onSignUp={() => finishEntry("/login/role")}
        animateIn={animateIn}
      />
    </div>
  );

  // Brand portrait (auth-bg-v31) + Loading text not the Welcome intro page
  const splashLayer = (
    <div
      className={cn(
        "absolute inset-0 z-20 overflow-hidden om-intro-splash-layer",
        splashExiting && "is-exiting",
      )}
      style={{ backgroundColor: BRAND_COPPER }}
      aria-hidden={splashExiting}
      aria-label={t("common.loading")}
    >
      <BrandHeroMotion size="splash" bottomFade={false} motion introMotion />
      <p
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-10 z-10 text-center text-[12px] font-medium transition-opacity duration-200",
          splashExiting ? "opacity-0" : "opacity-90",
        )}
        style={{ color: "#C8C9CD" }}
      >
        {t("common.loading")}
      </p>
    </div>
  );

  // --- Guest: never show empty /login shell (that reads as a white screen) ---
  if (!isAuthenticated) {
    if (phase === "loading" || phase === "handoff") {
      return (
        <div className={cn(frame)} style={{ backgroundColor: BRAND_COPPER }}>
          {phase === "handoff" ? (
            <div className="absolute inset-0 z-10 overflow-hidden om-intro-welcome-layer">
              {welcomeUi(true)}
            </div>
          ) : null}
          {splashLayer}
        </div>
      );
    }

    // Welcome routes OR still in entry → brand welcome (Log In / Sign Up)
    if (phase === "entry" || isWelcomeRoute(pathname)) {
      return (
        <div className={cn(frame)} style={{ backgroundColor: BRAND_COPPER }}>
          {welcomeUi(true)}
        </div>
      );
    }

    // Auth forms (signin/role/signup) or other public paths
    if (isPublicPath(pathname)) {
      return (
        <div
          className={cn(frame, "bg-[#c8c9cd]")}
          style={{ backgroundColor: "#c8c9cd" }}
        >
          {children}
        </div>
      );
    }

    // Protected while guest welcome while redirecting
    return (
      <div className={cn(frame)} style={{ backgroundColor: BRAND_COPPER }}>
        {welcomeUi(false)}
      </div>
    );
  }

  // --- Signed in ---
  if (phase === "loading" || phase === "handoff") {
    return (
      <div className={cn(frame)} style={{ backgroundColor: BRAND_COPPER }}>
        {splashLayer}
      </div>
    );
  }

  // Bank force is a lower panel on dashboard/home (BankForcePanel) not a hard block
  return (
    <div
      className={cn(frame)}
      style={{
        backgroundColor: "#c8c9cd",
      }}
    >
      {children}
    </div>
  );
}
