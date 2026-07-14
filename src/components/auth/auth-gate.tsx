"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BrandEntryScreen } from "@/components/auth/brand-entry-screen";
import { IntroScreen } from "@/components/auth/intro-screen";
import {
  canAccessPath,
  homePathForAccount,
  isPublicPath,
} from "@/lib/routes";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const INTRO_SESSION_KEY = "oga-mecho-intro-done";
const ENTRY_SESSION_KEY = "oga-mecho-entry-done";
const HANDOFF_MS = 780;

/** Routes that should re-show the brand Log In / Sign Up sheet */
function isBrandEntryRoute(pathname: string) {
  return pathname === "/login" || pathname === "/";
}

type BootPhase = "loading" | "intro" | "handoff" | "entry" | "ready";

/**
 * 1) Intro video
 * 2) Crossfade into brand image + Log In / Sign Up (no white flash)
 * 3) Log In / Sign Up continue into the app
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { authReady, isAuthenticated, accountType } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<BootPhase>("loading");
  const [introFading, setIntroFading] = useState(false);

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
    // Keep video on top, fade it out over brand entry (black underlay — no gray/white)
    setPhase("handoff");
    // Next frame so entry mounts under video first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIntroFading(true));
    });
    window.setTimeout(() => {
      setPhase("entry");
      setIntroFading(false);
    }, HANDOFF_MS);
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

  // Role lock
  useEffect(() => {
    if (!authReady || phase !== "ready" || !isAuthenticated) return;
    if (isPublicPath(pathname)) return;
    if (!canAccessPath(accountType, pathname)) {
      router.replace(homePathForAccount(accountType));
    }
  }, [authReady, phase, isAuthenticated, pathname, accountType, router]);

  // Guest on protected app route → brand entry
  useEffect(() => {
    if (!authReady || phase === "loading" || phase === "intro" || phase === "handoff")
      return;
    if (isAuthenticated) return;
    if (isPublicPath(pathname) && !isBrandEntryRoute(pathname)) return;
    if (!isPublicPath(pathname)) {
      setPhase("entry");
      router.replace("/login");
    }
  }, [authReady, phase, isAuthenticated, pathname, router]);

  // Boot: pure black — never flash sheet gray/white before video/brand
  if (!authReady || phase === "loading") {
    return (
      <div className="h-full w-full bg-black" aria-hidden />
    );
  }

  // Intro + handoff crossfade into brand entry
  if (phase === "intro" || phase === "handoff") {
    return (
      <div className="relative h-full w-full overflow-hidden bg-black">
        {/* Brand mounts under the video during handoff so crossfade never hits white */}
        {(phase === "handoff" || phase === "entry") && !isAuthenticated && (
          <div className="absolute inset-0 z-0">
            <BrandEntryScreen
              onLogIn={() => finishEntry("/login/signin")}
              onSignUp={() => finishEntry("/login/role")}
              animateIn
            />
          </div>
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
    return <div className="h-full w-full bg-black" aria-hidden />;
  }

  return <>{children}</>;
}
