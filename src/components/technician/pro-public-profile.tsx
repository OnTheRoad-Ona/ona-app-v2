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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceMap } from "@/components/map/service-map";
import { publicSkillRows } from "@/lib/skill-questions";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

/**
 * Motorist-facing Repair Pro profile.
 * Sections mirror Repair Pro signup: skill, skill details, vehicles served,
 * about, service area — never shows password / NIN / BVN.
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

  const areaLine = [tech.servedLocation, tech.businessName]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      {/* Map header */}
      <div className="relative h-44 shrink-0">
        <ServiceMap technicians={[tech]} onSelect={() => undefined} />
        <Link
          href={backHref}
          className={cn(
            "absolute left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full shadow-md",
            isLight ? "bg-white/95 text-slate-800" : "bg-black/80 text-white"
          )}
          aria-label="Back"
        >
          <span className="text-lg leading-none">←</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-8 scrollbar-hide">
        {/* Identity — signup “About you” */}
        <div className="-mt-8 flex items-end gap-3">
          <Avatar className="h-16 w-16 shadow-md ring-4 ring-[#c8c9cd]">
            <AvatarFallback className="bg-brand text-sm font-bold text-white">
              {tech.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="mb-1 min-w-0 flex-1">
            <p
              className={cn(
                "flex items-center gap-1 text-[18px] font-black tracking-tight",
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
            {tech.businessName && (
              <p
                className={cn(
                  "truncate text-[13px] font-semibold",
                  isLight ? "text-slate-700" : "text-white/85"
                )}
              >
                {tech.businessName}
              </p>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-brand">
              <Wrench className="h-3.5 w-3.5" strokeWidth={2.2} />
              {skillLabel}
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="success" className="capitalize">
            {tech.status === "available" ? "Available now" : tech.status}
          </Badge>
          {tech.verified && <Badge variant="soft">Verified</Badge>}
          {tech.fastResponse && (
            <Badge variant="secondary">Fast response</Badge>
          )}
          <Badge variant="outline">{skillLabel}</Badge>
        </div>

        {/* Quick stats */}
        <div className="card-surface mt-3 grid grid-cols-3 gap-2 rounded-xl p-3 text-center">
          <div>
            <p
              className={cn(
                "flex items-center justify-center gap-0.5 text-[16px] font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {tech.rating}
            </p>
            <p className="text-[10px] text-muted">{tech.reviewCount} reviews</p>
          </div>
          <div>
            <p
              className={cn(
                "text-[16px] font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {formatEta(tech.etaMinutes)}
            </p>
            <p className="text-[10px] text-muted">ETA</p>
          </div>
          <div>
            <p
              className={cn(
                "text-[16px] font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {formatDistance(tech.distanceKm)}
            </p>
            <p className="text-[10px] text-muted">Distance</p>
          </div>
        </div>

        {/* About — signup about you */}
        <Section
          title="About"
          icon={Briefcase}
          isLight={isLight}
        >
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
                isLight ? "text-slate-700" : "text-white/80"
              )}
            >
              {tech.bio || tech.description}
            </p>
          ) : (
            <p className="text-[12px] text-muted">No bio yet.</p>
          )}
        </Section>

        {/* Skill profile — signup skill + questions */}
        <Section
          title={`${skillLabel} · skill profile`}
          icon={Wrench}
          isLight={isLight}
          subtitle="From Repair Pro signup · public details"
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
            <p className="text-[12px] text-muted">
              Skill details will appear when this pro completes signup
              questions.
            </p>
          )}
        </Section>

        {/* Specialties chips */}
        {tech.specialties.length > 0 && (
          <Section title="What they can fix" icon={Zap} isLight={isLight}>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {tech.specialties.map((s) => (
                <Badge key={s} variant="secondary" className="text-[11px]">
                  {s}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {/* Vehicles they serve — signup service focus */}
        <Section
          title="Vehicles they serve"
          icon={Car}
          isLight={isLight}
          subtitle="Service focus from signup"
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
            <p className="text-[12px] text-muted">
              Any vehicle · not specified yet
            </p>
          )}
        </Section>

        {/* Service area — signup area + radius */}
        <Section
          title="Service area"
          icon={MapPin}
          isLight={isLight}
        >
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
          {areaLine && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
              <Navigation className="h-3 w-3 text-brand" />
              Near you · {formatDistance(tech.distanceKm)} away
            </p>
          )}
        </Section>

        {/* Contact actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" asChild className="h-11">
            <a href={`tel:${tech.phone.replace(/\s/g, "")}`}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          </Button>
          <Button variant="secondary" asChild className="h-11">
            <Link href="/messages">
              <MessageCircle className="h-4 w-4" />
              Chat
            </Link>
          </Button>
        </div>

        <Button size="lg" className="mt-2.5 h-12 w-full" onClick={onRequest}>
          <Zap className="h-5 w-5 fill-white" />
          Request assistance
        </Button>

        <p className="mt-3 flex items-center justify-center gap-1 text-center text-[10px] text-muted">
          <Clock3 className="h-3 w-3" />
          Typical reply ETA {formatEta(tech.etaMinutes)}
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
  isLight,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Wrench;
  children: React.ReactNode;
  isLight: boolean;
}) {
  return (
    <section className="card-surface mt-3 rounded-xl p-3">
      <div className="mb-2 flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            isLight ? "bg-brand-soft text-brand" : "bg-brand/20 text-brand"
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "text-[13px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {title}
          </p>
          {subtitle && (
            <p className="text-[10px] text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="divide-y divide-black/5">{children}</div>
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
    <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <span
        className={cn(
          "max-w-[58%] text-right text-[12px] font-semibold",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}
