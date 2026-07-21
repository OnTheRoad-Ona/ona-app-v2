"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapBadgeGlyph } from "@/components/profile/achievement-badges";
import { NewAccountBadge } from "@/components/profile/new-account-badge";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import {
  proCtaKind,
  proCtaLabel,
  type ProCtaKind,
} from "@/lib/jobs/motorist-pro-cta";
import type { JobRecord } from "@/lib/jobs/types";
import {
  formatMoney,
  getBaseLabourPrice,
  type AppCurrency,
} from "@/lib/pricing";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";
import { useApp } from "@/lib/store";

/**
 * Row inside the continuous professional list banner.
 * Request → Open (accepted) → Booked (working); Open/Booked open live job.
 */
export function TechCard({
  tech,
  onRequest,
  selected,
  activeJob,
  onOpenJob,
}: {
  tech: Technician;
  onRequest?: (tech: Technician) => void;
  compact?: boolean;
  selected?: boolean;
  /** Active job with this pro (if any) */
  activeJob?: JobRecord | null;
  onOpenJob?: (jobId: string) => void;
}) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const cta: ProCtaKind = proCtaKind(activeJob);
  const label = proCtaLabel(cta, false);
  const showAction =
    Boolean(onRequest || onOpenJob) &&
    (tech.status !== "offline" || cta !== "request");

  return (
    <article
      className={cn(
        "flex items-center gap-2.5 border-l-2 px-3 py-2.5 transition-colors",
        selected
          ? isLight
            ? "border-brand bg-[#c5ccd8] shadow-[inset_0_0_0_1px_rgba(30,41,59,0.08)]"
            : "border-brand bg-white/[0.1]"
          : "border-transparent bg-transparent"
      )}
      aria-selected={selected}
    >
      <Link
        href={`/technician/${tech.id}`}
        className="shrink-0"
        aria-label={`View ${tech.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar className="h-10 w-10 overflow-hidden rounded-full border-0 bg-transparent shadow-none ring-0">
          <AvatarImage
            src={
              tech.photo && tech.photo.trim().length > 0
                ? tech.photo
                : DEFAULT_VENDOR_PHOTO
            }
            alt={tech.name}
            className="h-full w-full object-cover object-center"
          />
          <AvatarFallback className="bg-brand text-[11px] font-bold text-white">
            {avatarInitials(tech.name, tech.shortName || "PR")}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/technician/${tech.id}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-1 text-[13px] font-bold hover:underline",
                isLight ? "text-slate-900" : "text-[#f0f0f0]"
              )}
            >
              <span className="truncate">{tech.shortName}</span>
              <NewAccountBadge
                visibilityTier={
                  tech.visibilityTier ?? (tech.isNewArtisan ? 1 : 4)
                }
                isProfessional
                size="sm"
              />
              {tech.verified && (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 fill-none text-sky-500"
                  strokeWidth={2.25}
                  aria-label="Verified"
                />
              )}
              <MapBadgeGlyph
                completedJobs={tech.jobsCompleted ?? tech.reviewCount ?? 0}
              />
            </Link>
            <p
              className={cn(
                "truncate text-[10px]",
                isLight ? "text-slate-600" : "text-[#a8a8a8]"
              )}
            >
              {tech.roleLabel}
              <span className="mx-1 opacity-40">·</span>
              <span
                className={cn(
                  "font-bold",
                  tech.status === "available" &&
                    (isLight ? "text-emerald-700" : "text-emerald-400"),
                  tech.status === "busy" &&
                    (isLight ? "text-[#FF6B35]" : "text-[#FF6B35]"),
                  tech.status === "nearby" &&
                    (isLight ? "text-sky-700" : "text-sky-400"),
                  tech.status === "offline" &&
                    (isLight ? "text-slate-500" : "text-[#999]")
                )}
              >
                {tech.status === "available"
                  ? "Available"
                  : tech.status === "busy"
                    ? "Busy"
                    : tech.status === "nearby"
                      ? "Nearby"
                      : "Offline"}
              </span>
            </p>
          </div>

          {showAction && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (cta !== "request" && activeJob?.id) {
                  onOpenJob?.(activeJob.id);
                  return;
                }
                onRequest?.(tech);
              }}
              className={cn(
                "shrink-0 border-0 bg-transparent px-1 py-1 text-[12px] font-bold",
                cta === "booked"
                  ? isLight
                    ? "text-emerald-800"
                    : "text-emerald-400"
                  : cta === "open"
                    ? isLight
                      ? "text-sky-800"
                      : "text-sky-300"
                    : isLight
                      ? "text-brand hover:text-brand-deep"
                      : "text-[#ffb07a] hover:text-white"
              )}
            >
              {label}
            </button>
          )}
        </div>

        <div
          className={cn(
            "mt-0.5 flex flex-col gap-0.5 text-[10px]",
            isLight ? "text-slate-600" : "text-[#b5b5b5]"
          )}
        >
          <StarRatingDisplay
            rating={tech.rating}
            size="sm"
            className="font-semibold"
          />
          <span>
            {formatEta(tech.etaMinutes)}
            <span className="mx-1 opacity-40">·</span>
            {formatDistance(tech.distanceKm)}
            {(() => {
              const labour = getBaseLabourPrice(
                tech.servicePrices,
                tech.serviceType
              );
              if (labour == null) return null;
              const cur = (tech.pricingCurrency || "NGN") as AppCurrency;
              return (
                <>
                  <span className="mx-1 opacity-40">·</span>
                  <span className="font-bold text-brand">
                    {formatMoney(labour, cur)}
                  </span>
                </>
              );
            })()}
          </span>
        </div>
      </div>
    </article>
  );
}
