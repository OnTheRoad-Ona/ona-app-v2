"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Car,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceMap } from "@/components/map/service-map";
import { publicSkillRows } from "@/lib/skill-questions";
import { useApp } from "@/lib/store";
import { formatDistance, formatEta } from "@/lib/utils";

export default function TechnicianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { technicians, createRequest, setSelectedTechId } = useApp();
  const tech = technicians.find((t) => t.id === id);

  if (!tech) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white p-6">
        <p className="font-semibold text-slate-900">Technician not found</p>
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    );
  }

  const request = () => {
    setSelectedTechId(tech.id);
    createRequest(tech);
    router.push(`/request?tech=${tech.id}`);
  };

  const serviceFocus = [
    { label: "Vehicle type", value: tech.servedVehicleType },
    { label: "Brand", value: tech.servedBrand || tech.servedMake },
    { label: "Model", value: tech.servedModel },
    { label: "Country", value: tech.servedCountry },
    { label: "State / Region", value: tech.servedLocation },
  ].filter((r) => r.value && r.value.trim().length > 0);

  const skillRows = publicSkillRows(tech.serviceType, tech.skillAnswers);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="relative h-48 shrink-0">
        <ServiceMap technicians={[tech]} onSelect={() => undefined} />
        <Link
          href="/"
          className="absolute left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-md"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 scrollbar-hide">
        <div className="-mt-8 flex items-end gap-3">
          <Avatar className="h-16 w-16 shadow-md ring-4 ring-white">
            <AvatarFallback className="bg-brand text-sm font-bold text-white">
              {tech.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="mb-1 flex-1">
            <p className="flex items-center gap-1 text-xl font-bold text-slate-900">
              {tech.name}
              {tech.verified && (
                <BadgeCheck
                  className="h-5 w-5 fill-none text-sky-500"
                  strokeWidth={2.25}
                />
              )}
            </p>
            <p className="text-sm text-slate-500">{tech.roleLabel}</p>
            {tech.businessName && (
              <p className="text-[12px] font-medium text-slate-600">
                {tech.businessName}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="success" className="capitalize">
            {tech.status === "available" ? "Available Now" : tech.status}
          </Badge>
          {tech.verified && <Badge variant="soft">Verified</Badge>}
          {tech.fastResponse && (
            <Badge variant="secondary">Fast Response</Badge>
          )}
        </div>

        <div className="card-surface mt-4 grid grid-cols-3 gap-2 rounded-2xl p-3 text-center">
          <div>
            <p className="flex items-center justify-center gap-0.5 text-lg font-bold text-slate-900">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {tech.rating}
            </p>
            <p className="text-[10px] text-slate-500">
              {tech.reviewCount} reviews
            </p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">
              {formatEta(tech.etaMinutes)}
            </p>
            <p className="text-[10px] text-slate-500">ETA</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">
              {formatDistance(tech.distanceKm)}
            </p>
            <p className="text-[10px] text-slate-500">Distance</p>
          </div>
        </div>

        {/* Skill-specific signup answers (public) */}
        {skillRows.length > 0 && (
          <div className="card-surface mt-4 rounded-2xl p-3.5">
            <p className="mb-2.5 text-[13px] font-bold text-slate-900">
              {tech.roleLabel} · skill profile
            </p>
            <div className="divide-y divide-slate-100">
              {skillRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-[12px] font-medium text-slate-500">
                    {row.label}
                  </span>
                  <span className="max-w-[58%] text-right text-[13px] font-semibold text-slate-900">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Service focus — vehicle type / make / model / location */}
        {serviceFocus.length > 0 && (
          <div className="card-surface mt-4 rounded-2xl p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Car className="h-4 w-4 text-brand" strokeWidth={2.2} />
              <p className="text-[13px] font-bold text-slate-900">
                Vehicles they serve
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {serviceFocus.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-[12px] font-medium text-slate-500">
                    {row.label}
                  </span>
                  <span className="max-w-[60%] text-right text-[13px] font-semibold text-slate-900">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            {tech.servedLocation && tech.servedLocation !== "Any" && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                <MapPin className="h-3 w-3 text-brand" />
                Service focus area: {tech.servedLocation}
              </p>
            )}
          </div>
        )}

        {tech.yearsExperience && (
          <p className="mt-3 text-[12px] font-medium text-slate-600">
            Experience:{" "}
            <span className="font-semibold text-slate-900">
              {tech.yearsExperience === "10+"
                ? "10+ yrs"
                : tech.yearsExperience === "1"
                  ? "1 yr"
                  : `${tech.yearsExperience} yrs`}
            </span>
          </p>
        )}

        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {tech.description}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {tech.specialties.map((s) => (
            <Badge key={s} variant="secondary">
              {s}
            </Badge>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button variant="outline" asChild>
            <a href={`tel:${tech.phone.replace(/\s/g, "")}`}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/messages">
              <MessageCircle className="h-4 w-4" />
              Chat
            </Link>
          </Button>
        </div>

        <Button size="lg" className="mt-3 w-full" onClick={request}>
          <Zap className="h-5 w-5 fill-white" />
          Request Assistance
        </Button>
      </div>
    </div>
  );
}
