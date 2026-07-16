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
}: {
  endsAt: string;
  onExpire?: () => void;
  className?: string;
  totalMs?: number;
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
  const urgent = totalSec <= 60;
  const denom = totalMs > 0 ? totalMs : NEGOTIATE_WINDOW_MS;
  const pct = Math.min(100, Math.max(0, (left / denom) * 100));

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
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </p>
      </div>
      {/* Slim progress track */}
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
