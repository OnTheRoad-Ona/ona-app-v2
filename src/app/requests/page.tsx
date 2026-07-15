"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Navigation } from "lucide-react";
import {
  VerificationBlockedPanel,
  VerificationWarningBanner,
} from "@/components/auth/verification-gate-banner";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import type { RequestStatus } from "@/lib/types";
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
  const {
    requests,
    updateRequestStatus,
    theme,
    accountType,
    registeredAs,
    proServices,
    ensureChatForRequest,
  } = useApp();
  const isLight = theme === "light";
  const [warning, setWarning] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const isPro = accountType === "professional";
  const mySkill =
    registeredAs !== "client" ? registeredAs : proServices[0] ?? null;

  const visibleRequests = isPro
    ? requests.filter((r) => !mySkill || r.serviceType === mySkill)
    : requests;

  const handleUpdate = (id: string, status: RequestStatus) => {
    const result = updateRequestStatus(id, status);
    if (!result.ok) {
      setBlocked(result.message);
      setWarning(null);
      return;
    }
    setBlocked(null);
    if (result.warning) setWarning(result.warning);
    if (status === "accepted") {
      const req = requests.find((r) => r.id === id);
      if (req) ensureChatForRequest(req);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title="Requests" subtitle="Live help & dispatch" />

      <div className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-hide">
        {warning && (
          <VerificationWarningBanner
            message={warning}
            isLight={isLight}
            onDismiss={() => setWarning(null)}
          />
        )}
        {blocked && (
          <VerificationBlockedPanel
            message={blocked}
            isLight={isLight}
            onClose={() => setBlocked(null)}
          />
        )}
        {visibleRequests.length === 0 ? (
          <div
            className={cn(
              "rounded-lg p-6 text-center",
              isLight ? "bg-slate-50" : "bg-black"
            )}
          >
            <p className="font-semibold text-sm">No active requests</p>
            <p className="mt-1 text-xs text-muted">
              {isPro
                ? "Only jobs for your skill appear here."
                : "Request help from Home to connect."}
            </p>
            {!isPro && (
              <Button asChild className="mt-3 h-10" size="default">
                <Link href="/">Find help nearby</Link>
              </Button>
            )}
          </div>
        ) : (
          visibleRequests.map((r) => (
            <article key={r.id} className="card-surface rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={cn(
                      "text-sm font-bold",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    {isPro ? r.problem : r.technicianName}
                  </p>
                  <p className="text-xs capitalize text-muted">
                    {r.serviceType} · {isPro ? r.locationLabel : r.problem}
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
                  {formatDistance(r.distanceKm)}
                </span>
              </div>

              {r.bookingForSomeoneElse && (
                <p className="mt-1.5 text-[11px] font-semibold text-brand">
                  Booking for someone else · {r.locationLabel}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.status === "pending" && isPro && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(r.id, "accepted")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleUpdate(r.id, "cancelled")}
                    >
                      Decline
                    </Button>
                  </>
                )}
                {/* Motorist: cancel / completed only after pro has accepted */}
                {!isPro &&
                  ["accepted", "en_route", "arrived", "in_progress"].includes(
                    r.status
                  ) && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleUpdate(r.id, "cancelled")}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(r.id, "completed")}
                      >
                        Completed
                      </Button>
                      <Button size="sm" variant="secondary" asChild>
                        <Link href={`/requests/track?id=${r.id}`}>Track</Link>
                      </Button>
                    </>
                  )}
                {r.status === "accepted" && isPro && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(r.id, "en_route")}
                    >
                      En route
                    </Button>
                    <Button size="sm" variant="secondary" asChild>
                      <Link href="/messages">Chat</Link>
                    </Button>
                  </>
                )}
                {r.status === "en_route" && isPro && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdate(r.id, "arrived")}
                  >
                    Arrived
                  </Button>
                )}
                {r.status === "arrived" && isPro && (
                  <Button
                    size="sm"
                    onClick={() => handleUpdate(r.id, "completed")}
                  >
                    Complete
                  </Button>
                )}
                {r.status === "pending" && !isPro && (
                  <p className="w-full text-[11px] text-muted">
                    Waiting for Repair Pro to accept…
                  </p>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
