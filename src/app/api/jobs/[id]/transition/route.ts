import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { actorMay, type TransitionEvent } from "@/lib/jobs/state-machine";
import { transitionJob } from "@/lib/server/jobs/job-store";

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
  ]),
  actor: z.enum(["motorist", "repair_pro", "system", "admin"]),
  actorId: z.string().optional(),
  proLat: z.number().optional(),
  proLng: z.number().optional(),
  etaMinutes: z.number().optional(),
  distanceKm: z.number().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
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

    const res = await transitionJob({
      jobId: id,
      event,
      actor: b.actor,
      actorId: b.actorId,
      proLocation:
        b.proLat != null && b.proLng != null
          ? { lat: b.proLat, lng: b.proLng }
          : undefined,
      etaMinutes: b.etaMinutes,
      distanceKm: b.distanceKm,
    });

    // Auto-release after satisfied
    if (!("error" in res) && res.job.status === "satisfied") {
      const rel = await transitionJob({
        jobId: id,
        event: { type: "RELEASE" },
        actor: "system",
      });
      if (!("error" in rel)) return apiOk({ job: rel.job });
    }

    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({ job: res.job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Transition failed", 500);
  }
}
