"use client";

import Link from "next/link";
import {
  Clock3,
  MessageCircle,
  Navigation,
  Star,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CallButton } from "@/components/call/in-app-call";
import { AchievementBadgesRow } from "@/components/profile/achievement-badges";
import { ProfileSection, ProfileShell } from "@/components/profile/profile-shell";
import { RadiusMapPreview } from "@/components/profile/radius-map-preview";
import { SkillsChips } from "@/components/profile/skills-chips";
import { VerificationMark } from "@/components/profile/verification-mark";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import {
  detectCurrency,
  formatMoney,
  getBaseLabourPrice,
  LABOUR_FEE_DISCLAIMER,
} from "@/lib/pricing";
import {
  formatExperience,
  profileTheme,
  type ProfileReview,
} from "@/lib/profile-system";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

/**
 * 1. Motorist viewing Repair Pro — 100% read-only.
 */
export function ProPublicView({
  tech,
  isLight,
  reviews = [],
  onRequest,
}: {
  tech: Technician;
  isLight: boolean;
  reviews?: ProfileReview[];
  onRequest: () => void;
}) {
  const t = profileTheme(isLight);
  const jobs = tech.jobsCompleted ?? tech.reviewCount ?? 0;
  // Primary trade + any specialty-matched services for chip display
  const skills = Array.from(
    new Set([
      tech.serviceType,
      ...(tech.specialties || [])
        .map((s) => s.toLowerCase())
        .flatMap((s) => {
          const map: Record<string, typeof tech.serviceType | undefined> = {
            mechanic: "mechanic",
            vulcanizer: "vulcanizer",
            tow: "towing",
            towing: "towing",
            battery: "battery",
            ac: "ac",
            body: "body",
            electric: "electrical",
            electrical: "electrical",
            scan: "diagnostics",
            diagnostics: "diagnostics",
            wash: "wash",
          };
          const hit = Object.entries(map).find(([k]) => s.includes(k));
          return hit?.[1] ? [hit[1]] : [];
        }),
    ])
  );
  const photo = tech.photo?.trim() || DEFAULT_VENDOR_PHOTO;
  const skillLabel =
    tech.roleLabel ||
    skills[0] ||
    tech.serviceType ||
    "Repair Pro";
  const statusText =
    tech.status === "available"
      ? "Available now"
      : tech.status === "busy"
        ? "Busy"
        : tech.status === "offline"
          ? "Offline"
          : tech.status === "nearby"
            ? "Nearby"
            : tech.status;

  const demoReviews: ProfileReview[] =
    reviews.length > 0
      ? reviews
      : [
          {
            id: "r1",
            authorName: "Ada O.",
            rating: 5,
            date: "2 days ago",
            comment: "Fast, professional, and fixed my battery on the spot.",
          },
          {
            id: "r2",
            authorName: "Chidi M.",
            rating: 4.5,
            date: "1 week ago",
            comment: "Good communication and fair pricing.",
          },
        ];

  return (
    <ProfileShell
      isLight={isLight}
      title="Repair Pro Profile"
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            <CallButton
              target={{
                name: tech.name,
                phone: tech.phone || "",
                photo: photo,
                roleLabel: skillLabel,
              }}
              className={
                isLight
                  ? "bg-black/8 text-slate-900"
                  : "bg-[#2c2c2e] text-white"
              }
            />
            <Button
              variant="secondary"
              asChild
              className={cn(
                "h-11 border-0 shadow-none",
                isLight
                  ? "bg-black/8 text-slate-900"
                  : "bg-[#2c2c2e] text-white"
              )}
            >
              <Link href="/messages" onClick={(e) => e.stopPropagation()}>
                <MessageCircle className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          </div>
          <Button size="lg" className="h-12 w-full" onClick={onRequest}>
            <Zap className="h-4 w-4" />
            Request Help
          </Button>
        </>
      }
    >
      <ProfileSection isLight={isLight}>
        <div className="flex items-start gap-3">
          <Avatar className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-0 ring-0">
            <AvatarImage
              src={photo}
              alt={tech.name}
              className="h-full w-full object-cover"
            />
            <AvatarFallback className="bg-brand text-sm font-bold text-white">
              {avatarInitials(tech.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className={cn("flex items-center gap-1 text-[18px] font-black leading-tight", t.ink)}>
              <span className="truncate">{tech.name}</span>
              <VerificationMark force={tech.verified} size="lg" />
            </p>
            {tech.businessName && (
              <p className={cn("mt-0.5 text-[12px] font-semibold", t.soft)}>
                {tech.businessName}
              </p>
            )}
            <p className={cn("mt-1 text-[12px] font-medium", t.muted)}>
              {formatExperience(tech.yearsExperience)}
            </p>
            <AchievementBadgesRow completedJobs={jobs} className="mt-2" />
          </div>
        </div>

        <div className="mt-2">
          <SkillsChips selected={skills} isLight={isLight} />
        </div>

        <div
          className={cn(
            "mt-2.5 rounded-xl px-2 py-2",
            isLight ? "bg-black/[0.04]" : "bg-[#2c2c2e]"
          )}
        >
          <div className="flex justify-center">
            <StarRatingDisplay
              rating={tech.rating}
              size="sm"
              className={cn("justify-center font-bold", t.ink)}
            />
          </div>
          <p className={cn("mt-0.5 text-center text-[10px]", t.muted)}>
            {tech.reviewCount} reviews
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-1 text-center">
            <div>
              <p className={cn("text-[14px] font-bold tabular-nums", t.ink)}>
                {jobs}
              </p>
              <p className={cn("text-[10px]", t.muted)}>Jobs done</p>
            </div>
            <div>
              <p className="text-[12px] font-bold text-brand">{statusText}</p>
              <p className={cn("text-[10px]", t.muted)}>Status</p>
            </div>
          </div>
        </div>

        <p className={cn("mt-2 flex items-center gap-1 text-[11px] font-medium", t.soft)}>
          <Navigation className="h-3 w-3 text-brand" />
          {formatDistance(tech.distanceKm)} away · ETA {formatEta(tech.etaMinutes)}
        </p>
      </ProfileSection>

      <ProfileSection title="Service area" isLight={isLight}>
        <RadiusMapPreview
          radiusKm={tech.serviceRadiusKm || 10}
          label={tech.servedLocation || tech.name}
          isLight={isLight}
        />
      </ProfileSection>

      <ProfileSection title="About" isLight={isLight}>
        <p className={cn("text-[13px] leading-snug", t.soft)}>
          {(tech.bio || tech.description || "No bio yet.").slice(0, 144)}
        </p>
      </ProfileSection>

      <ProfileSection title="Labour prices" isLight={isLight}>
        <p className={cn("mb-2 text-[10px] leading-snug", t.muted)}>
          {LABOUR_FEE_DISCLAIMER}
        </p>
        <ul className="space-y-1.5">
          {skills.map((s) => {
            const cur =
              tech.pricingCurrency ||
              detectCurrency({ countryName: tech.servedCountry });
            const major = getBaseLabourPrice(tech.servicePrices, s);
            return (
              <li key={s} className={cn("flex justify-between text-[12px]", t.ink)}>
                <span className="font-semibold capitalize">
                  {s.replace(/_/g, " ")}
                </span>
                <span className={cn("font-bold", major != null ? "text-brand" : t.muted)}>
                  {formatMoney(major, cur)}
                </span>
              </li>
            );
          })}
        </ul>
      </ProfileSection>

      <ProfileSection title="Recent reviews" isLight={isLight}>
        <div className="max-h-48 space-y-2 overflow-y-auto scrollbar-hide">
          {demoReviews.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-xl px-2.5 py-2",
                isLight ? "bg-black/[0.04]" : "bg-[#2c2c2e]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-[12px] font-bold", t.ink)}>{r.authorName}</p>
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" />
                  {r.rating}
                </span>
              </div>
              <p className={cn("mt-0.5 text-[10px]", t.muted)}>{r.date}</p>
              <p className={cn("mt-1 text-[12px] leading-snug", t.soft)}>
                {r.comment}
              </p>
            </div>
          ))}
        </div>
        <p className={cn("mt-2 flex items-center justify-center gap-1 text-[10px]", t.muted)}>
          <Clock3 className="h-3 w-3" />
          Typical reply {formatEta(tech.etaMinutes)}
        </p>
      </ProfileSection>
    </ProfileShell>
  );
}
