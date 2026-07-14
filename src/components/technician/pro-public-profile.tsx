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

/** Same vendor profile sheet in light and dark toggle. */
const PROFILE_BG = "bg-[#c8c9cd]";
const PROFILE_TEXT = "text-slate-900";
const PROFILE_MUTED = "text-slate-600";

/**
 * Motorist-facing Repair Pro profile.
 * No map. Same background in both theme toggles.
 * Photo: vendor photo or OgaMecho logo default.
 */
export function ProPublicProfile({
  tech,
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
    <div className={cn("flex h-full flex-col", PROFILE_BG)}>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <Link
          href={backHref}
          className="flex h-9 w-9 items-center justify-center text-lg leading-none text-slate-800"
          aria-label="Back"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[15px] font-bold", PROFILE_TEXT)}>
            Repair Pro
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 scrollbar-hide">
        <div className="flex items-start gap-3 pt-1">
          <Avatar className="h-16 w-16 shrink-0 ring-1 ring-slate-400/40">
            <AvatarImage src={photoSrc} alt={tech.name} />
            <AvatarFallback className="bg-transparent text-base font-bold text-slate-800">
              {tech.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "flex items-center gap-1.5 text-[18px] font-black leading-tight",
                PROFILE_TEXT
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
              <p className={cn("mt-0.5 truncate text-[13px] font-medium", PROFILE_MUTED)}>
                {tech.businessName}
              </p>
            ) : null}

            <p className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-brand">
              <Wrench className="h-3.5 w-3.5" strokeWidth={2.2} />
              {skillLabel}
            </p>

            <p className={cn("mt-1 text-[12px] font-medium capitalize", PROFILE_MUTED)}>
              {statusText}
              {tech.verified ? " · Verified" : ""}
              {tech.fastResponse ? " · Fast response" : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <p
              className={cn(
                "flex items-center justify-center gap-0.5 text-[16px] font-bold",
                PROFILE_TEXT
              )}
            >
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {tech.rating}
            </p>
            <p className="text-[10px] text-muted">{tech.reviewCount} reviews</p>
          </div>
          <div>
            <p className={cn("text-[16px] font-bold", PROFILE_TEXT)}>
              {formatEta(tech.etaMinutes)}
            </p>
            <p className="text-[10px] text-muted">ETA</p>
          </div>
          <div>
            <p className={cn("text-[16px] font-bold", PROFILE_TEXT)}>
              {formatDistance(tech.distanceKm)}
            </p>
            <p className="text-[10px] text-muted">Distance</p>
          </div>
        </div>

        <Divider />

        <Section title="About" icon={Briefcase}>
          {experienceLabel && (
            <Row label="Experience" value={experienceLabel} />
          )}
          {tech.bio || tech.description ? (
            <p className="pt-1 text-[13px] leading-relaxed text-slate-700">
              {tech.bio || tech.description}
            </p>
          ) : (
            <p className="text-[12px] text-muted">No bio yet.</p>
          )}
        </Section>

        <Divider />

        <Section title={`${skillLabel} skill profile`} icon={Wrench}>
          {skillRows.length > 0 ? (
            skillRows.map((row) => (
              <Row key={row.label} label={row.label} value={row.value} />
            ))
          ) : (
            <p className="text-[12px] text-muted">
              Skill details will appear when this pro completes signup questions.
            </p>
          )}
        </Section>

        {tech.specialties.length > 0 && (
          <>
            <Divider />
            <Section title="What they can fix" icon={Zap}>
              <p className="text-[13px] leading-relaxed text-slate-800">
                {tech.specialties.join(" · ")}
              </p>
            </Section>
          </>
        )}

        <Divider />

        <Section title="Vehicles they serve" icon={Car}>
          {serviceFocus.length > 0 ? (
            serviceFocus.map(([label, value]) => (
              <Row key={label} label={label} value={String(value)} />
            ))
          ) : (
            <p className="text-[12px] text-muted">
              Any vehicle · not specified yet
            </p>
          )}
        </Section>

        <Divider />

        <Section title="Service area" icon={MapPin}>
          <Row label="Coverage radius" value={`${tech.serviceRadiusKm} km`} />
          {tech.servedLocation && tech.servedLocation !== "Any" && (
            <Row label="Focus region" value={tech.servedLocation} />
          )}
          {tech.servedCountry && tech.servedCountry !== "Any" && (
            <Row label="Country" value={tech.servedCountry} />
          )}
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
            <Navigation className="h-3 w-3 text-brand" />
            Near you · {formatDistance(tech.distanceKm)} away
          </p>
        </Section>

        <div className="mt-5 grid grid-cols-2 gap-2">
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
          <Zap className="h-5 w-5" />
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

function Divider() {
  return <div className="my-4 h-px w-full bg-slate-400/35" />;
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Wrench;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className="h-4 w-4 shrink-0 text-brand"
          strokeWidth={2.2}
          aria-hidden
        />
        <p className="text-[13px] font-bold text-slate-900">{title}</p>
      </div>
      <div className="pl-6">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <span className="max-w-[58%] text-right text-[12px] font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}
