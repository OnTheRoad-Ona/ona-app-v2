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
import { Button } from "@/components/ui/button";
import { ServiceMap } from "@/components/map/service-map";
import { useApp } from "@/lib/store";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import type { ProService } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

/**
 * Professional dashboard — flat sheet (no white/card panels).
 * Live switch writes is_online so motorists can find this pro.
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
    proLive,
    setProLive,
    userProfile,
  } = useApp();
  const isLight = theme === "light";
  const [serviceRadius, setServiceRadius] = useState(10);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const gestureY = useRef<number | null>(null);
  const me =
    technicians.find((t) => t.id === userProfile?.identityId) ||
    technicians[0];

  const mySkill: ProService | null = isProService(registeredAs)
    ? registeredAs
    : proServices[0] ?? null;

  const openJobs = requests.filter((r) => {
    if (["completed", "cancelled"].includes(r.status)) return false;
    if (mySkill && r.serviceType !== mySkill) return false;
    return true;
  });

  const roleLabel = mySkill
    ? PRO_SERVICE_LABELS[mySkill] ?? mySkill
    : "Professional";

  const sheetBg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";

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
          subtitle={`${roleLabel} · ${me?.name || "Pro"}`}
          showBack={false}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          {/* Flat skill label — no white/soft chip background */}
          {mySkill ? (
            <p className={cn("text-[12px] font-bold", ink)}>
              {PRO_SERVICE_LABELS[mySkill] ?? mySkill}
              <span className={cn("font-semibold", muted)}> only</span>
            </p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <Link
              href="/jobs"
              className={cn(
                "text-[12px] font-bold text-[#e07a3d]",
                isLight ? "" : ""
              )}
            >
              Escrow jobs
            </Link>
          <button
            type="button"
            disabled={liveBusy}
            onClick={() => {
              setLiveBusy(true);
              void setProLive(!proLive).finally(() => setLiveBusy(false));
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-0 bg-transparent px-0 py-1 text-xs font-bold transition-colors",
              proLive
                ? "text-emerald-600"
                : isLight
                  ? "text-slate-500"
                  : "text-white/55"
            )}
            aria-pressed={proLive}
            title={
              proLive
                ? "You are Live — motorists can find you"
                : "You are Away — motorists cannot find you"
            }
          >
            <span className="relative flex h-2 w-2">
              {proLive && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  proLive ? "bg-emerald-500" : "bg-slate-400"
                )}
              />
            </span>
            {liveBusy ? "…" : proLive ? "Live" : "Away"}
          </button>
          </div>
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
          {me ? <ServiceMap technicians={[me]} /> : null}
        </div>

        <div
          className={cn(
            "om-sheet-spring z-10 flex min-h-0 flex-col overflow-hidden",
            panelExpanded ? "flex-1" : "flex-[0_0_50%]",
            sheetBg
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
                isLight ? "bg-[#6b7280]/70" : "bg-white/40"
              )}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pb-3 scrollbar-hide">
            {skillError && (
              <p className="text-[11px] font-medium text-amber-800" role="alert">
                {skillError}
              </p>
            )}

            {/* Flat labels — no card backgrounds */}
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <Link href="/orders" className={cn("text-sm font-bold", ink)}>
                  Order requests
                </Link>
                <p className={cn("text-[11px]", muted)}>
                  Only {roleLabel.toLowerCase()} jobs for your skill
                </p>
              </div>
              <p className={cn("shrink-0 text-[12px] font-bold tabular-nums", ink)}>
                {openJobs.length} open
              </p>
            </div>

            <div>
              <p className={cn("text-xs font-semibold", muted)}>Service radius</p>
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
              <p className={cn("mt-1 text-[10px]", muted)}>
                Motorist search radius on map: {radiusKm} km
              </p>
            </div>

            <div className="flex items-baseline justify-between gap-2 pt-0.5">
              <h2 className={cn("text-sm font-bold", ink)}>Nearby requests</h2>
              <p className={cn("text-[12px] font-bold tabular-nums", muted)}>
                {openJobs.length} open
                {openJobs.some((j) => j.status === "pending")
                  ? " · pending"
                  : ""}
              </p>
            </div>

            {!proLive && (
              <p className={cn("text-[11px] font-medium", muted)}>
                You&apos;re Away. Go Live so motorists can find you and send
                jobs.
              </p>
            )}

            {openJobs.length === 0 ? (
              <p className={cn("py-2 text-center text-xs", muted)}>
                No open {roleLabel.toLowerCase()} jobs right now.
              </p>
            ) : (
              openJobs.map((job) => (
                <article
                  key={job.id}
                  className={cn(
                    "border-t pt-3",
                    isLight ? "border-black/[0.08]" : "border-white/[0.08]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("text-sm font-bold", ink)}>
                        {job.problem}
                      </p>
                      <p className={cn("text-[11px] capitalize", muted)}>
                        {job.serviceType} · {job.locationLabel}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-[10px] font-bold uppercase tracking-wide",
                        muted
                      )}
                    >
                      {job.status.replace("_", " ")}
                    </p>
                  </div>
                  <div className={cn("mt-1.5 flex gap-2 text-[11px]", muted)}>
                    <span className="inline-flex items-center gap-1">
                      <Navigation className="h-3 w-3 text-brand" />
                      {formatEta(job.etaMinutes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {formatDistance(job.distanceKm)}
                    </span>
                  </div>
                  {/* Keep Accept / Decline as real buttons */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {job.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          disabled={!proLive}
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
