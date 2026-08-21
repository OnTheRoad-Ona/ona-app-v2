"use client";

import { DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { PRO_SERVICE_LABELS } from "@/lib/pro-service-id";
import { cn } from "@/lib/utils";

function openStatusLabel(s: JobFlowStatus): string {
  switch (s) {
    case "waiting_for_selected":
    case "selected_review":
    case "sequential_pairing":
    case "waiting_for_pro":
    case "reserved":
      return "Finding help";
    case "negotiating":
      return "Service request";
    case "agreed":
      return "Pay to book";
    case "paid_booked":
      return "Booked";
    case "en_route":
      return "On the road";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "Working";
    case "completed":
      return "Confirm release";
    case "satisfied":
      return "Finishing";
    case "disputed":
    case "under_appeal":
      return "Dispute";
    default:
      return "Open";
  }
}

export function CustomerOpenJobs({
  jobs,
  isLight,
  onOpen,
}: {
  jobs: JobRecord[];
  isLight: boolean;
  onOpen: (jobId: string) => void;
}) {
  if (!jobs.length) return null;
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  return (
    <div className="pb-1.5">
      <div className="flex flex-col gap-1">
        {jobs.map((j) => (
          <button
            key={j.id}
            type="button"
            onClick={() => onOpen(j.id)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl border-0 px-3 py-2 text-left",
              isLight ? "bg-black/[0.05]" : "bg-white/[0.06]"
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={j.repairProPhoto || DEFAULT_VENDOR_PHOTO}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
              <span className="min-w-0">
                <span className={cn("block truncate text-[13px] font-bold", ink)}>
                  {PRO_SERVICE_LABELS[j.serviceType] || j.serviceType}
                </span>
                <span className={cn("block text-[11px] font-medium", muted)}>
                  {openStatusLabel(j.status)}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-bold text-[#FF6B35]">
              Open
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
