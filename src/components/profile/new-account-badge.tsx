"use client";

import {
  rulesForTier,
  resolveVisibilityTier,
  type VisibilityTier,
} from "@/lib/artisan/visibility-tiers";
import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * “New” badge for accounts on visibility Tier 1-2 only.
 * Off at Tier 3+ (admin ladder).
 */
export function shouldShowNewAccountBadge(
  visibilityTier: number | null | undefined,
  opts?: { status?: string | null },
): boolean {
  const tier = resolveVisibilityTier({
    visibilityTier: visibilityTier as VisibilityTier | undefined,
    status: (opts?.status as ArtisanVerificationProfile["status"]) || "draft",
  });
  return rulesForTier(tier).showNewBadge;
}

export function NewAccountBadge({
  visibilityTier,
  status,
  size = "sm",
  className,
}: {
  /** 1-4 artisan visibility tier */
  visibilityTier?: number | null;
  status?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useT();
  if (!shouldShowNewAccountBadge(visibilityTier, { status })) {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-bold uppercase tracking-wide text-[#FF6B35]",
        size === "md" ? "text-[10px]" : "text-[9px]",
        className,
      )}
      aria-label={t("badge.newAccount")}
    >
      {t("badge.newAccount")}
    </span>
  );
}
