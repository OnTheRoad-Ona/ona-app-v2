import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { computeDriveMetrics } from "@/lib/server/google-eta";
import { getJob, updateTripPartyLocation } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Who is sending live GPS — both sides track during active trip */
  actor: z.enum(["motorist", "repair_pro"]).optional().default("repair_pro"),
  actorId: z.string().optional(),
});

/**
 * Live GPS for active trip.
 * - Repair Pro: updates pro pin → motorist sees movement
 * - Motorist: updates motorist pin → pro can track them
 * Recomputes drive ETA when both points exist.
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

    const actor = parsed.data.actor;
    const point = { lat: parsed.data.lat, lng: parsed.data.lng };

    const pro =
      actor === "repair_pro" ? point : job.proLocation || null;
    const motorist =
      actor === "motorist" ? point : job.motoristLocation;

    let distanceKm = job.distanceKm ?? 0;
    let etaMinutes = job.etaMinutes ?? 0;
    let durationText = job.etaText ?? undefined;
    let distanceText = job.distanceText ?? undefined;
    let source = job.etaSource ?? "none";

    if (pro && motorist) {
      const metrics = await computeDriveMetrics(pro, motorist);
      distanceKm = metrics.distanceKm;
      const arrivedClose = metrics.distanceKm <= 0.15;
      etaMinutes = arrivedClose
        ? Math.min(metrics.etaMinutes, 1)
        : metrics.etaMinutes;
      durationText = metrics.durationText;
      distanceText = metrics.distanceText;
      source = metrics.source;
    }

    const updated = await updateTripPartyLocation({
      jobId: id,
      actor,
      location: point,
      distanceKm,
      etaMinutes,
      metricsSource: source,
      durationText,
      distanceText,
    });

    if (!updated) return apiFail("Could not save location", 500);
    return apiOk({
      job: updated,
      metrics: {
        distanceKm,
        etaMinutes,
        source,
        durationText,
        distanceText,
      },
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Location update failed",
      500
    );
  }
}
