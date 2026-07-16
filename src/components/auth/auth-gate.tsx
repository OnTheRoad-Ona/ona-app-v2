"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandEntryScreen } from "@/components/auth/brand-entry-screen";
import { BrandHeroMotion } from "@/components/auth/brand-hero-motion";
import { IntroScreen } from "@/components/auth/intro-screen";
import {
  canAccessPath,
  homePathForAccount,
  isPublicPath,
} from "@/lib/routes";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const ENTRY_SESSION_KEY = "oga-mecho-entry-done";
/** Last time intro finished — re-show at most once per day (faster daily opens) */
const INTRO_AT_KEY = "oga-mecho-intro-at";
const INTRO_EVERY_MS = 24 * 60 * 60 * 1000;
const HANDOFF_MS = 420;

function shouldShowIntro(): boolean {
  try {
    const last = Number(localStorage.getItem(INTRO_AT_KEY) || "0");
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last >= INTRO_EVERY_MS;
  } catch {
    return true;
  }
}

function markIntroShown() {
  try {
    localStorage.setItem(INTRO_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function isBrandEntryRoute(pathname: string) {
  return pathname === "/login" || pathname === "/";
}

type BootPhase = "loading" | "intro" | "handoff" | "entry" | "ready";

/**
 * Boot flow:
 * - Signed-in: keep session forever; intro at most every 3h → home (never auth screen)
 * - Guest: intro (if due) → Log In / Sign Up entry
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { authReady, isAuthenticated, accountType, serverSessionReady } =
    useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<BootPhase>("loading");
  const [introFading, setIntroFading] = useState(false);

  // Decide boot phase once auth is known — never log signed-in users out
  useEffect(() => {
    if (!authReady) return;

    if (isAuthenticated) {
      // Stay signed in; optional intro, then app — never brand auth entry
      if (shouldShowIntro()) {
        setPhase("intro");
      } else {
        setPhase("ready");
      }
      return;
    }

    // Guest
    try {
      if (shouldShowIntro()) {
        setPhase("intro");
        return;
      }
      const entryDone = sessionStorage.getItem(ENTRY_SESSION_KEY) === "1";
      if (!entryDone || isBrandEntryRoute(pathname)) {
        if (isBrandEntryRoute(pathname)) {
          try {
            sessionStorage.removeItem(ENTRY_SESSION_KEY);
          } catch {
            /* ignore */
          }
        }
        setPhase("entry");
        return;
      }
      setPhase("ready");
    } catch {
      setPhase("intro");
    }
  }, [authReady, isAuthenticated, pathname]);

  const completeIntro = useCallback(() => {
    markIntroShown();

    // Signed-in: go straight to home/dashboard — never auth page
    if (isAuthenticated) {
      setPhase("ready");
      router.replace(homePathForAccount(accountType));
      return;
    }

    // Guest: crossfade into Log In / Sign Up
    setPhase("handoff");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIntroFading(true));
    });
    window.setTimeout(() => {
      setPhase("entry");
      setIntroFading(false);
    }, HANDOFF_MS);
  }, [isAuthenticated, accountType, router]);

  const finishEntry = useCallback(
    (path: string) => {
      try {
        sessionStorage.setItem(ENTRY_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setPhase("ready");
      router.replace(path);
    },
    [router]
  );

  // Signed-in → never linger on auth routes
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (phase === "intro" || phase === "handoff") return;
    if (
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname === "/"
    ) {
      // "/" is home for motorists — only redirect login/signup
      if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
        if (phase === "ready") {
          router.replace(homePathForAccount(accountType));
        }
      }
    }
  }, [authReady, phase, isAuthenticated, pathname, accountType, router]);

  // Role lock
  useEffect(() => {
    if (!authReady || phase !== "ready" || !isAuthenticated) return;
    if (isPublicPath(pathname)) return;
    if (!canAccessPath(accountType, pathname)) {
      router.replace(homePathForAccount(accountType));
    }
  }, [authReady, phase, isAuthenticated, pathname, accountType, router]);

  // Guest on protected route → entry (signed-in users never hit this)
  useEffect(() => {
    if (!authReady || phase === "loading" || phase === "intro" || phase === "handoff")
      return;
    if (isAuthenticated && serverSessionReady) return;
    if (isAuthenticated) return;
    if (isPublicPath(pathname) && !isBrandEntryRoute(pathname)) return;
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

  // Loading session: brand art only — no Log In / Sign Up (avoids auth flash)
  // Always fill parent height so mobile WebViews never show empty black void
  if (!authReady || phase === "loading") {
    return (
      <div className="relative h-full min-h-[100%] w-full overflow-hidden bg-black">
        <BrandHeroMotion size="splash" bottomFade={false} motion={false} />
        <p className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-[12px] font-medium text-white/55">
          Loading OgaMecho…
        </p>
      </div>
    );
  }

  // Intro video (signed-in or guest)
  if (phase === "intro" || phase === "handoff") {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        {phase === "handoff" && !isAuthenticated && (
          <div className="absolute inset-0 z-0">
            <BrandEntryScreen
              onLogIn={() => finishEntry("/login/signin")}
              onSignUp={() => finishEntry("/login/role")}
              animateIn
            />
          </div>
        )}
        {/* Signed-in handoff: keep black underlay only */}
        {phase === "handoff" && isAuthenticated && (
          <div className="absolute inset-0 z-0 bg-black" />
        )}
        <div
          className={cn(
            "absolute inset-0 z-10 bg-black transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
            introFading ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
          <IntroScreen onComplete={completeIntro} />
        </div>
      </div>
    );
  }

  // Auth entry only for guests
  if (phase === "entry" && !isAuthenticated) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        <BrandEntryScreen
          onLogIn={() => finishEntry("/login/signin")}
          onSignUp={() => finishEntry("/login/role")}
          animateIn
        />
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath(pathname)) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        <BrandEntryScreen
          onLogIn={() => finishEntry("/login/signin")}
          onSignUp={() => finishEntry("/login/role")}
          animateIn={false}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#c8c9cd] dark:bg-black">{children}</div>
  );
}
