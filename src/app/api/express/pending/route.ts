import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The customer's unpaid Ona Express booking (for a "Finish payment" card). */
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const sb = createServiceSupabase();
    const { data } = await sb
      .from("service_requests")
      .select(
        "id, service_type, pickup_lat, pickup_lng, pickup_address, scheduled_at",
      )
      .eq("motorist_id", auth.userId)
      .eq("source", "express")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);

    const row = (data ?? [])[0];
    if (!row) return apiOk({ pending: null });

    return apiOk({
      pending: {
        requestId: String(row.id),
        trade: String(row.service_type),
        lat: Number(row.pickup_lat ?? 0),
        lng: Number(row.pickup_lng ?? 0),
        locationLabel: String(row.pickup_address || "Near you"),
        scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
      },
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Lookup failed", 500);
  }
}
