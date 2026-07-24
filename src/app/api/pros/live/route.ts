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

const PRO_SELECT_FULL =
  "user_id, lat, lng, docs_status, status, visibility_tier, go_live_window_ends_at, is_online, location_updated_at";
const PRO_SELECT_BASE =
  "user_id, lat, lng, docs_status, status, is_online";

/**
 * Repair Pro Live / Away.
 * When online: forces profiles.role = repair_pro + is_online + GPS pin
 * so customers can discover them within 10 km (2 km if docs pending).
 *
 * Away (online=false) only needs is_online flip — never blocked by tier columns.
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

    // Prefer full select; fall back if migration columns not present
    let proRow: Record<string, unknown> | null = null;
    {
      const full = await sb
        .from("repair_pro_profiles")
        .select(PRO_SELECT_FULL)
        .eq("user_id", userId)
        .maybeSingle();
      if (
        full.error &&
        /visibility_tier|go_live_window|location_updated_at|is_new_artisan|column/i.test(
          full.error.message
        )
      ) {
        const base = await sb
          .from("repair_pro_profiles")
          .select(PRO_SELECT_BASE)
          .eq("user_id", userId)
          .maybeSingle();
        if (base.error) return apiFail(base.error.message, 500);
        proRow = base.data as Record<string, unknown> | null;
      } else if (full.error) {
        return apiFail(full.error.message, 500);
      } else {
        proRow = full.data as Record<string, unknown> | null;
      }
    }

    if (!proRow) {
      return apiFail(
        "No Repair Pro profile. Complete pro signup first.",
        400,
        "no_pro_profile"
      );
    }

    // Going Away must always succeed (no tier / GPS gates)
    if (!b.online) {
      const nowIso = new Date().toISOString();
      const awayPatch: Record<string, unknown> = {
        is_online: false,
        updated_at: nowIso,
      };
      const { error: awayErr } = await sb
        .from("repair_pro_profiles")
        .update(awayPatch)
        .eq("user_id", userId);
      if (awayErr) return apiFail(awayErr.message, 500);

      const { data: updated } = await sb
        .from("repair_pro_profiles")
        .select("user_id, is_online, lat, lng, docs_status, status")
        .eq("user_id", userId)
        .maybeSingle();

      return apiOk({
        pro: updated,
        online: false,
        coordinates: null,
        message: "You are Away. Customers cannot find you.",
      });
    }

    // --- Going Live ---
    if (proRow.status === "suspended" || proRow.status === "rejected") {
      return apiFail(
        "Your Repair Pro account is suspended or rejected.",
        403,
        "not_approved"
      );
    }

    // Visibility ladder: Tier 1 cannot Go Live; Tier 2 has 30-day window
    // Default tier 2 when column missing so existing pros are not locked out
    const visTier = Number(proRow.visibility_tier ?? 2);
    if (visTier < 2) {
      return apiFail(
        "Tier 1: set up your profile. Admin must approve Tier 2 before Go Live.",
        403,
        "tier1_no_live"
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
    const hasStoredPin =
      typeof proRow.lat === "number" &&
      typeof proRow.lng === "number" &&
      Number.isFinite(Number(proRow.lat)) &&
      Number.isFinite(Number(proRow.lng)) &&
      !(Number(proRow.lat) === 0 && Number(proRow.lng) === 0);

    // Without a pin, customers always see an empty list for this pro
    if (!hasGps && !hasStoredPin) {
      return apiFail(
        "Location required to go Live. Enable GPS and try again so customers can find you.",
        400,
        "gps_required"
      );
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      is_online: true,
      updated_at: nowIso,
    };
    // Always refresh pin when client sends GPS (critical for discovery)
    if (hasGps) {
      patch.lat = lat;
      patch.lng = lng;
      patch.location_updated_at = nowIso;
    }
    // Soft-extend T2 window on successful Live so pros are not locked out mid-market
    if (visTier === 2) {
      const ends = proRow.go_live_window_ends_at
        ? Date.parse(String(proRow.go_live_window_ends_at))
        : NaN;
      if (!Number.isFinite(ends) || ends < Date.now()) {
        patch.go_live_window_ends_at = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString();
      }
    }
    if (proRow.status === "pending" || !proRow.status) {
      patch.status = "approved";
    }

    let { error: upErr } = await sb
      .from("repair_pro_profiles")
      .update(patch)
      .eq("user_id", userId);

    // Retry without location_updated_at if that column is missing
    if (
      upErr &&
      /location_updated_at|column/i.test(upErr.message) &&
      "location_updated_at" in patch
    ) {
      delete patch.location_updated_at;
      const retry = await sb
        .from("repair_pro_profiles")
        .update(patch)
        .eq("user_id", userId);
      upErr = retry.error;
    }

    if (upErr) return apiFail(upErr.message, 500);

    await sb
      .from("profiles")
      .update({ role: "repair_pro", updated_at: nowIso })
      .eq("id", userId);

    let updated: Record<string, unknown> | null = null;
    {
      const full = await sb
        .from("repair_pro_profiles")
        .select(PRO_SELECT_FULL)
        .eq("user_id", userId)
        .maybeSingle();
      if (full.error) {
        const base = await sb
          .from("repair_pro_profiles")
          .select(PRO_SELECT_BASE)
          .eq("user_id", userId)
          .maybeSingle();
        updated = base.data as Record<string, unknown> | null;
      } else {
        updated = full.data as Record<string, unknown> | null;
      }
    }

    return apiOk({
      pro: updated,
      online: true,
      coordinates:
        hasGps
          ? { lat, lng }
          : updated?.lat != null && updated?.lng != null
            ? { lat: Number(updated.lat), lng: Number(updated.lng) }
            : null,
      message: "You are Live. Customers within range can find you.",
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Live update failed", 500);
  }
}
