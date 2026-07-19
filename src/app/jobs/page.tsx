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
import { ChevronRight, Loader2 } from "lucide-react";
import { JobShell } from "@/components/jobs/job-shell";
import { PageHeader } from "@/components/layout/page-header";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
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
      return "New request";
    case "agreed":
      return "Agreed";
    case "paid_booked":
      return "Paid · Booked";
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
  const [active, setActive] = useState<JobRecord[]>([]);
  const [past, setPast] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const hairline = isLight ? "border-black/10" : "border-white/10";

  const load = useCallback(async () => {
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
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 90_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", stage)}>
      <PageHeader title="Jobs" backHref="/dashboard" />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 scrollbar-hide">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#e07a3d]" />
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
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className={cn(
                        "flex items-start gap-2.5 border-0 border-b bg-transparent py-3.5 active:opacity-90",
                        hairline
                      )}
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
                          {j.motoristName}
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
                      <ChevronRight
                        className={cn("mt-1 h-4 w-4 shrink-0", muted)}
                      />
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
                      <Link
                        href={`/requests/${j.id}`}
                        className={cn(
                          "flex items-start gap-2.5 border-0 border-b bg-transparent py-3.5 active:opacity-90",
                          hairline
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
                            {j.motoristName}
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
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
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
          const rank = (s: string) =>
            s === "negotiating" ? 0 : s === "agreed" ? 1 : 2;
          const d = rank(a.status) - rank(b.status);
          if (d !== 0) return d;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      setJobs(list);
      setLoading(false);
    };
    void load();
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [backendUserId]);

  return (
    <JobShell isLight={isLight} title="My jobs" onBack={onBack}>
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#e07a3d]" />
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
          return (
            <li key={j.id}>
              <Link
                href={`/jobs/${j.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-3",
                  row
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-[15px] font-black leading-tight",
                      ink
                    )}
                  >
                    {j.repairProName}
                  </p>
                  {j.problem?.trim() && (
                    <p
                      className={cn(
                        "mt-1.5 line-clamp-1 text-[12px] font-medium",
                        muted
                      )}
                    >
                      {j.problem}
                    </p>
                  )}
                  {price && (
                    <p className={cn("mt-1 text-[13px] font-black tabular-nums", ink)}>
                      {price}
                    </p>
                  )}
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isLight ? "text-slate-500" : "text-[#6b6b6b]"
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
