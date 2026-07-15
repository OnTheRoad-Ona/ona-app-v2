"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  Car,
  Clock3,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
  Wrench,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { navigateBack } from "@/lib/navigation";
import { publicSkillRows } from "@/lib/skill-questions";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

/**
 * Motorist-facing Repair Pro profile — tight, flat, premium.
 * No card washes on body sections; avatar fills the circle with no ring border.
 */
export function ProPublicProfile({
  tech,
  isLight = true,
  onRequest,
  backHref = "/",
}: {
  tech: Technician;
  isLight?: boolean;
  onRequest: () => void;
  backHref?: string;
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
      ? "Available now"
      : tech.status === "nearby"
        ? "Nearby"
        : tech.status === "busy"
          ? "Busy"
          : tech.status === "offline"
            ? "Offline"
            : tech.status;

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-neutral-400";
  const soft = isLight ? "text-slate-600" : "text-neutral-400";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      {/* Compact top bar — history back when available */}
      <div className="flex shrink-0 items-center gap-1.5 px-2.5 pb-1 pt-2.5">
        <button
          type="button"
          onClick={() => navigateBack(router, backHref)}
          className={cn(
            "flex h-8 w-8 items-center justify-center border-0 bg-transparent text-base leading-none",
            ink
          )}
          aria-label="Back"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[14px] font-bold leading-none", ink)}>
            {tech.name}
          </p>
          <p className={cn("mt-0.5 truncate text-[11px] font-medium", muted)}>
            {skillLabel}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 pb-2 scrollbar-hide">
          {/* Identity — no outer card, tight hero */}
          <section className="pt-1">
            <div className="flex items-center gap-3">
              {/* Gear ring fills the circular frame edge-to-edge (no orange lap) */}
              <Avatar className="h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-full border-0 bg-transparent shadow-none ring-0">
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
                  <p
                    className={cn(
                      "mt-0.5 truncate text-[12px] font-semibold",
                      soft
                    )}
                  >
                    {tech.businessName}
                  </p>
                ) : null}

                <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-brand">
                  <Wrench className="h-3 w-3" strokeWidth={2.4} />
                  {skillLabel}
                </p>

                <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                  {statusText}
                  {tech.verified ? " · Verified" : ""}
                  {tech.fastResponse ? " · Fast reply" : ""}
                </p>
              </div>
            </div>

            {/* Inline stats — single separator only (no double lines with sections) */}
            <div className="mt-3 grid grid-cols-3 gap-0 py-2.5 text-center">
              <Stat
                isLight={isLight}
                label={`${tech.reviewCount} reviews`}
                value={
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {tech.rating}
                  </span>
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

          {/* Flat body sections — no background blocks */}
          <FlatSection title="About" icon={Briefcase} isLight={isLight}>
            {experienceLabel ? (
              <Row label="Experience" value={experienceLabel} isLight={isLight} />
            ) : null}
            {tech.bio || tech.description ? (
              <p
                className={cn(
                  "text-[13px] leading-snug",
                  isLight ? "text-slate-700" : "text-white/85"
                )}
              >
                {tech.bio || tech.description}
              </p>
            ) : (
              <p className={cn("text-[12px]", muted)}>No bio yet.</p>
            )}
          </FlatSection>

          <FlatSection
            title={`${skillLabel} skill profile`}
            icon={Wrench}
            isLight={isLight}
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
          </FlatSection>

          {tech.specialties.length > 0 ? (
            <FlatSection title="What they can fix" icon={Zap} isLight={isLight}>
              <div className="flex flex-wrap gap-1.5">
                {tech.specialties.map((s) => (
                  <span
                    key={s}
                    className={cn(
                      "text-[11px] font-semibold",
                      isLight ? "text-slate-800" : "text-neutral-200"
                    )}
                  >
                    · {s}
                  </span>
                ))}
              </div>
            </FlatSection>
          ) : null}

          <FlatSection title="Vehicles they serve" icon={Car} isLight={isLight}>
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
          </FlatSection>

          <FlatSection title="Service area" icon={MapPin} isLight={isLight}>
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
            <p
              className={cn(
                "flex items-center gap-1 pt-0.5 text-[11px] font-medium",
                soft
              )}
            >
              <Navigation className="h-3 w-3 text-brand" />
              Near you · {formatDistance(tech.distanceKm)} away
            </p>
          </FlatSection>

          <p
            className={cn(
              "mt-2 flex items-center justify-center gap-1 pb-1 text-center text-[10px]",
              muted
            )}
          >
            <Clock3 className="h-3 w-3" />
            Typical reply ETA {formatEta(tech.etaMinutes)}
          </p>
        </div>

        {/* Sticky actions — minimal top edge, no heavy borders */}
        <div
          className={cn(
            "shrink-0 space-y-1.5 px-3 pb-3 pt-2",
            isLight ? "bg-[#c8c9cd]" : "bg-black"
          )}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              asChild
              className={cn(
                "h-10 border-0 shadow-none",
                isLight
                  ? "bg-black/[0.06] text-slate-900 hover:bg-black/[0.1]"
                  : "bg-white/10 text-white hover:bg-white/15"
              )}
            >
              <a href={`tel:${(tech.phone || "").replace(/\s/g, "")}`}>
                <Phone className="h-4 w-4" />
                Call
              </a>
            </Button>
            <Button
              variant="secondary"
              asChild
              className={cn(
                "h-10 border-0 shadow-none",
                isLight
                  ? "bg-black/[0.06] text-slate-900 hover:bg-black/[0.1]"
                  : "bg-white/10 text-white hover:bg-white/15"
              )}
            >
              <Link href="/messages">
                <MessageCircle className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          </div>
          <Button size="lg" className="h-11 w-full" onClick={onRequest}>
            <Zap className="h-4 w-4" />
            Request assistance
          </Button>
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
          isLight ? "text-slate-500" : "text-neutral-500"
        )}
      >
        {label}
      </p>
    </div>
  );
}

/** Flat section: title + content, no background card, tight spacing */
function FlatSection({
  title,
  icon: Icon,
  children,
  isLight,
}: {
  title: string;
  icon: typeof Wrench;
  children: React.ReactNode;
  isLight: boolean;
}) {
  return (
    <section className="mt-3 pt-0">
      {/* Single hairline only — avoid stacking with stats border-y */}
      <div
        className={cn(
          "mb-2 border-t pt-2.5",
          isLight ? "border-black/[0.08]" : "border-white/[0.08]"
        )}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
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
        <div className="space-y-0">{children}</div>
      </div>
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
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={cn(
          "text-[11px] font-medium",
          isLight ? "text-slate-500" : "text-neutral-500"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "max-w-[62%] text-right text-[12px] font-semibold leading-snug",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}
