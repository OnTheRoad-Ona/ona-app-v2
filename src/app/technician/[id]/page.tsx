"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  MessageCircle,
  Phone,
  Star,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceMap } from "@/components/map/service-map";
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
