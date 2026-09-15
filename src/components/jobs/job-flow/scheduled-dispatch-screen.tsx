"use client";

import { useState } from "react";
import { AddressAutocomplete } from "@/components/map/address-autocomplete";
import type { PickedLocation } from "@/components/map/location-picker-map";
import { CopperButton } from "@/components/jobs/job-shell";
import { JobShell } from "@/components/jobs/job-shell";
import { apiDispatchScheduled } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * "Add another repair pro" (Tow): a linked second request was created at
 * booking time and armed 60 min after the first pro accepts. The motorist was
 * pinged to enter their current address; this panel collects it and dispatches
 * the trade pro there (books the first pro immediately).
 */
export function ScheduledDispatchScreen({
  job,
  isLight,
  onBack,
  onDispatched,
  onError,
}: {
  job: JobRecord;
  isLight: boolean;
  onBack: () => void;
  onDispatched: (job: JobRecord) => void;
  onError: (message: string) => void;
}) {
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const proLabel = PRO_SERVICE_LABELS[job.serviceType] || job.serviceType;
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    const res = await apiDispatchScheduled({
      jobId: job.id,
      locationLabel: picked.label,
      lat: picked.lat,
      lng: picked.lng,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message || "Could not dispatch. Try again.");
      onError(res.message || "Could not dispatch. Try again.");
      return;
    }
    onDispatched(res.data.job);
  };

  return (
    <JobShell
      isLight={isLight}
      title={`Your ${proLabel} is ready`}
      compactHeader
      onBack={onBack}
      footer={
        <div className="space-y-2">
          {err && (
            <p className="text-center text-[12px] font-semibold text-red-500">
              {err}
            </p>
          )}
          <CopperButton disabled={busy || !picked} onClick={() => void send()}>
            {busy ? "Booking…" : "Send"}
          </CopperButton>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col bg-transparent px-0.5 pt-1">
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            muted,
          )}
        >
          Your current address
        </p>
        <p className={cn("mt-1 text-[15px] font-medium leading-relaxed", ink)}>
          Enter where you are now a {proLabel.toLowerCase()} will be dispatched
          to meet you there.
        </p>
        <div className="mt-3">
          <AddressAutocomplete
            className="-mx-3"
            value={picked}
            onChange={setPicked}
          />
        </div>
        <div className="mt-4 shrink-0">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              muted,
            )}
          >
            Job details
          </p>
          <p className={cn("mt-1 text-[13px] font-medium leading-snug", muted)}>
            {job.problem}
          </p>
        </div>
      </div>
    </JobShell>
  );
}
