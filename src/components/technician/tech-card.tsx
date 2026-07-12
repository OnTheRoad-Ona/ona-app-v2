"use client";

import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";
import { useApp } from "@/lib/store";

/** Compact initials avatar — no image download (low data) */
const AVATAR_HUE: Record<string, string> = {
  mechanic: "bg-orange-500",
  vulcanizer: "bg-teal-500",
  towing: "bg-sky-500",
};

export function TechCard({
  tech,
  onRequest,
  compact = true,
  selected,
}: {
  tech: Technician;
  onRequest?: (tech: Technician) => void;
  compact?: boolean;
  selected?: boolean;
}) {
  const { theme } = useApp();
  const isLight = theme === "light";

  return (
    <article
      className={cn(
        "card-surface flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-shadow",
        selected && "ring-2 ring-brand/35",
        !isLight && "text-slate-100"
      )}
    >
      <Link
        href={`/technician/${tech.id}`}
        className="shrink-0"
        aria-label={`View ${tech.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar className="h-10 w-10">
          <AvatarFallback
            className={cn(
              "text-[11px] font-bold text-white",
              AVATAR_HUE[tech.serviceType] ?? "bg-slate-500"
            )}
          >
            {tech.shortName.slice(0, 2).toUpperCase()}
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
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              <span className="truncate">{tech.shortName}</span>
              {tech.verified && (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 fill-sky-500 text-white"
                  aria-label="Verified"
                />
              )}
            </Link>
            <p
              className={cn(
                "truncate text-[10px]",
                isLight ? "text-slate-500" : "text-white/65"
              )}
            >
              {tech.roleLabel}
              <span className="mx-1 opacity-40">·</span>
              <span
                className={cn(
                  tech.status === "available" && "text-emerald-500",
                  tech.status === "busy" && "text-amber-500",
                  tech.status === "nearby" && "text-sky-400",
                  tech.status === "offline" && "text-slate-400"
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

          {onRequest && tech.status !== "offline" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequest(tech);
              }}
              className="shrink-0 rounded-md metallic-orange px-2 py-1 text-[11px] font-bold"
            >
              Request
            </button>
          )}
        </div>

        <div
          className={cn(
            "mt-0.5 flex items-center gap-x-1.5 text-[10px]",
            isLight ? "text-slate-600" : "text-white/75"
          )}
        >
          <span className="inline-flex items-center gap-0.5 font-semibold">
            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            {tech.rating.toFixed(1)}
          </span>
          <span className="opacity-40">·</span>
          <span>{formatEta(tech.etaMinutes)}</span>
          <span className="opacity-40">·</span>
          <span>{formatDistance(tech.distanceMiles)}</span>
          {!compact && tech.specialties[0] && (
            <>
              <span className="opacity-40">·</span>
              <span className="truncate">{tech.specialties[0]}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
