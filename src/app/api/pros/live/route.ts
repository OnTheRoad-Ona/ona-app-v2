import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  access_token: z.string().min(10).optional(),
  userId: z.string().uuid().optional(),
  online: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

/**
 * Repair Pro Live / Away.
 * When online: forces profiles.role = repair_pro + is_online + GPS pin
 * so motorists can discover them within 10 km (2 km if docs pending).
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);
    const b = parsed.data;

    let userId = b.userId || null;
    if (b.access_token) {
      const url = getSupabaseUrl();
      const anon = getSupabaseAnonKey();
      const userClient = createClient(url, anon, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser(b.access_token);
      if (error || !data.user) {
        return apiFail("Session expired", 401);
      }
      userId = data.user.id;
    }
    if (!userId) return apiFail("userId or access_token required", 400);

    const sb = createServiceSupabase();

    // Must have a repair_pro side profile
    const { data: proRow, error: proFind } = await sb
      .from("repair_pro_profiles")
      .select("user_id, lat, lng, docs_status, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (proFind) return apiFail(proFind.message, 500);
    if (!proRow) {
      return apiFail(
        "No Repair Pro profile. Complete pro signup first.",
        400,
        "no_pro_profile"
      );
    }

    if (b.online && proRow.status !== "approved") {
      return apiFail(
        "Your Repair Pro account is not approved yet.",
        403,
        "not_approved"
      );
    }

    const lat = b.lat;
    const lng = b.lng;
    const hasGps =
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0);

    if (b.online && !hasGps && proRow.lat == null) {
      return apiFail(
        "Location required to go Live. Enable GPS and try again.",
        400,
        "gps_required"
      );
    }

    const patch: Record<string, unknown> = {
      is_online: b.online,
      updated_at: new Date().toISOString(),
    };
    if (hasGps) {
      patch.lat = lat;
      patch.lng = lng;
    }

    const { error: upErr } = await sb
      .from("repair_pro_profiles")
      .update(patch)
      .eq("user_id", userId);

    if (upErr) return apiFail(upErr.message, 500);

    // Live → must appear as repair_pro in marketplace filter
    if (b.online) {
      await sb
        .from("profiles")
        .update({ role: "repair_pro", updated_at: new Date().toISOString() })
        .eq("id", userId);
    }

    const { data: updated } = await sb
      .from("repair_pro_profiles")
      .select("user_id, is_online, lat, lng, docs_status, status")
      .eq("user_id", userId)
      .single();

    return apiOk({
      pro: updated,
      online: b.online,
      message: b.online
        ? "You are Live. Motorists within range can find you."
        : "You are Away. Motorists cannot find you.",
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Live update failed", 500);
  }
}
