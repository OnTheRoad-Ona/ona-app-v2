"use client";

/**
 * After reload / cold start: wait until auth is ready AND the browser has
 * actually finished loading the page (window "load" event / readyState
 * "complete"), then a short paint settle only then show lower panels / OTP /
 * bank gates. The previous fixed 480ms settle fire ahead of slow page loads;
 * panels must not mount over a still-booting page.
 */

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

const DEFAULT_SETTLE_MS = 480;

function pageIsLoaded(): boolean {
  return typeof document !== "undefined" && document.readyState === "complete";
}

export function useOverlayGatesReady(settleMs = DEFAULT_SETTLE_MS): boolean {
  const { authReady } = useApp();
  const [pageLoaded, setPageLoaded] = useState(pageIsLoaded);
  const [ready, setReady] = useState(false);

  // Real "page finished loading" signal edge, not timer-driven.
  // window "load" won't refire for in-app navigations, but readyState stays
  // "complete" so pageLoaded persists once true.
  useEffect(() => {
    if (pageLoaded) return;
    const onLoad = () => setPageLoaded(true);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, [pageLoaded]);

  useEffect(() => {
    setReady(false);
    if (!authReady || !pageLoaded) return;

    let cancelled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let raf2 = 0;

    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        settleTimer = setTimeout(() => {
          if (!cancelled) setReady(true);
        }, settleMs);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [authReady, pageLoaded, settleMs]);

  return ready;
}
