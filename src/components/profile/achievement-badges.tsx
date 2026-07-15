"use client";

import { Award } from "lucide-react";
import {
  badgesForJobs,
  topBadgeForJobs,
  type AchievementBadge,
} from "@/lib/profile-system";
import { cn } from "@/lib/utils";

export function AchievementBadgesRow({
  completedJobs,
  className,
  compact,
}: {
  completedJobs: number;
  className?: string;
  compact?: boolean;
}) {
  const badges = badgesForJobs(completedJobs);
  if (badges.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {badges.map((b) => (
        <BadgeChip key={b.id} badge={b} compact={compact} />
      ))}
    </div>
  );
}

export function BadgeChip({
  badge,
  compact,
}: {
  badge: AchievementBadge;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold shadow-sm",
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      )}
      style={{
        backgroundColor: badge.bg,
        color: badge.fg,
        boxShadow: `0 0 0 1px ${badge.ring}`,
      }}
      title={`${badge.label} · ${badge.minJobs}+ jobs`}
    >
      <Award className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.5} />
      {badge.label}
    </span>
  );
}

/** Compact glyph for map markers */
export function MapBadgeGlyph({ completedJobs }: { completedJobs: number }) {
  const top = topBadgeForJobs(completedJobs);
  if (!top) return null;
  return (
    <span
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[8px] font-black"
      style={{ backgroundColor: top.bg, color: top.fg }}
      aria-label={top.label}
    >
      {top.label[0]}
    </span>
  );
}
