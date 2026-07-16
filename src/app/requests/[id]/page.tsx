"use client";

/**
 * Past request — view-only compiled process.
 * No chat, no re-open messaging. Read-only summary for motorist & pro.
 */

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock, Star } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiGetJob } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const STEP_ORDER: JobFlowStatus[] = [
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "satisfied",
  "released",
];

function stepTitle(s: JobFlowStatus, isPro: boolean): string {
  switch (s) {
    case "negotiating":
      return isPro ? "New request" : "Request sent";
    case "agreed":
      return "Price agreed";
    case "paid_booked":
      return "Paid & booked";
    case "en_route":
      return isPro ? "On the road" : "Pro on the way";
    case "arrived":
      return "Arrived on site";
    case "in_progress":
      return "Work in progress";
    case "completed":
      return "Work marked complete";
    case "satisfied":
      return "Motorist confirmed";
    case "released":
      return "Payment released";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Negotiation expired";
    case "disputed":
      return "Dispute opened";
    case "under_appeal":
      return "Under appeal";
    case "refunded":
      return "Refunded";
    default:
      return s.replace(/_/g, " ");
  }
}

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function RequestProcessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { theme, accountType, backendUserId } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await apiGetJob(id);
    if (!res.ok) {
      setErr(res.message || "Could not load request");
      setJob(null);
      setLoading(false);
      return;
    }
    const j = res.data.job;
    // Basic ownership check
    if (
      backendUserId &&
      j.motoristId !== backendUserId &&
      j.repairProId !== backendUserId
    ) {
      setErr("You do not have access to this request.");
      setJob(null);
      setLoading(false);
      return;
    }
    setJob(j);
    setErr(null);
    setLoading(false);
  }, [id, backendUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className={cn("flex h-full flex-col", stage)}>
        <PageHeader title="Request" backHref="/requests" />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#e07a3d]" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className={cn("flex h-full flex-col", stage)}>
        <PageHeader title="Request" backHref="/requests" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className={cn("text-[15px] font-semibold", ink)}>
            {err || "Request not found"}
          </p>
          <button
            type="button"
            onClick={() => router.push("/requests")}
            className="h-11 rounded-md bg-[#2c2c2e] px-5 text-[13px] font-semibold text-white"
          >
            Back to Requests
          </button>
        </div>
      </div>
    );
  }

  const counterpart = isPro ? job.motoristName : job.repairProName;
  const skill = PRO_SERVICE_LABELS[job.serviceType] ?? job.serviceType;
  const history = [...(job.statusHistory || [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  // Build process steps: from history, or synthesize from final status
  const timeline =
    history.length > 0
      ? history
      : [{ status: job.status, at: job.createdAt, by: undefined as string | undefined }];

  // Also show logical pipeline up to current for context (marks reached)
  const reached = new Set(timeline.map((h) => h.status));
  const pipeline = STEP_ORDER.filter(
    (s) =>
      reached.has(s) ||
      STEP_ORDER.indexOf(s) <= STEP_ORDER.indexOf(job.status as JobFlowStatus)
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col", stage)}>
      <PageHeader
        title="Request process"
        subtitle="View only · chat closed"
        backHref="/requests"
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-8 scrollbar-hide">
        {/* Closed chat notice */}
        <div
          className={cn(
            "flex items-start gap-2.5 border-0 bg-transparent pt-1",
            muted
          )}
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#e07a3d]" />
          <p className={cn("text-[12px] font-medium leading-snug", ink)}>
            This request is closed. You can review the full process here, but
            you cannot start chat or message the other party from this screen.
          </p>
        </div>

        {/* Summary */}
        <section className="bg-transparent">
          <p className={cn("text-[11px] font-semibold uppercase tracking-wide", muted)}>
            Summary
          </p>
          <p className={cn("mt-1.5 text-[17px] font-semibold", ink)}>
            {counterpart}
          </p>
          <p className={cn("mt-0.5 text-[12px] font-medium", muted)}>
            {skill}
            {job.locationLabel ? ` · ${job.locationLabel}` : ""}
          </p>
          <p className={cn("mt-3 text-[14px] font-medium leading-relaxed", ink)}>
            {job.problem}
          </p>
          {job.agreedMajor != null && (
            <p className="mt-2 text-[18px] font-semibold tabular-nums text-[#e07a3d]">
              {formatMoney(job.agreedMajor, job.currency)}
              <span className={cn("ml-1.5 text-[11px] font-medium", muted)}>
                labour only
              </span>
            </p>
          )}
          {job.paymentReference && (
            <p className={cn("mt-1 text-[11px] font-medium", muted)}>
              Ref {job.paymentReference}
            </p>
          )}
        </section>

        {/* Rating if motorist left one */}
        {job.rating != null && job.rating > 0 && (
          <section className="bg-transparent">
            <p className={cn("text-[11px] font-semibold uppercase tracking-wide", muted)}>
              Motorist rating
            </p>
            <div className="mt-1.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn(
                    "h-4 w-4",
                    n <= Number(job.rating)
                      ? "fill-[#e07a3d] text-[#e07a3d]"
                      : isLight
                        ? "text-slate-400"
                        : "text-white/30"
                  )}
                  strokeWidth={1.75}
                />
              ))}
              <span className={cn("ml-1 text-[13px] font-semibold", ink)}>
                {job.rating}/5
              </span>
            </div>
            {job.ratingNote?.trim() && (
              <p className={cn("mt-2 text-[13px] font-medium leading-snug", ink)}>
                “{job.ratingNote.trim()}”
              </p>
            )}
          </section>
        )}

        {/* Compiled process timeline */}
        <section className="bg-transparent">
          <p className={cn("mb-3 text-[11px] font-semibold uppercase tracking-wide", muted)}>
            Process
          </p>
          <ol className="relative space-y-0 border-0 pl-0">
            {timeline.map((h, i) => {
              const done = true;
              return (
                <li key={`${h.status}-${h.at}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        done
                          ? "bg-[#e07a3d] text-white"
                          : isLight
                            ? "ring-1 ring-black/20"
                            : "ring-1 ring-white/25"
                      )}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    {i < timeline.length - 1 && (
                      <span
                        className={cn(
                          "mt-1 w-px flex-1 min-h-[12px]",
                          isLight ? "bg-black/15" : "bg-white/20"
                        )}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className={cn("text-[14px] font-semibold", ink)}>
                      {stepTitle(h.status, isPro)}
                    </p>
                    <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                      {formatWhen(h.at)}
                      {h.by ? ` · ${h.by.replace(/_/g, " ")}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* If history sparse, note stages reached */}
          {pipeline.length > timeline.length && (
            <p className={cn("mt-2 text-[11px] font-medium", muted)}>
              Final status: {stepTitle(job.status, isPro)}
            </p>
          )}
        </section>

        <button
          type="button"
          onClick={() => router.push("/requests")}
          className="inline-flex h-12 w-full items-center justify-center rounded-md border-0 bg-[#2c2c2e] text-[14px] font-semibold text-white"
        >
          Back to Requests
        </button>
      </div>
    </div>
  );
}
