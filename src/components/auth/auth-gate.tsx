"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_BG } from "@/components/auth/auth-plate";
import { BrandEntryScreen } from "@/components/auth/brand-entry-screen";
import { IntroScreen } from "@/components/auth/intro-screen";
import {
  canAccessPath,
  homePathForAccount,
  isPublicPath,
} from "@/lib/routes";
import { useApp } from "@/lib/store";

const INTRO_SESSION_KEY = "oga-mecho-intro-done";
const ENTRY_SESSION_KEY = "oga-mecho-entry-done";

/** Routes that should re-show the brand Log In / Sign Up sheet */
function isBrandEntryRoute(pathname: string) {
  return pathname === "/login" || pathname === "/";
}

type BootPhase = "loading" | "intro" | "entry" | "ready";

/**
 * 1) Intro video
 * 2) Brand image + Log In / Sign Up (until user taps)
 * 3) Log In → /login/signin · Sign Up → /login/role → full signup
 * Pros stay on professional pages; motorists stay on client pages.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { authReady, isAuthenticated, accountType } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<BootPhase>("loading");

  useEffect(() => {
    if (!authReady) return;
    try {
      const introDone = sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
      if (!introDone) {
        setPhase("intro");
        return;
      }
      if (isAuthenticated) {
        setPhase("ready");
        return;
      }
      const entryDone = sessionStorage.getItem(ENTRY_SESSION_KEY) === "1";
      // Guest on /login root always sees brand entry sheet
      if (!entryDone || isBrandEntryRoute(pathname)) {
        if (isBrandEntryRoute(pathname)) {
          try {
            sessionStorage.removeItem(ENTRY_SESSION_KEY);
          } catch {
            /* ignore */
          }
        }
        setPhase(
          !entryDone || isBrandEntryRoute(pathname) ? "entry" : "ready"
        );
        return;
      }
      setPhase("ready");
    } catch {
      setPhase("intro");
    }
  }, [authReady, isAuthenticated, pathname]);

  const completeIntro = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("entry");
  }, []);

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

  // Signed-in → leave auth routes
  useEffect(() => {
    if (!authReady || phase !== "ready" || !isAuthenticated) return;
    if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
      router.replace(homePathForAccount(accountType));
    }
  }, [authReady, phase, isAuthenticated, pathname, accountType, router]);

  // Role lock: pro ↔ pro pages only; motorist ↔ client pages only
  useEffect(() => {
    if (!authReady || phase !== "ready" || !isAuthenticated) return;
    if (isPublicPath(pathname)) return;
    if (!canAccessPath(accountType, pathname)) {
      router.replace(homePathForAccount(accountType));
    }
  }, [authReady, phase, isAuthenticated, pathname, accountType, router]);

  // Guest on protected app route → brand entry
  useEffect(() => {
    if (!authReady || phase === "loading" || phase === "intro") return;
    if (isAuthenticated) return;
    if (isPublicPath(pathname) && !isBrandEntryRoute(pathname)) return;
    if (!isPublicPath(pathname)) {
      setPhase("entry");
      router.replace("/login");
    }
  }, [authReady, phase, isAuthenticated, pathname, router]);

  if (!authReady || phase === "loading") {
    return (
      <div
        className="h-full w-full"
        style={{ backgroundColor: AUTH_BG }}
        aria-hidden
      />
    );
  }

  if (phase === "intro") {
    return <IntroScreen onComplete={completeIntro} />;
  }

  if (phase === "entry" && !isAuthenticated) {
    return (
      <BrandEntryScreen
        onLogIn={() => finishEntry("/login/signin")}
        onSignUp={() => finishEntry("/login/role")}
      />
    );
  }

  if (!isAuthenticated && !isPublicPath(pathname)) {
    return (
      <div
        className="h-full w-full"
        style={{ backgroundColor: AUTH_BG }}
        aria-hidden
      />
    );
  }

  return <>{children}</>;
}
