"use client";

import { useEffect, useState } from "react";
import { NEGOTIATE_WINDOW_MS } from "@/lib/jobs/constants";
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
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(endsAt).getTime() - Date.now())
  );

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setLeft(ms);
      if (ms <= 0) onExpire?.();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt, onExpire]);

  const totalSec = Math.floor(left / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeLabel = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const urgent = totalSec <= 60;
  const denom = totalMs > 0 ? totalMs : NEGOTIATE_WINDOW_MS;
  const pct = Math.min(100, Math.max(0, (left / denom) * 100));

  if (variant === "ring") {
    const stroke = 6;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    const strokeColor = urgent ? "#ef4444" : "#e07a3d";
    const trackColor = urgent
      ? "rgba(239,68,68,0.18)"
      : "rgba(224,122,61,0.18)";

    return (
      <div
        className={cn(
          "relative mx-auto flex items-center justify-center",
          className
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
              urgent ? "text-red-500" : "text-inherit"
            )}
          >
            {timeLabel}
          </p>
          <p
            className={cn(
              "mt-1.5 text-[10px] font-medium tracking-wide",
              urgent ? "text-red-500/80" : "text-inherit opacity-55"
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
        <p className="text-[10px] font-medium tracking-wide text-[#e07a3d]">
          Time left
        </p>
        <p
          className={cn(
            "text-[15px] font-semibold tabular-nums tracking-tight leading-none",
            urgent ? "text-red-500" : "text-inherit"
          )}
        >
          {timeLabel}
        </p>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-black/15 dark:bg-white/15">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            urgent ? "bg-red-500" : "bg-[#e07a3d]"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
