"use client";

import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";
import { useApp } from "@/lib/store";

/**
 * Soft blended gray cards for the professional list.
 * Light: cool slate wash · Dark: charcoal gray (not pure black).
 */
export function TechCard({
  tech,
  onRequest,
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
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
        isLight
          ? selected
            ? "bg-gradient-to-r from-slate-100 via-slate-50 to-orange-50/40"
            : "bg-gradient-to-r from-slate-100/95 via-slate-50 to-slate-100/80"
          : selected
            ? "bg-gradient-to-r from-[#1c1c1c] via-[#222] to-[#1a1612]"
            : "bg-gradient-to-r from-[#141414] via-[#1a1a1a] to-[#161616]",
        selected && (isLight ? "ring-1 ring-[#e85a12]/25" : "ring-1 ring-[#e85a12]/30")
      )}
    >
      <Link
        href={`/technician/${tech.id}`}
        className="shrink-0"
        aria-label={`View ${tech.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Avatar className="h-10 w-10">
          {tech.photo ? (
            <AvatarImage src={tech.photo} alt="" />
          ) : null}
          <AvatarFallback className="bg-brand text-[11px] font-bold text-white">
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
                isLight ? "text-slate-900" : "text-[#f0f0f0]"
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
                isLight ? "text-slate-500" : "text-[#a8a8a8]"
              )}
            >
              {tech.roleLabel}
              <span className="mx-1 opacity-40">·</span>
              <span
                className={cn(
                  tech.status === "available" && "text-emerald-500",
                  tech.status === "busy" && "text-amber-500",
                  tech.status === "nearby" && "text-sky-400",
                  tech.status === "offline" &&
                    (isLight ? "text-slate-400" : "text-[#777]")
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
              className={cn(
                "shrink-0 border-0 bg-transparent px-1 py-1 text-[12px] font-bold",
                isLight
                  ? "text-brand hover:text-brand-deep"
                  : "text-[#ffb07a] hover:text-white"
              )}
            >
              Request
            </button>
          )}
        </div>

        <div
          className={cn(
            "mt-0.5 flex items-center gap-x-1.5 text-[10px]",
            isLight ? "text-slate-600" : "text-[#b5b5b5]"
          )}
        >
          <span className="inline-flex items-center gap-0.5 font-semibold">
            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            {tech.rating.toFixed(1)}
          </span>
          <span className="opacity-40">·</span>
          <span>{formatEta(tech.etaMinutes)}</span>
          <span className="opacity-40">·</span>
          <span>{formatDistance(tech.distanceKm)}</span>
        </div>
      </div>
    </article>
  );
}
