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
      <div className="mb-1.5 flex items-end justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#e07a3d]">
          Negotiation timer
        </p>
        <p
          className={cn(
            "font-black tabular-nums tracking-tight",
            urgent ? "text-red-500 text-[28px]" : "text-[26px] text-inherit"
          )}
        >
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
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
