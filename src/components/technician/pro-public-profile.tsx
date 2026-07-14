"use client";

import Link from "next/link";
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
import { DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { publicSkillRows } from "@/lib/skill-questions";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

/**
 * Motorist-facing Repair Pro profile.
 * Background follows the app light/dark toggle (not a fixed sheet).
 * No map. Photo defaults to OgaMecho logo until the vendor sets one.
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
  const skillLabel =
    PRO_SERVICE_LABELS[tech.serviceType] ?? tech.roleLabel ?? "Repair Pro";
  const skillRows = publicSkillRows(tech.serviceType, tech.skillAnswers);
  const photoSrc =
    tech.photo && tech.photo.trim().length > 0
      ? tech.photo
      : DEFAULT_VENDOR_PHOTO;

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
    tech.status === "available" ? "Available now" : tech.status;

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-[#120a08]"
      )}
    >
      {/* Top bar — matches theme chrome */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 px-3 pb-2 pt-3",
          isLight ? "bg-[#c8c9cd]" : "bg-[#120a08]"
        )}
      >
        <Link
          href={backHref}
          className={cn(
            "flex h-9 w-9 items-center justify-center text-lg leading-none",
            isLight ? "text-slate-800" : "text-[#f0d4c4]"
          )}
          aria-label="Back"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[15px] font-bold tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Repair Pro
          </p>
          <p
            className={cn(
              "truncate text-[11px] font-medium",
              isLight ? "text-slate-600" : "text-[#c4b0a4]"
            )}
          >
            {skillLabel}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-hide">
          {/* Identity hero card */}
          <section
            className={cn(
              "rounded-2xl p-4",
              isLight
                ? "bg-[#d4d5d9] shadow-sm"
                : "bg-[#1c110d] ring-1 ring-[#3a221a]"
            )}
          >
            <div className="flex items-start gap-3.5">
              <Avatar className="h-[4.75rem] w-[4.75rem] shrink-0 shadow-md ring-2 ring-white/90">
                <AvatarImage src={photoSrc} alt={tech.name} />
                <AvatarFallback className="bg-brand text-base font-bold text-white">
                  {tech.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-[18px] font-black leading-tight tracking-tight",
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  <span className="truncate">{tech.name}</span>
                  {tech.verified && (
                    <BadgeCheck
                      className="h-5 w-5 shrink-0 text-sky-500"
                      strokeWidth={2.25}
                    />
                  )}
                </p>

                {tech.businessName ? (
                  <p
                    className={cn(
                      "mt-0.5 truncate text-[13px] font-semibold",
                      isLight ? "text-slate-700" : "text-white/85"
                    )}
                  >
                    {tech.businessName}
                  </p>
                ) : null}

                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-bold text-brand">
                  <Wrench className="h-3.5 w-3.5" strokeWidth={2.3} />
                  {skillLabel}
                </p>

                <p
                  className={cn(
                    "mt-1 text-[11px] font-medium capitalize leading-snug",
                    isLight ? "text-slate-600" : "text-[#c4b0a4]"
                  )}
                >
                  {statusText}
                  {tech.verified ? " · Verified" : ""}
                  {tech.fastResponse ? " · Fast response" : ""}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div
              className={cn(
                "mt-4 grid grid-cols-3 gap-1 rounded-xl py-3 text-center",
                isLight ? "bg-white/55" : "bg-black/25"
              )}
            >
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

          <SectionCard title="About" icon={Briefcase} isLight={isLight}>
            {experienceLabel && (
              <Row
                label="Experience"
                value={experienceLabel}
                isLight={isLight}
              />
            )}
            {tech.bio || tech.description ? (
              <p
                className={cn(
                  "pt-1 text-[13px] leading-relaxed",
                  isLight ? "text-slate-700" : "text-white/82"
                )}
              >
                {tech.bio || tech.description}
              </p>
            ) : (
              <p
                className={cn(
                  "text-[12px]",
                  isLight ? "text-slate-500" : "text-[#9a8478]"
                )}
              >
                No bio yet.
              </p>
            )}
          </SectionCard>

          <SectionCard
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
              <p
                className={cn(
                  "text-[12px]",
                  isLight ? "text-slate-500" : "text-[#9a8478]"
                )}
              >
                Skill details will appear when this pro completes signup
                questions.
              </p>
            )}
          </SectionCard>

          {tech.specialties.length > 0 && (
            <SectionCard
              title="What they can fix"
              icon={Zap}
              isLight={isLight}
            >
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {tech.specialties.map((s) => (
                  <span
                    key={s}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      isLight
                        ? "bg-white/80 text-slate-800"
                        : "bg-black/30 text-[#f0d4c4]"
                    )}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Vehicles they serve"
            icon={Car}
            isLight={isLight}
          >
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
              <p
                className={cn(
                  "text-[12px]",
                  isLight ? "text-slate-500" : "text-[#9a8478]"
                )}
              >
                Any vehicle · not specified yet
              </p>
            )}
          </SectionCard>

          <SectionCard title="Service area" icon={MapPin} isLight={isLight}>
            <Row
              label="Coverage radius"
              value={`${tech.serviceRadiusKm} km`}
              isLight={isLight}
            />
            {tech.servedLocation && tech.servedLocation !== "Any" && (
              <Row
                label="Focus region"
                value={tech.servedLocation}
                isLight={isLight}
              />
            )}
            {tech.servedCountry && tech.servedCountry !== "Any" && (
              <Row
                label="Country"
                value={tech.servedCountry}
                isLight={isLight}
              />
            )}
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1 text-[11px] font-medium",
                isLight ? "text-slate-600" : "text-[#c4b0a4]"
              )}
            >
              <Navigation className="h-3 w-3 text-brand" />
              Near you · {formatDistance(tech.distanceKm)} away
            </p>
          </SectionCard>

          <p
            className={cn(
              "mt-3 flex items-center justify-center gap-1 text-center text-[10px]",
              isLight ? "text-slate-500" : "text-[#9a8478]"
            )}
          >
            <Clock3 className="h-3 w-3" />
            Typical reply ETA {formatEta(tech.etaMinutes)}
          </p>
        </div>

        {/* Sticky action bar */}
        <div
          className={cn(
            "shrink-0 space-y-2 border-t px-3 pb-3 pt-2.5",
            isLight
              ? "border-slate-400/25 bg-[#c8c9cd]"
              : "border-[#3a221a] bg-[#120a08]"
          )}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              asChild
              className={cn(
                "h-11",
                !isLight &&
                  "border-[#3a221a] bg-[#1c110d] text-white hover:bg-[#241610]"
              )}
            >
              <a href={`tel:${tech.phone.replace(/\s/g, "")}`}>
                <Phone className="h-4 w-4" />
                Call
              </a>
            </Button>
            <Button
              variant="secondary"
              asChild
              className={cn(
                "h-11",
                !isLight && "bg-[#2a1812] text-white hover:bg-[#321e16]"
              )}
            >
              <Link href="/messages">
                <MessageCircle className="h-4 w-4" />
                Chat
              </Link>
            </Button>
          </div>
          <Button size="lg" className="h-12 w-full" onClick={onRequest}>
            <Zap className="h-5 w-5" />
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
          "text-[15px] font-bold tabular-nums",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          "text-[10px] font-medium",
          isLight ? "text-slate-500" : "text-[#9a8478]"
        )}
      >
        {label}
      </p>
    </div>
  );
}

function SectionCard({
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
    <section
      className={cn(
        "mt-3 rounded-2xl p-3.5",
        isLight
          ? "bg-[#d4d5d9] shadow-sm"
          : "bg-[#1c110d] ring-1 ring-[#3a221a]"
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <Icon
          className="h-4 w-4 shrink-0 text-brand"
          strokeWidth={2.2}
          aria-hidden
        />
        <p
          className={cn(
            "text-[13px] font-bold tracking-tight",
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
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span
        className={cn(
          "text-[12px] font-medium",
          isLight ? "text-slate-500" : "text-[#9a8478]"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "max-w-[58%] text-right text-[12px] font-semibold leading-snug",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}
