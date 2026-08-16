import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import { actorMay, type TransitionEvent } from "@/lib/jobs/state-machine";
import { computeDriveMetrics } from "@/lib/server/google-eta";
import {
  getJob,
  rerouteDeclinedJob,
  transitionJob,
} from "@/lib/server/jobs/job-store";

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
    "OPEN",
    "CONFIRM",
    "LATER",
    "DECLINE",
  ]),
  actor: z.enum(["motorist", "repair_pro", "system", "admin"]),
  actorId: z.string().optional(),
  reason: z.string().optional(),
  cancelReason: z.string().optional(),
  /** Client idempotency key — dedupes replayed Open/Confirm/Later/Decline */
  idempotencyKey: z.string().max(128).optional(),
  proLat: z.number().optional(),
  proLng: z.number().optional(),
  accuracyM: z.number().optional(),
  capturedAt: z.string().optional(),
  mockLocation: z.boolean().optional(),
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
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid transition", 400);
    const b = parsed.data;

    // Never trust client-claimed admin/system without real staff session
    if (b.actor === "admin" || b.actor === "system") {
      return apiFail("Admin/system transitions require staff tools", 403);
    }

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (!isJobParty(auth.userId, job)) {
      return apiFail("Forbidden", 403, "forbidden");
    }

    // Bind actor from authenticated identity, not client spoof
    let actor: "motorist" | "repair_pro" = b.actor;
    if (auth.userId === job.motoristId) actor = "motorist";
    else if (auth.userId === job.repairProId) actor = "repair_pro";
    else {
      return apiFail("Forbidden", 403, "forbidden");
    }

    // Reject mismatches where client claims the other side
    if (b.actor !== actor) {
      return apiFail("Actor does not match your role on this job", 403);
    }
    if (b.actorId && b.actorId !== auth.userId) {
      return apiFail("actorId must match the signed-in user", 403);
    }

    if (!actorMay(b.event, actor)) {
      return apiFail("This actor cannot perform that action", 403);
    }

    // ── SSPE dispatch actions (Open / I-can-fix-this / Later / Decline) ─────
    if (
      b.event === "OPEN" ||
      b.event === "CONFIRM" ||
      b.event === "LATER" ||
      b.event === "DECLINE"
    ) {
      if (actor !== "repair_pro") {
        return apiFail("Only the assigned Repair Pro can do that", 403);
      }
      const {
        openRequest,
        confirmRequest,
        deferRequest,
        declineRequest,
      } = await import("@/lib/server/pairing/pairing-engine");
      const idempotencyKey = b.idempotencyKey || undefined;
      const t0 = Date.now();
      console.log(
        `[sspe] ${b.event} start id=${id} pro=${auth.userId} stage=${job.pairingStage ?? job.status} key=${idempotencyKey ?? "-"}`
      );
      let res;
      try {
        if (b.event === "OPEN") {
          res = await openRequest(id, auth.userId, idempotencyKey);
        } else if (b.event === "CONFIRM") {
          const gps =
            b.proLat != null && b.proLng != null
              ? {
                  lat: b.proLat,
                  lng: b.proLng,
                  accuracyM: b.accuracyM ?? null,
                  capturedAt: b.capturedAt ?? new Date().toISOString(),
                  mockLocation: b.mockLocation ?? null,
                }
              : null;
          res = await confirmRequest(id, auth.userId, idempotencyKey, gps);
        } else if (b.event === "LATER") {
          res = await deferRequest(id, auth.userId);
        } else {
          res = await declineRequest(id, auth.userId, b.reason || b.cancelReason);
        }
      } catch (err) {
        console.error(
          `[sspe] ${b.event} threw id=${id} pro=${auth.userId}:`,
          err
        );
        return apiFail("Internal error", 500);
      }
      console.log(
        `[sspe] ${b.event} end id=${id} pro=${auth.userId} ok=${res.ok} ms=${Date.now() - t0}${res.ok ? "" : ` err=${res.error} status=${res.status}`}`
      );
      if (!res.ok) return apiFail(res.error, res.status || 400);
      console.log(
        `[sspe] ${b.event} success id=${id} noop=${res.noop} next=${res.nextProId ?? "-"}`
      );
      const updatedJob = await getJob(id);
      return apiOk({
        job: updatedJob,
        rerouted: Boolean(res.nextProId),
        noop: Boolean(res.noop),
        serverNow: new Date().toISOString(),
      });
    }

    const event = (
      b.event === "CANCEL"
        ? { type: "CANCEL" as const, by: actor, reason: b.reason }
        : { type: b.event as TransitionEvent["type"] }
    ) as TransitionEvent;

    const proLocation =
      b.proLat != null && b.proLng != null
        ? { lat: b.proLat, lng: b.proLng }
        : undefined;
    let etaMinutes = b.etaMinutes;
    let distanceKm = b.distanceKm;
    let etaText: string | undefined;
    let distanceText: string | undefined;
    let etaSource: string | undefined;

    // Accurate Google drive time when pro GPS is sent
    if (proLocation && job.motoristLocation) {
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

    // Pro declined → reroute to next nearest pro instead of cancelling
    if (b.event === "CANCEL" && b.reason === "pro_declined") {
      if (actor !== "repair_pro") {
        return apiFail("Only the assigned Repair Pro can decline", 403);
      }
      const res = await rerouteDeclinedJob(id, b.cancelReason || b.reason);
      if ("error" in res) return apiFail(res.error, 400);
      return apiOk({
        job: res.job,
        rerouted: true,
        etaText,
        distanceText,
        etaSource,
        serverNow: new Date().toISOString(),
      });
    }

    const res = await transitionJob({
      jobId: id,
      event,
      actor,
      actorId: auth.userId,
      proLocation,
      etaMinutes,
      distanceKm,
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({
      job: res.job,
      etaText,
      distanceText,
      etaSource,
      serverNow: new Date().toISOString(),
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Transition failed",
      500
    );
  }
}
