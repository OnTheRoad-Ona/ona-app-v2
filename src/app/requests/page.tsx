"use client";

import Link from "next/link";
import { MapPin, Navigation } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { cn, formatDistance, formatEta } from "@/lib/utils";

const statusVariant: Record<
  string,
  "warn" | "soft" | "success" | "secondary" | "danger"
> = {
  pending: "warn",
  accepted: "soft",
  en_route: "soft",
  arrived: "success",
  in_progress: "soft",
  completed: "secondary",
  cancelled: "danger",
};

export default function RequestsPage() {
  const { requests, updateRequestStatus, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-white" : "matte-metal"
      )}
    >
      <PageHeader title="Requests" subtitle="Live help & dispatch" />

      <div className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-hide">
        {requests.length === 0 ? (
          <div
            className={cn(
              "rounded-lg p-6 text-center",
              isLight ? "bg-slate-50" : "matte-metal-inset"
            )}
          >
            <p className="font-semibold text-sm">No active requests</p>
            <p className="mt-1 text-xs text-muted">
              Request help from Home to connect.
            </p>
            <Button asChild className="mt-3 h-10" size="default">
              <Link href="/">Find help nearby</Link>
            </Button>
          </div>
        ) : (
          requests.map((r) => (
            <article key={r.id} className="card-surface rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={cn(
                      "text-sm font-bold",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    {r.technicianName}
                  </p>
                  <p className="text-xs capitalize text-muted">
                    {r.serviceType} · {r.problem}
                  </p>
                </div>
                <Badge
                  variant={statusVariant[r.status] ?? "warn"}
                  className="capitalize text-[10px]"
                >
                  {r.status.replace("_", " ")}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Navigation className="h-3 w-3 text-brand" />
                  ETA {formatEta(r.etaMinutes)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {formatDistance(r.distanceMiles)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => updateRequestStatus(r.id, "accepted")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => updateRequestStatus(r.id, "cancelled")}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {r.status === "accepted" && (
                  <Button
                    size="sm"
                    onClick={() => updateRequestStatus(r.id, "en_route")}
                  >
                    En route
                  </Button>
                )}
                {r.status === "en_route" && (
                  <Button
                    size="sm"
                    onClick={() => updateRequestStatus(r.id, "arrived")}
                  >
                    Arrived
                  </Button>
                )}
                {r.status === "arrived" && (
                  <Button
                    size="sm"
                    onClick={() => updateRequestStatus(r.id, "completed")}
                  >
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
