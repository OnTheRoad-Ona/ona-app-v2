"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandSplashScreen } from "@/components/auth/brand-splash-screen";
import { IntroScreen } from "@/components/auth/intro-screen";
import { useApp } from "@/lib/store";

const INTRO_SESSION_KEY = "oga-mecho-intro-done";
const SPLASH_SESSION_KEY = "oga-mecho-splash-done";

const PUBLIC_PATHS = new Set(["/login", "/logout"]);

type BootPhase = "loading" | "intro" | "splash" | "ready";

/**
 * App open flow (each browser session):
 * 1) Intro video
 * 2) High-res brand image (logo only)
 * 3) If signed in → home / dashboard (skip login)
 * 4) If not signed in → login
 * Logout clears auth so step 4 runs again next time.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { authReady, isAuthenticated, registeredAs } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<BootPhase>("loading");

  useEffect(() => {
    try {
      const introDone = sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
      const splashDone = sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
      if (!introDone) setPhase("intro");
      else if (!splashDone) setPhase("splash");
      else setPhase("ready");
    } catch {
      setPhase("intro");
    }
  }, []);

  const completeIntro = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("splash");
  }, []);

  const completeSplash = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("ready");
  }, []);

  // After boot: signed-in users never sit on login
  useEffect(() => {
    if (!authReady || phase !== "ready") return;
    if (isAuthenticated && pathname === "/login") {
      router.replace(registeredAs === "client" ? "/" : "/dashboard");
    }
  }, [authReady, phase, isAuthenticated, pathname, registeredAs, router]);

  // After boot: guests must sign in (except public auth pages)
  useEffect(() => {
    if (!authReady || phase !== "ready") return;
    if (PUBLIC_PATHS.has(pathname)) return;
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [authReady, phase, isAuthenticated, pathname, router]);

  // After splash, send signed-in users home if they landed on root cold-start
  useEffect(() => {
    if (!authReady || phase !== "ready" || !isAuthenticated) return;
    if (pathname === "/" || pathname === "/login") {
      // stay on / for motorists; pros open dashboard once after splash
      if (pathname === "/login") {
        router.replace(registeredAs === "client" ? "/" : "/dashboard");
      } else if (registeredAs !== "client" && pathname === "/") {
        // only auto-route pros if they just finished boot on /
        // Don't force every visit — RoleBootstrap used to do session once.
        // Keep simple: pros who open app go dashboard only from login redirect.
      }
    }
  }, [authReady, phase, isAuthenticated, pathname, registeredAs, router]);

  if (!authReady || phase === "loading") {
    return <div className="h-full w-full bg-[#c4784a]" aria-hidden />;
  }

  if (phase === "intro") {
    return <IntroScreen onComplete={completeIntro} />;
  }

  if (phase === "splash") {
    return <BrandSplashScreen onComplete={completeSplash} />;
  }

  // Guests redirecting to login — copper frame avoids black flash
  if (!isAuthenticated && !PUBLIC_PATHS.has(pathname)) {
    return <div className="h-full w-full bg-[#c4784a]" aria-hidden />;
  }

  return <>{children}</>;
}
