"use client";

import { NEGOTIATE_WINDOW_MS } from "@/lib/jobs/constants";
import { useExactCountdown } from "@/lib/jobs/use-exact-countdown";
import { secondsLeftFloor } from "@/lib/jobs/countdown-math";
import { serverNow } from "@/lib/jobs/server-clock";
import { cn } from "@/lib/utils";

export function CountdownTimer({
  endsAt,
  onExpire,
  className,
  /** Total window for progress bar (defaults to 20 min negotiation) */
  totalMs = NEGOTIATE_WINDOW_MS,
  /** bar = slim strip; ring = large circular timer with time in the center */
  variant = "bar",
  size = 168,
}: {
  endsAt: string;
  onExpire?: () => void;
  className?: string;
  totalMs?: number;
  variant?: "bar" | "ring";
  /** Ring diameter in px */
  size?: number;
}) {
  // Exact-expiry countdown: fires onExpire at the deadline itself, never a
  // whole second late, and re-syncs the server clock so both roles count the
  // same absolute moment with the same remaining seconds.
  const { displayMs: left } = useExactCountdown(endsAt, onExpire);

  const totalSec = secondsLeftFloor(new Date(endsAt).getTime(), serverNow());
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  /**
   * Pairing is 66s show "66s"… not "01:06" (reads as 1 minute).
   * Short windows ≤ 99s always display remaining seconds only.
   */
  const shortSecondsOnly = totalMs > 0 && totalMs <= 99_000;
  const timeLabel = shortSecondsOnly
    ? `${totalSec}s`
    : h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  // Last hour red for multi-hour windows; last 15s for short pairing; last min for negotiate
  const urgent = shortSecondsOnly
    ? totalSec <= 15
    : h > 0
      ? totalSec <= 3600
      : totalSec <= 60;
  const denom = totalMs > 0 ? totalMs : NEGOTIATE_WINDOW_MS;
  const pct = Math.min(100, Math.max(0, (left / denom) * 100));

  if (variant === "ring") {
    const stroke = 6;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    const strokeColor = urgent ? "#ef4444" : "#FF6B35";
    // Visible track on both light/dark stages (not washed-out gray)
    const trackColor = urgent
      ? "rgba(239,68,68,0.28)"
      : "rgba(224,122,61,0.28)";

    return (
      <div
        className={cn(
          "relative mx-auto flex items-center justify-center",
          className,
        )}
        style={{ width: size, height: size }}
        role="timer"
        aria-live="polite"
        aria-label={`Time left ${timeLabel}`}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            className="transition-[stroke-dasharray] duration-300 ease-linear"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p
            className={cn(
              "text-[28px] font-semibold tabular-nums tracking-tight leading-none",
              urgent ? "text-red-500" : "text-inherit",
            )}
          >
            {timeLabel}
          </p>
          <p
            className={cn(
              "mt-1.5 text-[10px] font-medium tracking-wide",
              urgent ? "text-red-500/80" : "text-inherit opacity-55",
            )}
          >
            remaining
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-black">
          Time left
        </p>
        <p
          className={cn(
            "text-[15px] font-semibold tabular-nums tracking-tight leading-none",
            urgent ? "text-red-500" : "text-inherit",
          )}
        >
          {timeLabel}
        </p>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-black/15 dark:bg-white/15">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            urgent ? "bg-red-500" : "bg-[#FF6B35]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
