"use client";

import { BadgeCheck, Shield } from "lucide-react";
import {
  hasVerificationMark,
  resolveVerificationTier,
  verificationTierLabel,
  type VerificationTier,
} from "@/lib/profile-system";
import type { UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VerificationMark({
  profile,
  force,
  size = "md",
  className,
}: {
  profile?: UserProfile | null;
  force?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const show = force || hasVerificationMark(profile);
  if (!show) return null;
  const dim =
    size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <BadgeCheck
      className={cn(dim, "shrink-0 text-sky-500", className)}
      strokeWidth={2.4}
      aria-label="Verified"
    />
  );
}

export function TierBadge({
  tier,
  isLight,
  className,
}: {
  tier: VerificationTier;
  isLight: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
        tier >= 3
          ? "bg-sky-500/20 text-sky-500"
          : tier === 2
            ? "bg-amber-500/20 text-amber-500"
            : isLight
              ? "bg-black/10 text-slate-700"
              : "bg-[#2c2c2e] text-white/80",
        className
      )}
    >
      <Shield className="h-3 w-3" />
      {verificationTierLabel(tier)}
    </span>
  );
}

export function TierProgress({
  profile,
  isLight,
}: {
  profile: UserProfile | null | undefined;
  isLight: boolean;
}) {
  const tier = resolveVerificationTier(profile);
  const steps = [
    {
      n: 1 as const,
      label: "Phone + Email",
      done: Boolean(profile?.phone && profile?.email),
    },
    {
      n: 2 as const,
      label: "NIN + BVN + Face",
      done: Boolean(
        profile?.ninVerified &&
          profile?.bvnVerified &&
          (profile?.faceLivenessVerified || profile?.identityVerifiedAt)
      ),
    },
    {
      n: 3 as const,
      label: "In-person mark",
      done: Boolean(profile?.inPersonVerified),
    },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TierBadge tier={tier} isLight={isLight} />
        <span
          className={cn(
            "text-[11px] font-medium",
            isLight ? "text-slate-600" : "text-[#a1a1a6]"
          )}
        >
          {tier < 3
            ? `Next: ${steps[tier]?.label ?? "Complete"}`
            : "Fully verified"}
        </span>
      </div>
      <div className="flex gap-1.5">
        {steps.map((s) => (
          <div
            key={s.n}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              s.done ? "bg-brand" : isLight ? "bg-black/10" : "bg-white/10"
            )}
            title={s.label}
          />
        ))}
      </div>
    </div>
  );
}
