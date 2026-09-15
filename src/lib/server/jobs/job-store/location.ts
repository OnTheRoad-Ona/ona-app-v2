import type { JobRecord } from "@/lib/jobs/types";
import { nowIso } from "./mappers";
import { persist } from "./cache";
import { getJob } from "./reads";

/** Live GPS from Repair Pro or Motorist during active trip. */
export async function updateTripPartyLocation(input: {
  jobId: string;
  actor: "motorist" | "repair_pro";
  location: { lat: number; lng: number };
  distanceKm: number;
  etaMinutes: number;
  metricsSource?: string;
  durationText?: string;
  distanceText?: string;
}): Promise<JobRecord | null> {
  const job = await getJob(input.jobId);
  if (!job) return null;
  const ts = nowIso();
  const next: JobRecord = {
    ...job,
    distanceKm: input.distanceKm,
    etaMinutes: input.etaMinutes,
    etaText: input.durationText ?? job.etaText,
    distanceText: input.distanceText ?? job.distanceText,
    etaSource: input.metricsSource ?? job.etaSource,
    updatedAt: ts,
  };
  if (input.actor === "repair_pro") {
    next.proLocation = input.location;
    next.proLocationAt = ts;
    try {
      const { recordTravelSample } =
        await import("@/lib/server/callout/acceptance");
      await recordTravelSample({
        requestId: job.id,
        proId: job.repairProId,
        gps: {
          lat: input.location.lat,
          lng: input.location.lng,
          capturedAt: ts,
        },
      });
    } catch {
      /* optional */
    }
  } else {
    next.motoristLocation = input.location;
    next.motoristLocationAt = ts;
    try {
      const { detectCustomerLocationChange } =
        await import("@/lib/server/callout/acceptance");
      await detectCustomerLocationChange({
        requestId: job.id,
        actorId: job.motoristId,
        proId: job.repairProId,
        newLat: input.location.lat,
        newLng: input.location.lng,
      });
    } catch {
      /* optional */
    }
  }
  return persist(next);
}

/** @deprecated use updateTripPartyLocation */
export async function updateJobLocation(input: {
  jobId: string;
  proLocation: { lat: number; lng: number };
  distanceKm: number;
  etaMinutes: number;
  metricsSource?: string;
  durationText?: string;
  distanceText?: string;
}): Promise<JobRecord | null> {
  return updateTripPartyLocation({
    jobId: input.jobId,
    actor: "repair_pro",
    location: input.proLocation,
    distanceKm: input.distanceKm,
    etaMinutes: input.etaMinutes,
    metricsSource: input.metricsSource,
    durationText: input.durationText,
    distanceText: input.distanceText,
  });
}
