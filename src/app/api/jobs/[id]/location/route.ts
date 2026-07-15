import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { computeDriveMetrics } from "@/lib/server/google-eta";
import { getJob, updateJobLocation } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** repair_pro pushes live GPS; optional actor id for future auth */
  actorId: z.string().optional(),
});

/**
 * Repair Pro live GPS ping while on trip.
 * Recomputes drive ETA + distance via Google Distance Matrix (traffic-aware).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid location", 400);

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);

    const active = [
      "paid_booked",
      "en_route",
      "arrived",
      "in_progress",
    ].includes(job.status);
    if (!active) {
      return apiFail("Location updates only while trip is active", 400);
    }

    const pro = { lat: parsed.data.lat, lng: parsed.data.lng };
    const metrics = await computeDriveMetrics(pro, job.motoristLocation);

    // Arrived: if within ~150m, still report but ETA can be 1
    const arrivedClose = metrics.distanceKm <= 0.15;
    const etaMinutes = arrivedClose
      ? Math.min(metrics.etaMinutes, 1)
      : metrics.etaMinutes;

    const updated = await updateJobLocation({
      jobId: id,
      proLocation: pro,
      distanceKm: metrics.distanceKm,
      etaMinutes,
      metricsSource: metrics.source,
      durationText: metrics.durationText,
      distanceText: metrics.distanceText,
    });

    if (!updated) return apiFail("Could not save location", 500);
    return apiOk({
      job: updated,
      metrics: {
        distanceKm: metrics.distanceKm,
        etaMinutes,
        source: metrics.source,
        durationText: metrics.durationText,
        distanceText: metrics.distanceText,
      },
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Location update failed",
      500
    );
  }
}
