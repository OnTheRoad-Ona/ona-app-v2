"use client";

import { useState } from "react";
import { CheckCircle2, MapPin, Navigation, Power } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceMap } from "@/components/map/service-map";
import { useApp } from "@/lib/store";
import { cn, formatDistance, formatEta } from "@/lib/utils";

export default function TechnicianDashboardPage() {
  const { requests, updateRequestStatus, technicians, radiusMiles, theme } =
    useApp();
  const isLight = theme === "light";
  const [online, setOnline] = useState(true);
  const [serviceRadius, setServiceRadius] = useState(40);
  const me = technicians[0];

  const openJobs = requests.filter(
    (r) => !["completed", "cancelled"].includes(r.status)
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-white" : "matte-metal"
      )}
    >
      <PageHeader
        title="Tech Dashboard"
        subtitle={me.name}
        backHref="/profile"
      />

      <div className="flex items-center justify-end px-3 pb-2">
        <button
          type="button"
          onClick={() => setOnline((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border-0",
            online
              ? "bg-emerald-50 text-emerald-700"
              : isLight
                ? "bg-slate-100 text-slate-500"
                : "matte-metal-inset text-white/80"
          )}
        >
          <Power className="h-3.5 w-3.5" />
          {online ? "Online" : "Offline"}
        </button>
      </div>

      <div className="relative h-28 shrink-0">
        <ServiceMap technicians={[me]} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-hide">
        <div className="card-surface rounded-lg p-3">
          <p className="text-xs font-semibold text-muted">Service radius</p>
          <p className="text-xl font-bold text-brand">{serviceRadius} mi</p>
          <input
            type="range"
            min={5}
            max={100}
            value={serviceRadius}
            onChange={(e) => setServiceRadius(Number(e.target.value))}
            className="radius-slider mt-2 w-full"
            style={{ ["--pct" as string]: `${serviceRadius}%` }}
            aria-label="Your service radius"
          />
          <p className="mt-1 text-[10px] text-muted">
            User map radius {radiusMiles} mi
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

        {!online && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            You&apos;re offline. Go online to receive jobs.
          </div>
        )}

        {openJobs.length === 0 ? (
          <p className="rounded-lg p-4 text-center text-xs text-muted">
            No open jobs right now.
          </p>
        ) : (
          openJobs.map((job) => (
            <article key={job.id} className="card-surface rounded-lg p-3">
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
                  {formatDistance(job.distanceMiles)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {job.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      disabled={!online}
                      onClick={() => updateRequestStatus(job.id, "accepted")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateRequestStatus(job.id, "cancelled")}
                    >
                      Decline
                    </Button>
                  </>
                )}
                {job.status === "accepted" && (
                  <Button
                    size="sm"
                    onClick={() => updateRequestStatus(job.id, "en_route")}
                  >
                    Start route
                  </Button>
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
                    onClick={() => updateRequestStatus(job.id, "completed")}
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
  );
}
