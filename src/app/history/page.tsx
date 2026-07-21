"use client";

/**
 * History — past bookings (completed, cancelled, expired, etc.) with filters.
 * View-only process; no chat.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import { JOB_CLOSED_MESSAGE } from "@/lib/chat-expired";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type HistoryFilter =
  | "all"
  | "completed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "disputed"
  | "other";

const PAST: JobFlowStatus[] = [
  "completed",
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "disputed",
  "under_appeal",
  "refunded",
];

const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "expired", label: "Expired" },
  { id: "refunded", label: "Refunded" },
  { id: "disputed", label: "Disputed" },
  { id: "other", label: "Other" },
];

function statusLabel(s: JobFlowStatus, isPro: boolean): string {
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
    default:
      return String(s).replace(/_/g, " ");
  }
}

function matchesFilter(status: JobFlowStatus, f: HistoryFilter): boolean {
  if (f === "all") return true;
  if (f === "completed")
    return (
      status === "completed" ||
      status === "satisfied" ||
      status === "released"
    );
  if (f === "cancelled") return status === "cancelled";
  if (f === "expired") return status === "expired";
  if (f === "refunded") return status === "refunded";
  if (f === "disputed")
    return status === "disputed" || status === "under_appeal";
  // other
  return !["completed", "satisfied", "released", "cancelled", "expired", "refunded", "disputed", "under_appeal"].includes(
    status
  );
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

export default function HistoryPage() {
  const router = useRouter();
  const { theme, accountType, backendUserId } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const viewer = isPro ? "repair_pro" : "motorist";

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [closedOpen, setClosedOpen] = useState(false);
  const [viewHref, setViewHref] = useState<string | null>(null);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";

  const load = useCallback(async () => {
    if (!backendUserId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    const res = await apiListJobs(backendUserId, viewer);
    if (!res.ok) {
      setErr(res.message);
      setLoading(false);
      return;
    }
    const list = res.data.jobs
      .filter((j) => {
        if (!j.problem?.trim()) return false;
        if (!PAST.includes(j.status)) return false;
        if (viewer === "repair_pro" && j.repairProId !== backendUserId)
          return false;
        if (viewer === "motorist" && j.motoristId !== backendUserId)
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
    setJobs(list);
    setErr(null);
    setLoading(false);
  }, [backendUserId, viewer]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => jobs.filter((j) => matchesFilter(j.status, filter)),
    [jobs, filter]
  );

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", stage)}>
      <PageHeader
        title="History"
        subtitle="Past bookings · view only"
        backHref={isPro ? "/dashboard" : "/"}
      />

      {/* Filters */}
      <div className="shrink-0 overflow-x-auto px-4 pb-2 scrollbar-hide">
        <div className="flex min-w-min gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "shrink-0 rounded-full border-0 px-3 py-1.5 text-[11px] font-semibold transition",
                  on
                    ? "bg-[#2c2c2e] text-white"
                    : isLight
                      ? "bg-transparent text-slate-700 ring-1 ring-black/15"
                      : "bg-transparent text-white/80 ring-1 ring-white/20"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className={cn("px-4 pb-2 text-[11px] font-medium leading-snug", muted)}>
        Cancelled, completed, expired, and other closed jobs. Tap to view the
        full process. Chat is not available.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 scrollbar-hide">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#e07a3d]" />
          </div>
        )}
        {err && (
          <p className="py-4 text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-14 text-center">
            <p className={cn("text-[15px] font-semibold", ink)}>
              No history yet
            </p>
            <p className={cn("mt-1 text-[12px] font-medium", muted)}>
              {filter === "all"
                ? "Finished and cancelled jobs will appear here."
                : `No ${FILTERS.find((x) => x.id === filter)?.label.toLowerCase()} jobs.`}
            </p>
          </div>
        )}

        {!loading &&
          filtered.map((j) => {
            const name = isPro ? j.motoristName : j.repairProName;
            const skill =
              PRO_SERVICE_LABELS[j.serviceType] ?? j.serviceType;
            const when = formatWhen(j.updatedAt || j.createdAt);
            const price =
              j.agreedMajor != null
                ? formatMoney(j.agreedMajor, j.currency)
                : null;
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => {
                  setViewHref(`/requests/${j.id}`);
                  setClosedOpen(true);
                }}
                className={cn(
                  "flex w-full items-start gap-3 border-0 border-b bg-transparent py-3.5 text-left last:border-b-0",
                  isLight ? "border-black/10" : "border-white/10"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                        isLight
                          ? "text-slate-800 ring-1 ring-black/15"
                          : "text-white/90 ring-1 ring-white/25"
                      )}
                    >
                      {statusLabel(j.status, isPro)}
                    </span>
                    <span className={cn("text-[10px] font-medium", muted)}>
                      {skill}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 truncate text-[15px] font-semibold",
                      ink
                    )}
                  >
                    {name}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug",
                      muted
                    )}
                  >
                    {j.problem}
                  </p>
                  <p className={cn("mt-1 text-[11px] font-medium", muted)}>
                    {when}
                    {price ? ` · ${price}` : ""}
                    {" · View only"}
                  </p>
                </div>
                <ChevronRight
                  className={cn("mt-1 h-4 w-4 shrink-0", muted)}
                  aria-hidden
                />
              </button>
            );
          })}
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
