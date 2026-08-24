import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tow "add another repair pro": the motorist was pinged at the 60-min mark to
 * enter their current address. This dispatches the linked scheduled request:
 * it stamps the address + coordinates, moves to sequential_pairing, and
 * immediately books the first pro of the requested trade.
 */
const bodySchema = z.object({
  locationLabel: z.string().trim().min(1).max(240),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiFail("Enter your current address", 400);
    if (!isSupabaseAdminConfigured())
      return apiFail("Service unavailable", 503);

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (job.motoristId !== auth.userId) {
      return apiFail("Not your request", 403);
    }
    if (job.status !== "scheduled") {
      return apiFail("This request is no longer waiting on your address", 409);
    }

    const sb = createServiceSupabase();
    const ts = new Date().toISOString();
    const { error } = await sb
      .from("service_requests")
      .update({
        flow_status: "sequential_pairing",
        status: "requested",
        pairing_stage: "sequential_pairing",
        pairing_deadline: null,
        queue_position: 0,
        remaining_candidates: null,
        reservation_status: "none",
        assignment_status: "none",
        pairing_radius_km: job.pairingRadiusKm ?? 1,
        pickup_address: parsed.data.locationLabel,
        pickup_lat: parsed.data.lat,
        pickup_lng: parsed.data.lng,
        motorist_location_at: ts,
        updated_at: ts,
        status_history: [
          ...(job.statusHistory || []),
          { status: "sequential_pairing", at: ts, by: "second_pro_dispatch" },
        ],
      })
      .eq("id", id)
      .eq("flow_status", "scheduled");
    if (error) return apiFail("Could not dispatch request", 500);

    // Immediately book the first pro of the requested trade.
    const { advancePairing } =
      await import("@/lib/server/pairing/pairing-engine");
    await advancePairing(id);

    const updated = await getJob(id);
    if (!updated) return apiFail("Job not found", 404);
    return apiOk({ job: updated });
  } catch (e) {
    console.error("[dispatch-scheduled]", id, e);
    return apiFail(e instanceof Error ? e.message : "Dispatch failed", 500);
  }
}
