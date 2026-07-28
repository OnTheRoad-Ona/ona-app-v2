import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { actorMay, type TransitionEvent } from "@/lib/jobs/state-machine";
import { computeDriveMetrics } from "@/lib/server/google-eta";
import { getJob, transitionJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  event: z.enum([
    "EXPIRE_NEGOTIATION",
    "CANCEL",
    "START_TRIP",
    "MARK_ARRIVED",
    "START_WORK",
    "MARK_COMPLETED",
    "SATISFIED",
    "RELEASE",
    "START_NEGOTIATION",
  ]),
  actor: z.enum(["motorist", "repair_pro", "system", "admin"]),
  actorId: z.string().optional(),
  proLat: z.number().optional(),
  proLng: z.number().optional(),
  /** Optional client overrides — server prefers Google Distance Matrix when GPS present */
  etaMinutes: z.number().optional(),
  distanceKm: z.number().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid transition", 400);
    const b = parsed.data;

    if (!actorMay(b.event, b.actor)) {
      return apiFail("This actor cannot perform that action", 403);
    }

    const event = (
      b.event === "CANCEL"
        ? { type: "CANCEL" as const, by: b.actor }
        : { type: b.event as TransitionEvent["type"] }
    ) as TransitionEvent;

    let proLocation =
      b.proLat != null && b.proLng != null
        ? { lat: b.proLat, lng: b.proLng }
        : undefined;
    let etaMinutes = b.etaMinutes;
    let distanceKm = b.distanceKm;
    let etaText: string | undefined;
    let distanceText: string | undefined;
    let etaSource: string | undefined;

    // Accurate Google drive time when pro GPS is sent
    if (proLocation) {
      const job = await getJob(id);
      if (job?.motoristLocation) {
        const metrics = await computeDriveMetrics(
          proLocation,
          job.motoristLocation
        );
        distanceKm = metrics.distanceKm;
        etaMinutes = metrics.etaMinutes;
        etaText = metrics.durationText;
        distanceText = metrics.distanceText;
        etaSource = metrics.source;
      }
    }

    const res = await transitionJob({
      jobId: id,
      event,
      actor: b.actor,
      actorId: b.actorId,
      proLocation,
      etaMinutes,
      distanceKm,
      etaText,
      distanceText,
      etaSource,
    });

    // SATISFIED may finish as "released" or "satisfied" (PENDING_SETTLEMENT).
    // Never error the customer for settlement wait — cron auto-retries payout.
    if (!("error" in res) && res.job.status === "satisfied") {
      return apiOk({
        job: res.job,
        payoutPendingSettlement: true,
        message:
          "Payout processing — waiting for settlement. You’ll be notified when payment is released.",
      });
    }

    if ("error" in res) {
      console.error("[transition]", id, b.event, res.error);
      return apiFail(res.error, 400);
    }
    return apiOk({ job: res.job });
  } catch (e) {
    console.error("[transition]", id, e);
    return apiFail(e instanceof Error ? e.message : "Transition failed", 500);
  }
}
