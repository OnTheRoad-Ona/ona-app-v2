/**
 * Apply automatic Repair Pro search-visibility ladder after verification events.
 * Care never sets visibility_tier manually — only approve T2 / T4 (and pro completes liveness + BVN).
 */

import {
  autoVisibilityFromProRow,
  visibilityPromotionPatch,
  type VisibilityTier,
} from "@/lib/artisan/visibility-tiers";
import type { createServiceSupabase } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceSupabase>;

export async function recomputeProVisibility(
  supabase: ServiceClient,
  userId: string,
  opts?: { now?: string; preserveTier2ApprovedAt?: boolean }
): Promise<{ tier: VisibilityTier; changed: boolean }> {
  const now = opts?.now || new Date().toISOString();
  const { data: pro, error } = await supabase
    .from("repair_pro_profiles")
    .select(
      "visibility_tier, gov_id_review_status, verified, nin_verified, bvn_verified, face_liveness_verified, liveness_passed_at, docs_status, tier2_approved_at, tier3_approved_at, tier4_approved_at, go_live_window_ends_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !pro) {
    return { tier: 1, changed: false };
  }

  const next = autoVisibilityFromProRow(pro);
  const prev = Number(pro.visibility_tier) || 1;
  if (next === prev) {
    return { tier: next, changed: false };
  }

  const patch = visibilityPromotionPatch(next, now);
  // Don't clobber historical approval timestamps
  if (pro.tier2_approved_at) patch.tier2_approved_at = pro.tier2_approved_at;
  if (pro.tier3_approved_at && next >= 3)
    patch.tier3_approved_at = pro.tier3_approved_at;
  if (pro.tier4_approved_at && next >= 4)
    patch.tier4_approved_at = pro.tier4_approved_at;
  // T2 go-live window only while still on T2
  if (next === 2 && !pro.go_live_window_ends_at) {
    const ends = new Date(now);
    ends.setUTCDate(ends.getUTCDate() + 30);
    patch.go_live_window_ends_at = ends.toISOString();
  }
  if (next >= 3) {
    patch.go_live_window_ends_at = null;
  }

  await supabase.from("repair_pro_profiles").update(patch).eq("user_id", userId);
  return { tier: next, changed: true };
}
