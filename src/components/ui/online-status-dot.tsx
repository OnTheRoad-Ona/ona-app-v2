"use client";

import { cn } from "@/lib/utils";

/**
 * Gentle green pulsing dot = Online (replaces "Available" text).
 * Other statuses stay as short text.
 */
export function OnlineStatusDot({
  status,
  className,
  showLabel = false,
}: {
  status?: string | null;
  className?: string;
  /** When true, show Busy / Offline label next to non-online states */
  showLabel?: boolean;
}) {
  const s = (status || "").toLowerCase();
  if (s === "available") {
    return (
      <span
        className={cn(
          "relative inline-flex h-1.5 w-1.5 shrink-0 items-center justify-center",
          className
        )}
        title="Online"
        aria-label="Online"
      >
        <span className="absolute inline-flex h-[7px] w-[7px] animate-ping rounded-full bg-emerald-400/30 [animation-duration:2.4s]" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_3px_rgba(16,185,129,0.45)]" />
      </span>
    );
  }
  if (!showLabel) return null;
  const label =
    s === "busy" ? "Busy" : s === "nearby" ? "Nearby" : s === "offline" ? "Offline" : "";
  if (!label) return null;
  return (
    <span className={cn("text-[10px] font-bold", className)}>{label}</span>
  );
}
