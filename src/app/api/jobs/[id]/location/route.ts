import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import { haversineEtaMinutes } from "@/lib/server/google-eta";
import { getJob, updateTripPartyLocation } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  actor: z.enum(["motorist", "repair_pro"]).optional().default("repair_pro"),
  actorId: z.string().optional(),
});

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Live GPS for active trip.
 *
 * DATA FIX: never call Google Distance Matrix on every ping.
 * Previously every 12-25s GPS POST hit Google Maps → massive mobile data + cost.
 * Now: cheap haversine only (client already polls job for status).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid location", 400);

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (!isJobParty(auth.userId, job)) {
      return apiFail("Forbidden", 403, "forbidden");
    }

    const active = [
      "paid_booked",
      "en_route",
      "arrived",
      "in_progress",
    ].includes(job.status);
    if (!active) {
      return apiFail("Location updates only while trip is active", 400);
    }

    // Bind actor from session, not client spoof
    const actor =
      auth.userId === job.motoristId
        ? ("motorist" as const)
        : ("repair_pro" as const);
    const point = { lat: parsed.data.lat, lng: parsed.data.lng };

    const pro = actor === "repair_pro" ? point : job.proLocation || null;
    const motorist = actor === "motorist" ? point : job.motoristLocation;

    let distanceKm = job.distanceKm ?? 0;
    let etaMinutes = job.etaMinutes ?? 0;
    let source = "haversine_fast";

    if (pro && motorist) {
      distanceKm = Math.round(haversineKm(pro, motorist) * 10) / 10;
      etaMinutes = distanceKm <= 0.15 ? 1 : haversineEtaMinutes(distanceKm);
      source = "haversine_fast";
    }

    const updated = await updateTripPartyLocation({
      jobId: id,
      actor,
      location: point,
      distanceKm,
      etaMinutes,
      metricsSource: source,
      durationText: undefined,
      distanceText: undefined,
    });

    if (!updated) return apiFail("Could not save location", 500);

    // Slim response do not ship full job history/photos every ping
    return apiOk({
      job: {
        id: updated.id,
        status: updated.status,
        proLocation: updated.proLocation,
        motoristLocation: updated.motoristLocation,
        distanceKm: updated.distanceKm,
        etaMinutes: updated.etaMinutes,
        etaText: updated.etaText,
        distanceText: updated.distanceText,
        etaSource: updated.etaSource,
        proLocationAt: updated.proLocationAt,
        motoristLocationAt: updated.motoristLocationAt,
        updatedAt: updated.updatedAt,
      },
      metrics: {
        distanceKm,
        etaMinutes,
        source,
      },
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Location update failed",
      500,
    );
  }
}
