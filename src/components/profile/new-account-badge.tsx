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
 * “New” badge for Repair Pros on visibility Tier 1–2 only.
 * Off at Tier 3+ (admin ladder). Customers never show this badge.
 */
export function shouldShowNewAccountBadge(
  visibilityTier: number | null | undefined,
  opts?: { isProfessional?: boolean; status?: string | null }
): boolean {
  if (opts?.isProfessional === false) return false;
  const tier = resolveVisibilityTier({
    visibilityTier: visibilityTier as VisibilityTier | undefined,
    status: (opts?.status as ArtisanVerificationProfile["status"]) || "draft",
  });
  return rulesForTier(tier).showNewBadge;
}

export function NewAccountBadge({
  visibilityTier,
  status,
  isProfessional = true,
  size = "sm",
  className,
}: {
  /** 1–4 artisan visibility tier (Repair Pro only) */
  visibilityTier?: number | null;
  status?: string | null;
  isProfessional?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useT();
  if (
    !shouldShowNewAccountBadge(visibilityTier, {
      isProfessional,
      status,
    })
  ) {
    return null;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-bold uppercase tracking-wide text-[#FF6B35]",
        size === "md" ? "text-[10px]" : "text-[9px]",
        className
      )}
      aria-label={t("badge.newAccount")}
    >
      {t("badge.newAccount")}
    </span>
  );
}
