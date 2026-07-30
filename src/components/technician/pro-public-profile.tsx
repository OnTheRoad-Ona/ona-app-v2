"use client";

import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  Car,
  Clock3,
  MapPin,
  Navigation,
  Pencil,
  Wrench,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NewAccountBadge } from "@/components/profile/new-account-badge";
import { OnlineStatusDot } from "@/components/ui/online-status-dot";
import { StarRatingDisplay } from "@/components/ui/star-rating";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { navigateBack } from "@/lib/navigation";
import { publicSkillRows } from "@/lib/skill-questions";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

/**
 * Motorist-facing Repair Pro profile — solid sheets on both toggles
 * (no transparent / glass panels).
 */
export function ProPublicProfile({
  tech,
  isLight = true,
  onRequest,
  backHref = "/",
  isOwnProfile = false,
}: {
  tech: Technician;
  isLight?: boolean;
  onRequest: () => void;
  backHref?: string;
  /** Signed-in pro viewing their own public card */
  isOwnProfile?: boolean;
}) {
  const router = useRouter();
  const skillLabel =
    PRO_SERVICE_LABELS[tech.serviceType] ?? tech.roleLabel ?? "Repair Pro";
  const skillRows = publicSkillRows(tech.serviceType, tech.skillAnswers);
  const hasCustomPhoto = Boolean(tech.photo && tech.photo.trim().length > 0);
  const photoSrc = hasCustomPhoto ? tech.photo.trim() : DEFAULT_VENDOR_PHOTO;

  const serviceFocus = (
    [
      ["Vehicle type", tech.servedVehicleType],
      ["Brand", tech.servedBrand || tech.servedMake],
      ["Model", tech.servedModel],
      ["Country", tech.servedCountry],
      ["State / Region", tech.servedLocation],
    ] as const
  ).filter(([, v]) => v && String(v).trim().length > 0);

  const experienceLabel =
    tech.yearsExperience === "10+"
      ? "10+ years"
      : tech.yearsExperience === "1"
        ? "1 year"
        : tech.yearsExperience
          ? `${tech.yearsExperience} years`
          : null;

  const statusText =
    tech.status === "available"
      ? null
      : tech.status === "nearby"
        ? "Nearby"
        : tech.status === "busy"
          ? "Busy"
          : tech.status === "offline"
            ? "Offline"
            : tech.status;

  // Light: flat sheet, no solid card bars. Dark: solid cards.
  const pageBg = isLight ? "#c8c9cd" : "#000000";
  const cardBg = isLight ? "transparent" : "#1c1c1e";
  const insetBg = isLight ? "transparent" : "#2c2c2e";
  const page = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight
    ? "mb-1.5 rounded-2xl bg-black/[0.04]"
    : "bg-[#1c1c1e]";
  const inset = isLight ? "bg-transparent" : "bg-[#2c2c2e]";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-[#a1a1a6]";
  const soft = isLight ? "text-slate-700" : "text-[#d1d1d6]";
  const solidBtn = isLight
    ? "bg-transparent text-slate-900 hover:bg-black/[0.04]"
    : "bg-[#2c2c2e] text-white hover:bg-[#3a3a3c]";

  return (
    <div
      className={cn("flex h-full flex-col", page)}
      style={{ backgroundColor: pageBg }}
    >
      <div
        className={cn("flex shrink-0 items-center gap-1.5 px-2.5 pb-1 pt-2.5", page)}
        style={{ backgroundColor: pageBg }}
      >
        <button
          type="button"
          onClick={() => navigateBack(router, backHref || "/", null /* parent only */)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border-0 text-base leading-none",
            solidBtn,
            ink
          )}
          style={isLight ? undefined : { backgroundColor: insetBg }}
          aria-label="Back"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex flex-wrap items-center gap-1.5 text-[14px] font-bold leading-none",
              ink
            )}
          >
            <span className="truncate">{tech.name}</span>
            <NewAccountBadge
              visibilityTier={
                tech.visibilityTier ?? (tech.isNewArtisan ? 1 : 4)
              }
              size="sm"
            />
          </p>
          <p className={cn("mt-0.5 truncate text-[11px] font-medium", muted)}>
            {skillLabel}
          </p>
        </div>
        {isOwnProfile ? (
          <button
            type="button"
            onClick={() => router.push("/profile?edit=1")}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg border-0 px-2.5 text-[11px] font-bold",
              solidBtn
            )}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-2 scrollbar-hide">
          {/* Identity */}
          <section
            className={cn(
              isLight ? "rounded-none px-0 py-3" : "rounded-2xl p-3",
              card
            )}
            style={isLight ? undefined : { backgroundColor: cardBg }}
          >
            <div className="flex items-center gap-3">
              <Avatar
                className={cn(
                  "h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-full border-0 shadow-none ring-0",
                  inset
                )}
                style={isLight ? undefined : { backgroundColor: insetBg }}
              >
                <AvatarImage
                  src={photoSrc}
                  alt={tech.name}
                  className="h-full w-full scale-100 object-cover object-center"
                />
                <AvatarFallback className="bg-brand text-sm font-bold text-white">
                  {avatarInitials(tech.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "flex items-center gap-1 text-[17px] font-black leading-tight tracking-tight",
                    ink
                  )}
                >
                  <span className="truncate">{tech.name}</span>
                  {tech.verified && (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-sky-500"
                      strokeWidth={2.25}
                    />
                  )}
                </p>

                {tech.businessName ? (
                  <p className={cn("mt-0.5 truncate text-[12px] font-semibold", soft)}>
                    {tech.businessName}
                  </p>
                ) : null}

                <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-brand">
                  <Wrench className="h-3 w-3" strokeWidth={2.4} />
                  {skillLabel}
                </p>

                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold",
                    muted
                  )}
                >
                  {tech.status === "available" ? (
                    <OnlineStatusDot status="available" />
                  ) : (
                    <span
                      className={cn(
                        "font-bold",
                        tech.status === "busy" && "text-[#FF6B35]"
                      )}
                    >
                      {statusText}
                    </span>
                  )}
                  {tech.verified ? (
                    <span className="text-sky-500"> · Verified</span>
                  ) : null}
                  {tech.fastResponse ? " · Fast reply" : ""}
                </p>
              </div>
            </div>

            <div
              className={cn(
                "mt-2 grid grid-cols-3 gap-0 py-1.5 text-center",
                isLight ? "rounded-none" : "rounded-xl",
                inset
              )}
              style={isLight ? undefined : { backgroundColor: insetBg }}
            >
              <Stat
                isLight={isLight}
                label={
                  tech.reviewCount > 0
                    ? `${tech.reviewCount} reviews`
                    : "Reviews"
                }
                value={
                  <StarRatingDisplay
                    rating={tech.rating > 0 ? tech.rating : 0}
                    size="sm"
                    className="justify-center"
                  />
                }
              />
              <Stat
                isLight={isLight}
                label="ETA"
                value={formatEta(tech.etaMinutes)}
              />
              <Stat
                isLight={isLight}
                label="Distance"
                value={formatDistance(tech.distanceKm)}
              />
            </div>
          </section>

          <SolidSection title="About" icon={Briefcase} isLight={isLight} card={card} cardBg={cardBg}>
            {experienceLabel ? (
              <Row label="Experience" value={experienceLabel} isLight={isLight} />
            ) : null}
            {tech.bio || tech.description ? (
              <p className={cn("text-[13px] leading-snug", soft)}>
                {tech.bio || tech.description}
              </p>
            ) : (
              <p className={cn("text-[12px]", muted)}>No bio yet.</p>
            )}
          </SolidSection>

          <SolidSection
            title={`${skillLabel} skill profile`}
            icon={Wrench}
            isLight={isLight}
            card={card}
            cardBg={cardBg}
          >
            {skillRows.length > 0 ? (
              skillRows.map((row) => (
                <Row
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  isLight={isLight}
                />
              ))
            ) : (
              <p className={cn("text-[12px]", muted)}>
                Skill details appear when this pro finishes signup questions.
              </p>
            )}
          </SolidSection>

          {tech.specialties.length > 0 ? (
            <SolidSection title="What they can fix" icon={Zap} isLight={isLight} card={card} cardBg={cardBg}>
              <div className="flex flex-wrap gap-1.5">
                {tech.specialties.map((s) => (
                  <span
                    key={s}
                    className={cn(
                      "rounded-lg px-2 py-1 text-[11px] font-semibold",
                      inset,
                      isLight ? "text-slate-800" : "text-neutral-200"
                    )}
                    style={isLight ? undefined : { backgroundColor: insetBg }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </SolidSection>
          ) : null}

          <SolidSection title="Vehicles they serve" icon={Car} isLight={isLight} card={card} cardBg={cardBg}>
            {serviceFocus.length > 0 ? (
              serviceFocus.map(([label, value]) => (
                <Row
                  key={label}
                  label={label}
                  value={String(value)}
                  isLight={isLight}
                />
              ))
            ) : (
              <p className={cn("text-[12px]", muted)}>
                Any vehicle · not specified yet
              </p>
            )}
          </SolidSection>

          <SolidSection title="Service area" icon={MapPin} isLight={isLight} card={card} cardBg={cardBg}>
            <Row
              label="Coverage radius"
              value={`${tech.serviceRadiusKm} km`}
              isLight={isLight}
            />
            {tech.servedLocation && tech.servedLocation !== "Any" ? (
              <Row
                label="Focus region"
                value={tech.servedLocation}
                isLight={isLight}
              />
            ) : null}
            {tech.servedCountry && tech.servedCountry !== "Any" ? (
              <Row
                label="Country"
                value={tech.servedCountry}
                isLight={isLight}
              />
            ) : null}
            <p className={cn("flex items-center gap-1 pt-0.5 text-[11px] font-medium", soft)}>
              <Navigation className="h-3 w-3 text-brand" />
              Near you · {formatDistance(tech.distanceKm)} away
            </p>
          </SolidSection>

          <p
            className={cn(
              "flex items-center justify-center gap-1 pb-1 text-center text-[10px]",
              muted
            )}
          >
            <Clock3 className="h-3 w-3" />
            Typical reply ETA {formatEta(tech.etaMinutes)}
          </p>
        </div>

        {/* Sticky actions — solid, no glass */}
        <div
          className={cn("shrink-0 space-y-1.5 px-3 pb-3 pt-2", page)}
          style={{ backgroundColor: pageBg }}
        >
          {isOwnProfile ? (
            <Button
              size="lg"
              className="h-11 w-full"
              onClick={() => router.push("/profile?edit=1")}
            >
              <Pencil className="h-4 w-4" />
              Edit my profile
            </Button>
          ) : (
            <Button size="lg" className="h-11 w-full" onClick={onRequest}>
              <Zap className="h-4 w-4" />
              Request assistance
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  isLight,
}: {
  value: React.ReactNode;
  label: string;
  isLight: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-[14px] font-bold tabular-nums leading-none",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[10px] font-medium leading-none",
          isLight ? "text-slate-600" : "text-white/50"
        )}
      >
        {label}
      </p>
    </div>
  );
}

function SolidSection({
  title,
  icon: Icon,
  children,
  isLight,
  card,
  cardBg,
}: {
  title: string;
  icon: typeof Wrench;
  children: React.ReactNode;
  isLight: boolean;
  card: string;
  cardBg?: string;
}) {
  return (
    <section
      className={cn(
        isLight ? "rounded-none px-0 py-2.5" : "rounded-2xl p-3",
        card
      )}
      style={
        !isLight && cardBg && cardBg !== "transparent"
          ? { backgroundColor: cardBg }
          : undefined
      }
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Icon
          className="h-3.5 w-3.5 shrink-0 text-brand"
          strokeWidth={2.3}
          aria-hidden
        />
        <p
          className={cn(
            "text-[12px] font-bold tracking-tight",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          {title}
        </p>
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  isLight,
}: {
  label: string;
  value: string;
  isLight: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span
        className={cn(
          "shrink-0 text-[11px] font-medium",
          isLight ? "text-slate-600" : "text-white/50"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 text-right text-[12px] font-semibold",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}
