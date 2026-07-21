/**
 * Live motorist → Repair Pro reviews (Postgres `reviews` + pro rating_avg).
 */

import type { ProfileReview } from "@/lib/profile-system";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";

export type LiveReviewRow = {
  id: string;
  requestId: string;
  motoristId: string;
  repairProId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName: string;
};

function shortName(full: string | null | undefined, fallback = "Customer"): string {
  const n = (full || "").trim();
  if (!n) return fallback;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

function relativeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / (86400 * 7))}w ago`;
  return `${Math.floor(sec / (86400 * 30))} mo ago`;
}

export function toProfileReview(r: LiveReviewRow): ProfileReview {
  return {
    id: r.id,
    authorName: r.authorName,
    rating: r.rating,
    date: relativeAgo(r.createdAt),
    comment: (r.comment || "").trim() || "Rated without a written comment.",
  };
}

/** Insert review for a completed job and recompute pro rating_avg / rating_count. */
export async function publishProReview(input: {
  requestId: string;
  motoristId: string;
  repairProId: string;
  rating: number;
  comment?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase not configured" };
  }
  const rating = Math.min(5, Math.max(1, Math.round(input.rating)));
  const comment = (input.comment || "").trim().slice(0, 144) || null;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(input.requestId) || !uuidRe.test(input.motoristId) || !uuidRe.test(input.repairProId)) {
    return { ok: false, error: "Invalid review ids" };
  }

  try {
    const sb = createServiceSupabase();
    const { error: insErr } = await sb.from("reviews").upsert(
      {
        request_id: input.requestId,
        motorist_id: input.motoristId,
        repair_pro_id: input.repairProId,
        rating,
        comment,
      },
      { onConflict: "request_id" }
    );
    if (insErr) {
      console.error("publishProReview insert", insErr);
      return { ok: false, error: insErr.message };
    }

    // Recompute aggregate from all reviews for this pro
    const { data: rows, error: listErr } = await sb
      .from("reviews")
      .select("rating")
      .eq("repair_pro_id", input.repairProId);
    if (listErr) {
      console.error("publishProReview list", listErr);
      return { ok: false, error: listErr.message };
    }
    const list = rows || [];
    const count = list.length;
    const sum = list.reduce((s, r) => s + Number(r.rating || 0), 0);
    const avg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;

    const { error: upErr } = await sb
      .from("repair_pro_profiles")
      .update({
        rating_avg: avg,
        rating_count: count,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", input.repairProId);
    if (upErr) {
      console.error("publishProReview avg", upErr);
      return { ok: false, error: upErr.message };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Review publish failed",
    };
  }
}

/** Public list of reviews for a Repair Pro (motorists browse before offer). */
export async function listProReviews(
  repairProId: string,
  limit = 30
): Promise<LiveReviewRow[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(repairProId)) return [];

  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("reviews")
      .select("id, request_id, motorist_id, repair_pro_id, rating, comment, created_at")
      .eq("repair_pro_id", repairProId)
      .order("created_at", { ascending: false })
      .limit(Math.min(50, Math.max(1, limit)));
    if (error || !data?.length) return [];

    const motoristIds = [...new Set(data.map((r) => String(r.motorist_id)))];
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, full_name")
      .in("id", motoristIds);
    const nameById = new Map<string, string>();
    for (const p of profiles || []) {
      nameById.set(String(p.id), shortName(p.full_name as string | null));
    }

    return data.map((r) => ({
      id: String(r.id),
      requestId: String(r.request_id),
      motoristId: String(r.motorist_id),
      repairProId: String(r.repair_pro_id),
      rating: Number(r.rating) || 0,
      comment: r.comment != null ? String(r.comment) : null,
      createdAt: String(r.created_at),
      authorName: nameById.get(String(r.motorist_id)) || "Customer",
    }));
  } catch (e) {
    console.error("listProReviews", e);
    return [];
  }
}
