"use client";

/**
 * Requests — Live help & dispatch.
 * Active jobs open the live job flow. Past jobs open a view-only process summary (no chat).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import {
  VerificationBlockedPanel,
  VerificationWarningBanner,
} from "@/components/auth/verification-gate-banner";
import { PageHeader } from "@/components/layout/page-header";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import { JOB_CLOSED_MESSAGE } from "@/lib/chat-expired";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const OPEN: JobFlowStatus[] = [
  "waiting_for_selected",
  "selected_review",
  "sequential_pairing",
  "waiting_for_pro",
  "reserved",
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
];

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

function statusLabel(s: JobFlowStatus, isPro: boolean): string {
  switch (s) {
    case "waiting_for_selected":
    case "selected_review":
      return isPro ? "Service Request" : "Finding a pro";
    case "sequential_pairing":
      return isPro ? "Service Request" : "Finding a pro";
    case "waiting_for_pro":
    case "reserved":
      return isPro ? "Service Request" : "Repair Pro reviewing";
    case "negotiating":
      return isPro ? "Service Request" : "Negotiating";
    case "agreed":
      return "Agreed";
    case "paid_booked":
      return "Booked";
    case "en_route":
      return "OnTheRoad";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "Working";
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

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function RequestsPage() {
  const router = useRouter();
  const { theme, accountType, backendUserId } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const viewer = isPro ? "repair_pro" : "motorist";

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
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
    try {
      const { apiExpireStaleBookedJobs } = await import("@/lib/jobs/client");
      await apiExpireStaleBookedJobs();
    } catch {
      /* ignore */
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
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 120_000);
    return () => window.clearInterval(t);
  }, [load]);

  const { active, past } = useMemo(() => {
    const a: JobRecord[] = [];
    const p: JobRecord[] = [];
    for (const j of jobs) {
      if (OPEN.includes(j.status)) a.push(j);
      else if (PAST.includes(j.status)) p.push(j);
      else p.push(j);
    }
    return { active: a, past: p };
  }, [jobs]);

  const openJob = (j: JobRecord) => {
    if (OPEN.includes(j.status)) {
      router.push(`/jobs/${j.id}`);
      return;
    }
    // Past / closed: popup first, View opens process summary
    setViewHref(`/requests/${j.id}`);
    setClosedOpen(true);
  };

  const Row = ({ j }: { j: JobRecord }) => {
    // Pro: no customer full name — vehicle + issues only
    const name = isPro
      ? isAutomotiveTrade(j.serviceType) && j.motoristVehicle?.trim()
        ? j.motoristVehicle.trim()
        : j.motoristName?.split(/\s+/)[0] || PRO_SERVICE_LABELS[j.serviceType] || "Service Request"
      : j.repairProName;
    const skill = PRO_SERVICE_LABELS[j.serviceType] ?? j.serviceType;
    const when = formatWhen(j.updatedAt || j.createdAt);
    const price =
      j.agreedMajor != null
        ? formatMoney(j.agreedMajor, j.currency)
        : null;
    const isOpen = OPEN.includes(j.status);

    return (
      <button
        type="button"
        onClick={() => openJob(j)}
        className={cn(
          "flex w-full items-start gap-3 border-0 bg-transparent py-3.5 text-left",
          ""
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                isOpen
                  ? "bg-[#FF6B35] text-white"
                  : isLight
                    ? "bg-transparent text-slate-700 ring-1 ring-black/15"
                    : "bg-transparent text-white/80 ring-1 ring-white/25"
              )}
            >
              {statusLabel(j.status, isPro)}
            </span>
            <span className={cn("text-[10px] font-medium", muted)}>
              {skill}
            </span>
          </div>
          <p className={cn("mt-1.5 truncate text-[15px] font-semibold", ink)}>
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
            {!isOpen ? " · View only" : ""}
          </p>
        </div>
        <ChevronRight
          className={cn("mt-1 h-4 w-4 shrink-0", muted)}
          aria-hidden
        />
      </button>
    );
  };

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", stage)}>
      <PageHeader title="Requests" subtitle="Live help & dispatch" />
      <div className="px-4 pb-1">
        <Link
          href="/jobs"
          className="text-[12px] font-semibold text-[#FF6B35]"
        >
          Open jobs inbox →
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 scrollbar-hide">
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

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF6B35]" />
          </div>
        )}

        {err && (
          <p className="py-4 text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}

        {!loading && jobs.length === 0 && (
          <div className="py-14 text-center">
            <p className={cn("text-[15px] font-semibold", ink)}>
              No requests yet
            </p>
            <p className={cn("mt-1 text-[12px] font-medium", muted)}>
              {isPro
                ? "New motorist requests will show here."
                : "Request help from Home to start."}
            </p>
            {!isPro && (
              <Link
                href="/"
                className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[#FF6B35] px-5 text-[13px] font-semibold text-white"
              >
                Find help nearby
              </Link>
            )}
          </div>
        )}

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
            <div>
              {active.map((j) => (
                <Row key={j.id} j={j} />
              ))}
            </div>
          </section>
        )}

        {!loading && past.length > 0 && (
          <section>
            <p
              className={cn(
                "mb-1 text-[11px] font-semibold uppercase tracking-wide",
                muted
              )}
            >
              Past
            </p>
            <p className={cn("mb-2 text-[11px] font-medium leading-snug", muted)}>
              Tap a past request to view the full process. Chat is closed —
              view only.
            </p>
            <div>
              {past.map((j) => (
                <Row key={j.id} j={j} />
              ))}
            </div>
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
