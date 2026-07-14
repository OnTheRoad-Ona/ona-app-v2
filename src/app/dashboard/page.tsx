"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  MapPin,
  MessageCircle,
  Navigation,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceMap } from "@/components/map/service-map";
import { useApp } from "@/lib/store";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import type { ProService } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

/**
 * Professional dashboard — map + swipe-up job sheet (like motorist home).
 * Jobs filtered to this pro's skill only.
 */
export default function TechnicianDashboardPage() {
  const {
    requests,
    updateRequestStatus,
    technicians,
    radiusKm,
    theme,
    registeredAs,
    proServices,
    ensureChatForRequest,
  } = useApp();
  const isLight = theme === "light";
  const [live, setLive] = useState(true);
  const [serviceRadius, setServiceRadius] = useState(10);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const gestureY = useRef<number | null>(null);
  const me = technicians[0];

  const mySkill: ProService | null = isProService(registeredAs)
    ? registeredAs
    : proServices[0] ?? null;

  // Skill isolation: only jobs for this trade
  const openJobs = requests.filter((r) => {
    if (["completed", "cancelled"].includes(r.status)) return false;
    if (mySkill && r.serviceType !== mySkill) return false;
    return true;
  });

  const roleLabel = mySkill
    ? PRO_SERVICE_LABELS[mySkill] ?? mySkill
    : "Professional";

  const sheetBg = isLight ? "bg-[#c8c9cd]" : "bg-black";

  const onTouchStart = (e: React.TouchEvent) => {
    gestureY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (gestureY.current == null) return;
    const dy = e.touches[0].clientY - gestureY.current;
    if (!panelExpanded && dy < -14) {
      setPanelExpanded(true);
      gestureY.current = null;
    }
    if (panelExpanded && dy > 14) {
      setPanelExpanded(false);
      gestureY.current = null;
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0 && !panelExpanded) {
      e.preventDefault();
      setPanelExpanded(true);
    }
    if (e.deltaY < 0 && panelExpanded) {
      e.preventDefault();
      setPanelExpanded(false);
    }
  };

  const accept = (id: string) => {
    const result = updateRequestStatus(id, "accepted");
    if (!result.ok) {
      setSkillError(result.message);
      return;
    }
    setSkillError(null);
    const job = requests.find((r) => r.id === id);
    if (job) ensureChatForRequest(job);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", sheetBg)}>
      <div className={cn("z-20 shrink-0", sheetBg)}>
        <PageHeader
          title="Professional Dashboard"
          subtitle={`${roleLabel} · ${me.name}`}
          showBack={false}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          {mySkill ? (
            <Badge variant="soft" className="text-[10px]">
              {PRO_SERVICE_LABELS[mySkill] ?? mySkill} only
            </Badge>
          ) : (
            <span />
          )}
          {/* Modern Live control (replaces Online) */}
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border-0 px-3 py-1.5 text-xs font-bold transition-colors",
              live
                ? "bg-emerald-500/15 text-emerald-600"
                : isLight
                  ? "bg-slate-200/80 text-slate-500"
                  : "bg-white/10 text-white/55"
            )}
            aria-pressed={live}
          >
            <span className="relative flex h-2 w-2">
              {live && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  live ? "bg-emerald-500" : "bg-slate-400"
                )}
              />
            </span>
            {live ? "Live" : "Away"}
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "om-sheet-spring relative min-h-0 overflow-hidden",
            panelExpanded
              ? "h-0 flex-[0_0_0%] opacity-0 pointer-events-none"
              : "flex-[0_0_50%] opacity-100"
          )}
        >
          <ServiceMap technicians={[me]} />
        </div>

        <div
          className={cn(
            "om-sheet-spring z-10 flex min-h-0 flex-col overflow-hidden",
            panelExpanded ? "flex-1" : "flex-[0_0_50%]",
            sheetBg,
            !panelExpanded &&
              "rounded-t-2xl shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
          )}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onWheel={onWheel}
          style={{ touchAction: "pan-y" }}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label={panelExpanded ? "Collapse panel" : "Expand panel"}
            onClick={() => setPanelExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPanelExpanded((v) => !v);
              }
            }}
            className="flex cursor-grab justify-center pb-1.5 pt-2.5 active:cursor-grabbing"
          >
            <span
              className={cn(
                "h-1.5 w-11 rounded-full",
                isLight
                  ? "bg-[#6b7280] shadow-sm ring-1 ring-black/10"
                  : "bg-white/40"
              )}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pb-3 scrollbar-hide">
            {skillError && (
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-[11px] font-medium",
                  isLight
                    ? "bg-amber-50 text-amber-900"
                    : "bg-amber-500/15 text-amber-100"
                )}
                role="alert"
              >
                {skillError}
              </div>
            )}

            <Link
              href="/orders"
              className={cn(
                "flex items-center justify-between rounded-lg p-3",
                isLight ? "bg-[#d4d5d9]" : "bg-neutral-950"
              )}
            >
              <div>
                <p
                  className={cn(
                    "text-sm font-bold",
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  Order requests
                </p>
                <p className="text-[11px] text-muted">
                  Only {roleLabel.toLowerCase()} jobs for your skill
                </p>
              </div>
              <Badge variant="soft" className="text-[10px]">
                {openJobs.length} open
              </Badge>
            </Link>

            <div
              className={cn(
                "rounded-lg p-3",
                isLight ? "bg-[#d4d5d9]" : "bg-neutral-950"
              )}
            >
              <p className="text-xs font-semibold text-muted">Service radius</p>
              <p className="text-xl font-bold text-brand">{serviceRadius} km</p>
              <input
                type="range"
                min={1}
                max={10}
                value={serviceRadius}
                onChange={(e) => setServiceRadius(Number(e.target.value))}
                className="radius-slider mt-2 w-full"
                style={{
                  ["--pct" as string]: `${(serviceRadius / 10) * 100}%`,
                }}
                aria-label="Your service radius"
              />
              <p className="mt-1 text-[10px] text-muted">
                Motorist search radius on map: {radiusKm} km · map view ~1 km
              </p>
            </div>

            <div className="flex items-center justify-between">
              <h2
                className={cn(
                  "text-sm font-bold",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                Nearby requests
              </h2>
              <Badge variant="soft" className="text-[10px]">
                {openJobs.length} open
              </Badge>
            </div>

            {!live && (
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-[11px]",
                  isLight
                    ? "bg-amber-50 text-amber-800"
                    : "bg-amber-500/15 text-amber-100"
                )}
              >
                You&apos;re Away. Go Live to receive jobs.
              </div>
            )}

            {openJobs.length === 0 ? (
              <p className="rounded-lg p-4 text-center text-xs text-muted">
                No open {roleLabel.toLowerCase()} jobs right now.
              </p>
            ) : (
              openJobs.map((job) => (
                <article
                  key={job.id}
                  className={cn(
                    "rounded-lg p-3",
                    isLight ? "bg-[#d4d5d9]" : "bg-neutral-950"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={cn(
                          "text-sm font-bold",
                          isLight ? "text-slate-900" : "text-white"
                        )}
                      >
                        {job.problem}
                      </p>
                      <p className="text-[11px] capitalize text-muted">
                        {job.serviceType} · {job.locationLabel}
                      </p>
                    </div>
                    <Badge variant="soft" className="capitalize text-[10px]">
                      {job.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex gap-2 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Navigation className="h-3 w-3 text-brand" />
                      {formatEta(job.etaMinutes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {formatDistance(job.distanceKm)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          disabled={!live}
                          onClick={() => accept(job.id)}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            updateRequestStatus(job.id, "cancelled")
                          }
                        >
                          Decline
                        </Button>
                      </>
                    )}
                    {job.status === "accepted" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateRequestStatus(job.id, "en_route")
                          }
                        >
                          Start route
                        </Button>
                        <Button size="sm" variant="secondary" asChild>
                          <Link href={`/messages`}>
                            <MessageCircle className="h-3.5 w-3.5" />
                            Chat
                          </Link>
                        </Button>
                      </>
                    )}
                    {job.status === "en_route" && (
                      <Button
                        size="sm"
                        onClick={() => updateRequestStatus(job.id, "arrived")}
                      >
                        Arrived
                      </Button>
                    )}
                    {["arrived", "in_progress"].includes(job.status) && (
                      <Button
                        size="sm"
                        onClick={() =>
                          updateRequestStatus(job.id, "completed")
                        }
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Complete
                      </Button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
