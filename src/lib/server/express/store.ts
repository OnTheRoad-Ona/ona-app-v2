/**
 * Ona Express booking store + final auto-assignment from Ona's own pool.
 *
 * Hard boundaries:
 * - Express jobs carry source='express'; marketplace sweeps never touch them.
 * - Assignment is FINAL: the assigned pro is never asked to accept/reject.
 * - Payment ledger lives in ona_express_payments (never job escrow).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabase } from "@/lib/supabase/server";
import { insertNotification } from "@/lib/server/notifications";

export type ExpressBookingRow = {
  id: string;
  motorist_id: string;
  service_type: string;
  status: string;
  description: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_address: string | null;
  scheduled_at: string | null;
};

/** Create a parked express booking. Stays invisible to all matching sweeps. */
export async function createExpressBooking(opts: {
  sb: SupabaseClient;
  requestId: string;
  motoristId: string;
  serviceType: string;
  problem: string;
  lat: number;
  lng: number;
  locationLabel: string;
  scheduledAt: string | null;
}): Promise<void> {
  const { error } = await opts.sb.from("service_requests").insert({
    id: opts.requestId,
    motorist_id: opts.motoristId,
    service_type: opts.serviceType,
    // Parked until upfront payment confirms; sweeps ignore source='express'.
    status: "draft",
    flow_status: "express_pending_payment",
    pairing_stage: "express_pending_payment",
    source: "express",
    description: opts.problem,
    pickup_lat: opts.lat,
    pickup_lng: opts.lng,
    pickup_address: opts.locationLabel,
    radius_km: 10,
    scheduled_at: opts.scheduledAt,
  });
  if (error) throw new Error(`express booking insert: ${error.message}`);
}

export async function getExpressBooking(
  requestId: string,
): Promise<ExpressBookingRow | null> {
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select(
      "id, motorist_id, service_type, status, description, pickup_lat, pickup_lng, pickup_address, scheduled_at",
    )
    .eq("id", requestId)
    .eq("source", "express")
    .maybeSingle();
  return (data as ExpressBookingRow) ?? null;
}

/** Nearest active pool pro of a trade to a point. Used for quotes + assignment. */
export async function findNearestExpressPro(opts: {
  trade: string;
  lat: number;
  lng: number;
}): Promise<{
  proId: string;
  proName: string;
  lat: number;
  lng: number;
  distanceKm: number;
} | null> {
  const sb = createServiceSupabase();

  // Pool members (active), then online pros of this trade, then names.
  const { data: poolRows } = await sb
    .from("ona_express_pool")
    .select("pro_id")
    .eq("active", true);
  const proIds = (poolRows ?? []).map((r) => String(r.pro_id));
  if (!proIds.length) return null;

  const [{ data: proRows }, { data: profileRows }] = await Promise.all([
    sb
      .from("repair_pro_profiles")
      .select("user_id, lat, lng")
      .in("user_id", proIds)
      .eq("is_online", true)
      .contains("services", [opts.trade]),
    sb.from("profiles").select("id, full_name").in("id", proIds),
  ]);
  if (!proRows?.length) return null;

  const nameById = new Map<string, string>();
  for (const p of profileRows ?? []) {
    nameById.set(String(p.id), String(p.full_name || "Repair Pro"));
  }

  let best: {
    proId: string;
    proName: string;
    lat: number;
    lng: number;
    distanceKm: number;
  } | null = null;
  for (const row of proRows as Array<{
    user_id: string;
    lat: number | null;
    lng: number | null;
  }>) {
    const plat = Number(row.lat);
    const plng = Number(row.lng);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
    const dLat = ((plat - opts.lat) * Math.PI) / 180;
    const dLng = ((plng - opts.lng) * Math.PI) / 180;
    const lat1 = (opts.lat * Math.PI) / 180;
    const lat2 = (plat * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (!best || km < best.distanceKm) {
      best = {
        proId: row.user_id,
        proName: nameById.get(row.user_id) || "Repair Pro",
        lat: plat,
        lng: plng,
        distanceKm: km,
      };
    }
  }
  return best;
}

/**
 * Final assignment: nearest active pool pro of the detected trade to the
 * customer's pickup point. No offer is made; the pro cannot accept/reject.
 */
export async function assignNearestExpressPro(opts: {
  requestId: string;
  trade: string;
  lat: number;
  lng: number;
  motoristName: string;
}): Promise<{ proId: string; proName: string; distanceKm: number } | null> {
  const best = await findNearestExpressPro({
    trade: opts.trade,
    lat: opts.lat,
    lng: opts.lng,
  });
  if (!best) return null;

  const sb = createServiceSupabase();
  const ts = new Date().toISOString();
  const { error } = await sb
    .from("service_requests")
    .update({
      repair_pro_id: best.proId,
      chosen_pro_id: best.proId,
      status: "accepted",
      accepted_at: ts,
      assignment_status: "assigned_final",
      updated_at: ts,
      status_history: [
        {
          status: "accepted",
          at: ts,
          by: `express:auto-assign:${best.proId}`,
        },
      ],
    })
    .eq("id", opts.requestId)
    .eq("source", "express");
  if (error) throw new Error(`express assign: ${error.message}`);

  await sb
    .from("ona_express_pool")
    .update({ last_assigned_at: ts })
    .eq("pro_id", best.proId);

  await insertNotification({
    userId: best.proId,
    category: "requests",
    priority: "high",
    title: "Ona Express Assignment",
    body: `${opts.motoristName} needs you (${opts.trade}). This assignment is final.`,
    href: `/jobs/${opts.requestId}`,
    actionType: "open_job",
    actionPayload: { jobId: opts.requestId },
    jobId: opts.requestId,
    jobStatus: "accepted",
    groupKey: `express-${opts.requestId}`,
  }).catch(() => undefined);

  return best;
}
