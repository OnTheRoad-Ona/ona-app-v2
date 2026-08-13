"use client";

import { useEffect, useRef, useState } from "react";
import { refreshServerClock, serverNow } from "@/lib/jobs/server-clock";
import {
  exactFireDelayMs,
  isDeadlinePast,
} from "@/lib/jobs/countdown-math";

/**
 * Countdown to a server-issued deadline that FIRES at the exact moment the
 * window ends — never a whole tick late, never a second early.
 *
 * The deadline is an absolute server timestamp. Any two phones counting the
 * same deadline (customer ring + pro popup) therefore hit zero at the same
 * real moment. When the countdown starts we refresh the server-clock estimate
 * (only if it is stale) so a slow-to-load phone shows the SAME remaining
 * seconds as the phone that started earlier.
 *
 * - `displayMs`: live remaining ms, updated once per second — cheap even for
 *   the 6-hour auto-release window.
 * - `onExpire`: fires ~25ms after the deadline passes, once. A deadline that
 *   is already in the past fires on mount.
 */
export function useExactCountdown(
  endsAt: string,
  onExpire?: () => void
): { displayMs: number } {
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const endsMs = new Date(endsAt).getTime();

  const [displayMs, setDisplayMs] = useState(() =>
    Math.max(0, endsMs - serverNow())
  );

  useEffect(() => {
    let fired = false;

    let fireTimer = 0;
    let displayTimer = 0;
    const fire = () => {
      if (fired) return;
      fired = true;
      window.clearTimeout(fireTimer);
      window.clearInterval(displayTimer);
      setDisplayMs(0);
      onExpireRef.current?.();
    };

    const schedule = (nowMs: number) => {
      window.clearTimeout(fireTimer);
      const delay = exactFireDelayMs(endsMs, nowMs);
      if (delay <= 0) {
        fire();
        return;
      }
      // Exact moment: fire just after the deadline passes.
      fireTimer = window.setTimeout(fire, delay);
    };

    const startLiveTick = () => {
      window.clearInterval(displayTimer);
      displayTimer = window.setInterval(() => {
        setDisplayMs(Math.max(0, endsMs - serverNow()));
      }, 1000);
    };

    // Safety net on the (possibly stale) estimate so expiry is never late.
    schedule(serverNow());

    // Align the clock FIRST, then start the visible countdown from the true
    // remaining time. The live tick never runs on a stale estimate, so the
    // timer doesn't "start counting before the visuals load" — the first
    // painted value is already the freshly-aligned remaining time.
    void refreshServerClock().then(() => {
      if (fired) return;
      const nowMs = serverNow();
      setDisplayMs(Math.max(0, endsMs - nowMs));
      if (isDeadlinePast(endsMs, nowMs)) {
        fire();
      } else {
        schedule(nowMs);
        startLiveTick();
      }
    });

    return () => {
      window.clearTimeout(fireTimer);
      window.clearInterval(displayTimer);
    };
  }, [endsMs]);

  return { displayMs };
}
