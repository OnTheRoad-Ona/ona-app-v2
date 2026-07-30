"use client";

/**
 * Jobs inbox
 * - Motorist: open / recent pipeline (unchanged)
 * - Repair Pro (menu → Jobs): past jobs with full detail links
 *   Active/incoming stay on Dashboard + job flow; multi-request still
 *   surfaces via popup. Mid-trip jobs still open at /jobs/[id].
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, X } from "lucide-react";
import { JobShell } from "@/components/jobs/job-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import { JOB_CLOSED_MESSAGE } from "@/lib/chat-expired";
import { apiListJobs, apiTransition } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Pro past / closed only — full process on /requests/[id] */
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

/** Still open for pro (back from live job flow / multi-request) */
const PRO_ACTIVE = new Set<JobFlowStatus>([
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
]);

const MOTORIST_ACTIVE = new Set([
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "satisfied",
  "disputed",
  "under_appeal",
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
  const viewer =
    accountType === "professional" ? "repair_pro" : "motorist";

  if (viewer === "repair_pro") {
    return (
      <ProJobsPage
        isLight={isLight}
        backendUserId={backendUserId}
      />
    );
  }

  return (
    <MotoristJobsPage
      isLight={isLight}
      backendUserId={backendUserId}
      onBack={() => router.push("/")}
    />
  );
}

/** Menu → Jobs for Repair Pro: past jobs (full detail) + active if any */
function ProJobsPage({
  isLight,
  backendUserId,
}: {
  isLight: boolean;
  backendUserId: string | null | undefined;
}) {
  const router = useRouter();
  const [active, setActive] = useState<JobRecord[]>([]);
  const [past, setPast] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const [viewHref, setViewHref] = useState<string | null>(null);

  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const hairline = isLight ? "border-black/10" : "border-white/10";

  const load = useCallback(async () => {
    // Backup: auto-cancel Booked jobs past 6h (server enforces + refunds)
    try {
      const { apiExpireStaleBookedJobs } = await import("@/lib/jobs/client");
      await apiExpireStaleBookedJobs();
    } catch {
      /* ignore */
    }
    if (!backendUserId) {
      setActive([]);
      setPast([]);
      setLoading(false);
      return;
    }
    const res = await apiListJobs(backendUserId, "repair_pro");
    if (!res.ok) {
      setErr(res.message);
      setActive([]);
      setPast([]);
      setLoading(false);
      return;
    }
    const now = Date.now();
    const mine = res.data.jobs.filter((j) => {
      if (j.repairProId !== backendUserId) return false;
      if (!j.motoristId || !j.problem?.trim()) return false;
      return true;
    });

    const open = mine
      .filter((j) => {
        if (!PRO_ACTIVE.has(j.status)) return false;
        if (
          j.status === "negotiating" &&
          j.negotiateEndsAt &&
          now > new Date(j.negotiateEndsAt).getTime()
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const rank = (s: string) =>
          s === "negotiating" ? 0 : s === "agreed" ? 1 : 2;
        const d = rank(a.status) - rank(b.status);
        if (d !== 0) return d;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

    const finished = mine
      .filter((j) => PRO_PAST.has(j.status))
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      )
      .slice(0, 40);

    setActive(open);
    setPast(finished);
    setErr(null);
    setLoading(false);
  }, [backendUserId]);

  useEffect(() => {
    void load();
    // Poll for new customer requests; Realtime handles instant updates, this is a backup
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 30_000);
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

        {/* Active — keep for mid-trip back + multi-request */}
        {!loading && active.length > 0 && (
          <section className="mb-6">
            <p
              className={cn(
                "mb-1 text-[11px] font-semibold uppercase tracking-wide",
                muted
              )}
            >
              Active
            </p>
            <ul className="space-y-0">
              {active.map((j) => {
                const price =
                  j.agreedMajor != null
                    ? formatMoney(j.agreedMajor, j.currency)
                    : null;
                const unbooked = j.status === "negotiating" || j.status === "agreed";
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="flex items-start gap-2.5 border-0 bg-transparent py-3.5 active:opacity-90"
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[10px] font-bold uppercase", muted)}>
                          {statusLabel(j.status)}
                        </p>
                        <p
                          className={cn(
                            "mt-1 truncate text-[15px] font-semibold",
                            ink
                          )}
                        >
                          {isAutomotiveTrade(j.serviceType) && j.motoristVehicle?.trim()
                            ? j.motoristVehicle.trim()
                            : j.motoristName?.split(/\s+/)[0] || PRO_SERVICE_LABELS[j.serviceType] || "Service Request"}
                        </p>
                        {j.problem?.trim() ? (
                          <p
                            className={cn(
                              "mt-0.5 line-clamp-1 text-[12px] font-medium",
                              muted
                            )}
                          >
                            {j.problem}
                          </p>
                        ) : null}
                        {price ? (
                          <p className={cn("mt-1 text-[13px] font-semibold tabular-nums", ink)}>
                            {price}
                          </p>
                        ) : null}
                      </div>
                      {unbooked ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void apiTransition({
                              jobId: j.id,
                              event: "CANCEL",
                              actor: "repair_pro",
                              actorId: backendUserId || undefined,
                              reason: "pro_declined",
                            }).then(() => load());
                          }}
                          className={cn(
                            "shrink-0 rounded-full border-0 p-1.5",
                            isLight ? "hover:bg-black/10" : "hover:bg-white/10"
                          )}
                          aria-label="Decline"
                        >
                          <X className={cn("h-4 w-4", muted)} strokeWidth={2} />
                        </button>
                      ) : (
                        <ChevronRight className={cn("mt-1 h-4 w-4 shrink-0", muted)} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Past job rows — open full process on /requests/[id] */}
        {!loading && (
          <section>
            {past.length === 0 && active.length === 0 ? (
              <p className={cn("py-10 text-center text-[14px] font-semibold", muted)}>
                No jobs yet
              </p>
            ) : past.length === 0 ? null : (
              <ul className="space-y-0">
                {past.map((j) => {
                  const addr = meetAddress(j);
                  const when = formatWhen(j.updatedAt || j.createdAt);
                  const price =
                    j.agreedMajor != null
                      ? formatMoney(j.agreedMajor, j.currency)
                      : null;
                  return (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setViewHref(`/requests/${j.id}`);
                          setClosedOpen(true);
                        }}
                        className={cn(
                          "flex w-full items-start gap-2.5 border-0 bg-transparent py-3.5 text-left active:opacity-90"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wide",
                                muted
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
                              ink
                            )}
                          >
                          {isAutomotiveTrade(j.serviceType) && j.motoristVehicle?.trim()
                            ? j.motoristVehicle.trim()
                            : j.motoristName?.split(/\s+/)[0] || PRO_SERVICE_LABELS[j.serviceType] || "Service Request"}
                          </p>
                          {j.problem?.trim() ? (
                            <p
                              className={cn(
                                "mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug",
                                muted
                              )}
                            >
                              {j.problem}
                            </p>
                          ) : null}
                          {addr ? (
                            <p
                              className={cn(
                                "mt-0.5 line-clamp-1 text-[12px] font-medium",
                                muted
                              )}
                            >
                              {addr}
                            </p>
                          ) : null}
                          {price ? (
                            <p className={cn("mt-1 text-[13px] font-semibold tabular-nums", ink)}>
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

function MotoristJobsPage({
  isLight,
  backendUserId,
  onBack,
}: {
  isLight: boolean;
  backendUserId: string | null | undefined;
  onBack: () => void;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-[#a1a1a6]";
  const row = isLight ? "bg-[#bebfc4]" : "bg-[#141414]";

  useEffect(() => {
    if (!backendUserId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { apiExpireStaleBookedJobs } = await import("@/lib/jobs/client");
        await apiExpireStaleBookedJobs();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const res = await apiListJobs(backendUserId, "motorist");
      if (cancelled) return;
      if (!res.ok) {
        setErr(res.message);
        setLoading(false);
        return;
      }
      const now = Date.now();
      const list = res.data.jobs
        .filter((j) => {
          if (!MOTORIST_ACTIVE.has(j.status)) return false;
          if (!j.problem?.trim()) return false;
          if (
            j.status === "negotiating" &&
            j.negotiateEndsAt &&
            now > new Date(j.negotiateEndsAt).getTime()
          ) {
            return false;
          }
          if (j.motoristId !== backendUserId) return false;
          return true;
        })
        .sort((a, b) => {
          // Needs “I am satisfied” first
          const rank = (s: string) =>
            s === "completed"
              ? 0
              : s === "negotiating"
                ? 1
                : s === "agreed"
                  ? 2
                  : 3;
          const d = rank(a.status) - rank(b.status);
          if (d !== 0) return d;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      setJobs(list);
      setLoading(false);
      // Auto-open only when customer still must confirm (not if already confirmed / released)
      const { needsCustomerReleaseConfirm } = await import(
        "@/lib/jobs/constants"
      );
      const needsConfirm = list.find((j) => needsCustomerReleaseConfirm(j));
      if (needsConfirm && !cancelled) {
        // Do not force-navigate every poll — once per session max
        try {
          const key = "om-jobs-auto-open-release";
          const seen = sessionStorage.getItem(key) || "";
          if (!seen.includes(needsConfirm.id)) {
            sessionStorage.setItem(
              key,
              `${seen},${needsConfirm.id}`.slice(-200)
            );
            const { showAppNotification, ensureNotifyPermission } =
              await import("@/lib/app-notify");
            void ensureNotifyPermission();
            showAppNotification({
              title: "Confirm Job & Release Payment",
              body: "Confirm satisfaction to release escrow to your Repair Pro.",
              tag: `job-complete-${needsConfirm.id}`,
              href: `/jobs/${needsConfirm.id}`,
              requireInteraction: true,
            });
            router.replace(`/jobs/${needsConfirm.id}`);
          }
        } catch {
          /* */
        }
      }
    };
    void load();
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [backendUserId, router]);

  return (
    <JobShell isLight={isLight} title="My jobs" onBack={onBack}>
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
      {!loading && jobs.length === 0 && (
        <p className={cn("py-10 text-center text-[14px] font-semibold", muted)}>
          No jobs yet
        </p>
      )}
      <ul className="space-y-2">
        {jobs.map((j) => {
          const price =
            j.agreedMajor != null
              ? formatMoney(j.agreedMajor, j.currency)
              : null;
          const needsSatisfied =
            j.status === "completed" &&
            !j.satisfiedAt &&
            !j.releasedAt &&
            j.escrowStatus !== "released";
          return (
            <li key={j.id}>
              <Link
                href={`/jobs/${j.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-3",
                  needsSatisfied
                    ? "bg-[#FF6B35] text-white"
                    : row
                )}
              >
                <div className="min-w-0 flex-1">
                  {needsSatisfied ? (
                    <p className="text-[11px] font-black uppercase tracking-wide text-white/90">
                      Tap to confirm — release pay
                    </p>
                  ) : null}
                  <p
                    className={cn(
                      "truncate text-[15px] font-black leading-tight",
                      needsSatisfied ? "text-white" : ink
                    )}
                  >
                    {j.repairProName}
                  </p>
                  {j.problem?.trim() && (
                    <p
                      className={cn(
                        "mt-1.5 line-clamp-1 text-[12px] font-medium",
                        needsSatisfied ? "text-white/85" : muted
                      )}
                    >
                      {j.problem}
                    </p>
                  )}
                  {price && (
                    <p
                      className={cn(
                        "mt-1 text-[13px] font-black tabular-nums",
                        needsSatisfied ? "text-white" : ink
                      )}
                    >
                      {price}
                    </p>
                  )}
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0",
                    needsSatisfied
                      ? "text-white"
                      : isLight
                        ? "text-slate-500"
                        : "text-[#6b6b6b]"
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </JobShell>
  );
}
