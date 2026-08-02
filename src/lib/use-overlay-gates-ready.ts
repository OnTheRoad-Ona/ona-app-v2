"use client";

/**
 * After reload / cold start: wait until auth is ready, the first paint has
 * landed, then a short settle — only then show lower panels / OTP / bank gates.
 */

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

const DEFAULT_SETTLE_MS = 480;

export function useOverlayGatesReady(settleMs = DEFAULT_SETTLE_MS): boolean {
  const { authReady } = useApp();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authReady) {
      setReady(false);
      return;
    }

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
  }, [authReady, settleMs]);

  return ready;
}
