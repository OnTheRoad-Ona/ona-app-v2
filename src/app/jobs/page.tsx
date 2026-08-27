"use client";

/**
 * Jobs inbox
 * - Repair Pro (menu → Jobs): past jobs with full detail links
 * Active/incoming stay on Dashboard + job flow; multi-request still
 * surfaces via popup. Mid-trip jobs still open at /jobs/[id].
 * - Motorist: the "My jobs" inbox was removed /jobs redirects to the
 * motorist homepage; motorist requests live on /requests and /history.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import { JOB_CLOSED_MESSAGE } from "@/lib/chat-expired";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { jobTotalMajor, payableCalloutMajor } from "@/lib/callout/payable";
import { formatMoney } from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Pro past / closed only full process on /requests/[id] */
const PRO_PAST = new Set<JobFlowStatus>([
  "completed",
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "disputed",
  "under_appeal",
  "refunded",
]);

function statusLabel(s: JobFlowStatus): string {
  switch (s) {
    case "completed":
      return "Completed";
    case "satisfied":
    case "released":
      return "Finished";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "disputed":
      return "Disputed";
    case "under_appeal":
      return "Under appeal";
    case "refunded":
      return "Refunded";
    case "negotiating":
      return "Service Request";
    case "agreed":
      return "Agreed";
    case "paid_booked":
      return "Booked";
    case "en_route":
      return "On the road";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "Working";
    default:
      return String(s).replace(/_/g, " ");
  }
}

function isGenericLocation(label: string): boolean {
  const t = label.trim().toLowerCase();
  if (!t) return true;
  return (
    t === "current location" ||
    t === "locating…" ||
    t === "locating..." ||
    t === "near you" ||
    t === "last known location" ||
    t === "live location" ||
    t === "pinned location" ||
    t === "pinned"
  );
}

function meetAddress(j: JobRecord): string | null {
  const raw = (j.locationLabel || "").trim();
  if (!raw || isGenericLocation(raw)) return null;
  return raw;
}

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function JobsInboxPage() {
  const router = useRouter();
  const { theme, accountType, backendUserId } = useApp();
  const isLight = theme === "light";
  const viewer = accountType === "professional" ? "repair_pro" : "motorist";

  // The motorist "My jobs" inbox is removed a motorist landing here goes
  // straight to their homepage; the pro inbox still lives at /jobs.
  useEffect(() => {
    if (viewer === "motorist") router.replace("/");
  }, [viewer, router]);

  if (viewer === "repair_pro") {
    return <ProJobsPage isLight={isLight} backendUserId={backendUserId} />;
  }

  return null;
}

/** Menu → Jobs for Repair Pro: past jobs with full detail links */
function ProJobsPage({
  isLight,
  backendUserId,
}: {
  isLight: boolean;
  backendUserId: string | null | undefined;
}) {
  const router = useRouter();
  const [past, setPast] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const [viewHref, setViewHref] = useState<string | null>(null);

  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";

  const load = useCallback(async () => {
    // Backup: auto-cancel Booked jobs past 6h (server enforces + refunds)
    try {
      const { apiExpireStaleBookedJobs } = await import("@/lib/jobs/client");
      await apiExpireStaleBookedJobs();
    } catch {
      /* ignore */
    }
    if (!backendUserId) {
      setPast([]);
      setLoading(false);
      return;
    }
    const res = await apiListJobs(backendUserId, "repair_pro");
    if (!res.ok) {
      setErr(res.message);
      setPast([]);
      setLoading(false);
      return;
    }
    const mine = res.data.jobs.filter((j) => {
      if (j.repairProId !== backendUserId) return false;
      if (!j.motoristId || !j.problem?.trim()) return false;
      return true;
    });

    const finished = mine
      .filter((j) => PRO_PAST.has(j.status))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime(),
      )
      .slice(0, 40);

    setPast(finished);
    setErr(null);
    setLoading(false);
  }, [backendUserId]);

  useEffect(() => {
    void load();
    // Realtime is primary; backup poll only (past jobs list)
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", stage)}>
      <PageHeader title="Jobs" backHref="/dashboard" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 scrollbar-hide">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF6B35]" />
          </div>
        )}
        {err && (
          <p className="mb-3 text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}

        {/* Past job rows open full process on /requests/[id] */}
        {!loading && (
          <section>
            {past.length === 0 ? (
              <p
                className={cn(
                  "py-10 text-center text-[14px] font-semibold",
                  muted,
                )}
              >
                No jobs yet
              </p>
            ) : (
              <ul className="space-y-0">
                {past.map((j) => {
                  const addr = meetAddress(j);
                  const when = formatWhen(j.updatedAt || j.createdAt);
                  const rawCallout = Number(j.calloutQuote?.calloutFee ?? 0);
                  const callout = Number.isFinite(rawCallout) && rawCallout > 0 ? rawCallout : payableCalloutMajor(j.calloutQuote);
                  const total = jobTotalMajor(j.agreedMajor, j.calloutQuote);
                  const escrowTotal = (j as any).amountMinor != null ? (j as any).amountMinor / 100 : null;
                  const displayTotal = escrowTotal ?? total ?? (j.agreedMajor != null ? j.agreedMajor + callout : null);
                  const price = displayTotal != null ? formatMoney(displayTotal, j.currency) : null;
                  return (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setViewHref(`/requests/${j.id}`);
                          setClosedOpen(true);
                        }}
                        className={cn(
                          "flex w-full items-start gap-2.5 border-0 bg-transparent py-3.5 text-left active:opacity-90",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wide",
                                muted,
                              )}
                            >
                              {statusLabel(j.status)}
                            </span>
                            {when ? (
                              <span
                                className={cn("text-[10px] font-medium", muted)}
                              >
                                · {when}
                              </span>
                            ) : null}
                          </div>
                          <p
                            className={cn(
                              "mt-1 truncate text-[15px] font-semibold",
                              ink,
                            )}
                          >
                            {isAutomotiveTrade(j.serviceType) &&
                            j.motoristVehicle?.trim()
                              ? j.motoristVehicle.trim()
                              : j.motoristName?.split(/\s+/)[0] ||
                                PRO_SERVICE_LABELS[j.serviceType] ||
                                "Service Request"}
                          </p>
                          {j.problem?.trim() ? (
                            <p
                              className={cn(
                                "mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug",
                                muted,
                              )}
                            >
                              {j.problem}
                            </p>
                          ) : null}
                          {addr ? (
                            <p
                              className={cn(
                                "mt-0.5 line-clamp-1 text-[12px] font-medium",
                                muted,
                              )}
                            >
                              {addr}
                            </p>
                          ) : null}
                          {price ? (
                            <p
                              className={cn(
                                "mt-1 text-[13px] font-semibold tabular-nums",
                                ink,
                              )}
                            >
                              {price}
                            </p>
                          ) : null}
                        </div>
                        <ChevronRight
                          className={cn("mt-1 h-4 w-4 shrink-0", muted)}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      <ExpiredDialog
        open={closedOpen}
        isLight={isLight}
        message={JOB_CLOSED_MESSAGE}
        onClose={() => {
          setClosedOpen(false);
          setViewHref(null);
        }}
        onView={
          viewHref
            ? () => {
                const href = viewHref;
                setClosedOpen(false);
                setViewHref(null);
                router.push(href);
              }
            : undefined
        }
      />
    </div>
  );
}
