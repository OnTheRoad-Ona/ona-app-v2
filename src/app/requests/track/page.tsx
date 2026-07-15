"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  Navigation,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceMap } from "@/components/map/service-map";
import { useApp } from "@/lib/store";
import type { RequestStatus, Technician } from "@/lib/types";
import { cn, formatDistance, formatEta } from "@/lib/utils";

const STEPS: { key: RequestStatus; label: string }[] = [
  { key: "pending", label: "Request sent" },
  { key: "accepted", label: "Pro accepted" },
  { key: "en_route", label: "On the way" },
  { key: "arrived", label: "Arrived" },
  { key: "in_progress", label: "Working" },
  { key: "completed", label: "Completed" },
];

function stepIndex(status: RequestStatus): number {
  const i = STEPS.findIndex((s) => s.key === status);
  if (status === "cancelled") return -1;
  return i >= 0 ? i : 0;
}

function TrackFlow() {
  const params = useSearchParams();
  const id = params.get("id");
  const router = useRouter();
  const {
    requests,
    technicians,
    theme,
    ensureChatForRequest,
    location,
    updateRequestStatus,
    accountType,
    userProfile,
  } = useApp();
  const isLight = theme === "light";
  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const isMotorist = accountType === "motorist";
  const [escrowNote, setEscrowNote] = useState<string | null>(null);

  const req = useMemo(
    () =>
      requests.find((r) => r.id === id) ||
      requests.find((r) =>
        ["pending", "accepted", "en_route", "arrived", "in_progress"].includes(
          r.status
        )
      ),
    [requests, id]
  );

  const tech = useMemo(
    () =>
      req ? technicians.find((t) => t.id === req.technicianId) : undefined,
    [req, technicians]
  );

  const meet = req?.meetCoordinates || location.coordinates;

  // Real-time distance / ETA while en route (smooth toward meet point)
  const [liveDist, setLiveDist] = useState(req?.distanceKm ?? 0);
  const [liveEta, setLiveEta] = useState(req?.etaMinutes ?? 0);
  const [liveTech, setLiveTech] = useState<Technician | undefined>(tech);

  useEffect(() => {
    if (!req || !tech) return;
    setLiveTech(tech);
    setLiveDist(req.distanceKm);
    setLiveEta(req.etaMinutes);
  }, [req?.id, req?.status, tech?.id]);

  useEffect(() => {
    if (!req || !tech) return;
    if (!["accepted", "en_route"].includes(req.status)) {
      if (req.status === "arrived" || req.status === "in_progress") {
        setLiveDist(0);
        setLiveEta(0);
      }
      return;
    }

    // Animate pro approaching meet pin (client-side realtime feel)
    const startDist = Math.max(req.distanceKm, 0.2);
    const startEta = Math.max(req.etaMinutes, 1);
    const started = Date.now();
    const totalMs = Math.min(startEta * 60 * 1000, 12 * 60 * 1000); // cap sim

    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / totalMs);
      // ease-out progress
      const p = 1 - (1 - t) * (1 - t);
      const remain = Math.max(0, startDist * (1 - p));
      const eta = Math.max(0, Math.round(startEta * (1 - p)));
      setLiveDist(Math.round(remain * 10) / 10);
      setLiveEta(eta);

      // Interpolate pro position toward meet
      const lat =
        tech.location.lat + (meet.lat - tech.location.lat) * p;
      const lng =
        tech.location.lng + (meet.lng - tech.location.lng) * p;
      setLiveTech({
        ...tech,
        location: { lat, lng },
        distanceKm: Math.round(remain * 10) / 10,
        etaMinutes: eta,
      });

      // Optional: if sim completes while still en_route, leave as-is until pro marks arrived
    };

    tick();
    const idTimer = window.setInterval(tick, 2000);
    return () => window.clearInterval(idTimer);
  }, [req?.id, req?.status, tech?.id, meet.lat, meet.lng]);

  const active = req ? stepIndex(req.status) : 0;
  const mapTech = liveTech || tech;

  if (!req) {
    return (
      <div className={cn("flex h-full flex-col", sheet)}>
        <PageHeader title="Track trip" subtitle="Live status" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className={cn("font-semibold", ink)}>No active request</p>
          <Link href="/" className="text-sm font-bold text-brand">
            Back home
          </Link>
        </div>
      </div>
    );
  }

  const canMotoristAct =
    isMotorist &&
    ["accepted", "en_route", "arrived", "in_progress"].includes(req.status);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", sheet)}>
      <PageHeader
        title="Track trip"
        subtitle={req.technicianName}
        backHref="/requests"
      />

      <div className="relative h-[38%] min-h-[160px] shrink-0 overflow-hidden">
        {mapTech ? (
          <ServiceMap technicians={[mapTech]} />
        ) : (
          <div
            className={cn(
              "flex h-full items-center justify-center text-sm",
              muted
            )}
          >
            Map loading…
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 scrollbar-hide">
        <div>
          <p className={cn("text-[15px] font-bold", ink)}>{req.problem}</p>
          <p className={cn("mt-0.5 text-[12px] capitalize", muted)}>
            {req.serviceType} · {req.locationLabel}
          </p>
          {req.bookingForSomeoneElse && (
            <p className="mt-1 text-[11px] font-semibold text-brand">
              Booking for someone else
            </p>
          )}
          <div
            className={cn(
              "mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold",
              ink
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5 text-brand" />
              ETA {formatEta(liveEta)}
              <span className={cn("text-[10px] font-medium", muted)}>live</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 text-brand" />
              {formatDistance(liveDist)}
              <span className={cn("text-[10px] font-medium", muted)}>live</span>
            </span>
            <span className={cn("text-[11px] font-medium capitalize", muted)}>
              {req.status.replace("_", " ")}
            </span>
          </div>
        </div>

        <ol className="space-y-0">
          {STEPS.map((s, i) => {
            const done = active >= i && req.status !== "cancelled";
            const current = active === i;
            return (
              <li key={s.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                      done
                        ? "bg-brand text-white"
                        : isLight
                          ? "bg-slate-300 text-slate-600"
                          : "bg-white/15 text-white/50"
                    )}
                  >
                    {done && i < active ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span
                      className={cn(
                        "my-0.5 min-h-[14px] w-0.5 flex-1",
                        active > i
                          ? "bg-brand"
                          : isLight
                            ? "bg-slate-300"
                            : "bg-white/15"
                      )}
                    />
                  )}
                </div>
                <div className="pb-3 pt-0.5">
                  <p
                    className={cn(
                      "text-[12px] font-semibold",
                      current ? "text-brand" : done ? ink : muted
                    )}
                  >
                    {s.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {req.status === "arrived" && (
          <p className="text-[12px] font-semibold text-emerald-600">
            Your Repair Pro has arrived at the venue.
          </p>
        )}

        <div className="flex flex-col gap-2 pb-4">
          <button
            type="button"
            onClick={() => {
              ensureChatForRequest(req);
              router.push("/messages");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-[#323231] py-3 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            Message {req.technicianName.split(" ")[0]}
          </button>

          {canMotoristAct && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  updateRequestStatus(req.id, "cancelled");
                  const uid = userProfile?.identityId || "motorist-local";
                  void fetch("/api/payments/refund", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      requestId: req.id,
                      userId: uid,
                      reason: "Cancelled before start",
                    }),
                  })
                    .then((r) => r.json())
                    .then((j) => {
                      if (j?.ok) {
                        setEscrowNote("Full refund requested (if escrow was held).");
                      }
                    });
                }}
                className={cn(
                  "flex-1 rounded-lg border-0 py-2.5 text-[12px] font-semibold",
                  isLight
                    ? "bg-transparent text-red-600"
                    : "bg-transparent text-red-400"
                )}
              >
                Cancel
              </button>
              {(req.status === "arrived" ||
                req.status === "in_progress" ||
                req.status === "en_route" ||
                req.status === "accepted") && (
                <button
                  type="button"
                  onClick={() => {
                    updateRequestStatus(req.id, "completed");
                    const uid = userProfile?.identityId || "motorist-local";
                    void fetch("/api/payments/release", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        requestId: req.id,
                        role: isMotorist ? "motorist" : "professional",
                        userId: uid,
                      }),
                    })
                      .then((r) => r.json())
                      .then((j) => {
                        if (j?.ok?.bothCompleted || j?.data?.bothCompleted) {
                          setEscrowNote(
                            "Both parties complete — releasing 95% to pro, 5% platform."
                          );
                        } else if (j?.ok || j?.data) {
                          setEscrowNote(
                            "You marked complete. Waiting for the other party to unlock payout."
                          );
                        }
                      });
                  }}
                  className="flex-1 rounded-lg border-0 bg-[#323231] py-2.5 text-[12px] font-semibold text-white"
                >
                  Completed
                </button>
              )}
            </div>
          )}
          {escrowNote && (
            <p className="text-center text-[11px] font-semibold text-brand">
              {escrowNote}
            </p>
          )}
          <button
            type="button"
            onClick={() => router.push("/payments/history")}
            className="text-center text-[11px] font-bold text-brand"
          >
            Payment history & receipts
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrackRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#c8c9cd] text-sm">
          Loading track…
        </div>
      }
    >
      <TrackFlow />
    </Suspense>
  );
}
