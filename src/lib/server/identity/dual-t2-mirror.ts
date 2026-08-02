/**
 * Dual-role T2: once Care approves ID on Customer OR Repair Pro,
 * the other side is auto-approved (flags + media if empty).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type MotRow = {
  user_id: string;
  identity_review_status?: string | null;
  identity_verified_at?: string | null;
  nin_verified?: boolean | null;
  bvn_verified?: boolean | null;
  gov_id_kind?: string | null;
  gov_id_number?: string | null;
  gov_id_front_url?: string | null;
  gov_id_back_url?: string | null;
  nin_encrypted?: string | null;
  nin_last4?: string | null;
  bvn_encrypted?: string | null;
  bvn_last4?: string | null;
  bank_id_number?: string | null;
  gov_id_meta?: unknown;
  identity_country_iso?: string | null;
};

type ProRow = {
  user_id: string;
  gov_id_review_status?: string | null;
  gov_id_reviewed_at?: string | null;
  verified?: boolean | null;
  nin_verified?: boolean | null;
  bvn_verified?: boolean | null;
  gov_id_kind?: string | null;
  gov_id_number?: string | null;
  gov_id_front_url?: string | null;
  gov_id_back_url?: string | null;
  nin_encrypted?: string | null;
  nin_last4?: string | null;
  bvn_encrypted?: string | null;
  bvn_last4?: string | null;
  gov_id_meta?: unknown;
  tier2_approved_at?: string | null;
  status?: string | null;
  visibility_tier?: number | null;
};

function motApproved(m: MotRow | null | undefined): boolean {
  if (!m) return false;
  return (
    m.identity_review_status === "approved" ||
    Boolean(m.identity_verified_at) ||
    (Boolean(m.nin_verified) && Boolean(m.gov_id_front_url || m.gov_id_number))
  );
}

function proApproved(p: ProRow | null | undefined): boolean {
  if (!p) return false;
  return (
    p.gov_id_review_status === "approved" ||
    Boolean(p.verified) ||
    (Boolean(p.nin_verified) &&
      Boolean(p.gov_id_front_url || p.gov_id_number || p.tier2_approved_at))
  );
}

function pickStr(
  ...vals: (string | null | undefined)[]
): string | null {
  for (const v of vals) {
    if (v != null && String(v).trim()) return String(v);
  }
  return null;
}

/**
 * After either side is T2-approved, ensure the other side matches.
 * Safe to call repeatedly (idempotent).
 */
export async function mirrorDualRoleT2Approved(
  supabase: SupabaseClient,
  userId: string,
  opts?: { reviewedBy?: string | null; now?: string }
): Promise<{
  ok: boolean;
  dual: boolean;
  mirroredTo: "motorist" | "pro" | "both" | "none";
  error?: string;
}> {
  const now = opts?.now || new Date().toISOString();
  const reviewedBy = opts?.reviewedBy || null;

  const [{ data: mot }, { data: pro }] = await Promise.all([
    supabase
      .from("motorist_profiles")
      .select(
        "user_id, identity_review_status, identity_verified_at, nin_verified, bvn_verified, gov_id_kind, gov_id_number, gov_id_front_url, gov_id_back_url, nin_encrypted, nin_last4, bvn_encrypted, bvn_last4, bank_id_number, gov_id_meta, identity_country_iso"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("repair_pro_profiles")
      .select(
        "user_id, gov_id_review_status, gov_id_reviewed_at, verified, nin_verified, bvn_verified, gov_id_kind, gov_id_number, gov_id_front_url, gov_id_back_url, nin_encrypted, nin_last4, bvn_encrypted, bvn_last4, gov_id_meta, tier2_approved_at, status, visibility_tier"
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const m = mot as MotRow | null;
  const p = pro as ProRow | null;
  if (!m || !p) {
    return { ok: true, dual: false, mirroredTo: "none" };
  }

  const mOk = motApproved(m);
  const pOk = proApproved(p);
  if (!mOk && !pOk) {
    return { ok: true, dual: true, mirroredTo: "none" };
  }

  // Shared media / numbers — prefer non-empty from either side
  const kind = pickStr(m.gov_id_kind, p.gov_id_kind);
  const number = pickStr(m.gov_id_number, p.gov_id_number, m.nin_encrypted, p.nin_encrypted);
  const front = pickStr(m.gov_id_front_url, p.gov_id_front_url);
  const back = pickStr(m.gov_id_back_url, p.gov_id_back_url);
  const ninEnc = pickStr(m.nin_encrypted, p.nin_encrypted, number);
  const ninLast4 = pickStr(m.nin_last4, p.nin_last4);
  const bvnEnc = pickStr(m.bvn_encrypted, p.bvn_encrypted, m.bank_id_number);
  const bvnLast4 = pickStr(m.bvn_last4, p.bvn_last4);
  const meta = (m.gov_id_meta || p.gov_id_meta) as Record<string, unknown> | null;

  let mirroredTo: "motorist" | "pro" | "both" | "none" = "none";

  // Always re-assert approve flags on both (idempotent)
  const motPatch: Record<string, unknown> = {
    identity_review_status: "approved",
    identity_verified_at: m.identity_verified_at || now,
    identity_reviewed_at: now,
    identity_rejection_reason: null,
    nin_verified: true,
    bvn_verified: true,
    updated_at: now,
  };
  if (reviewedBy) motPatch.identity_reviewed_by = reviewedBy;
  if (!m.gov_id_kind && kind) motPatch.gov_id_kind = kind;
  if (!m.gov_id_number && number) motPatch.gov_id_number = number;
  if (!m.gov_id_front_url && front) motPatch.gov_id_front_url = front;
  if (!m.gov_id_back_url && back) motPatch.gov_id_back_url = back;
  if (!m.nin_encrypted && ninEnc) motPatch.nin_encrypted = ninEnc;
  if (!m.nin_last4 && ninLast4) motPatch.nin_last4 = ninLast4;
  if (!m.bvn_encrypted && bvnEnc) motPatch.bvn_encrypted = bvnEnc;
  if (!m.bvn_last4 && bvnLast4) motPatch.bvn_last4 = bvnLast4;
  if (!m.bank_id_number && bvnEnc) motPatch.bank_id_number = bvnEnc;
  if (!m.gov_id_meta && meta) motPatch.gov_id_meta = meta;

  const proPatch: Record<string, unknown> = {
    gov_id_review_status: "approved",
    gov_id_reviewed_at: p.gov_id_reviewed_at || now,
    nin_verified: true,
    bvn_verified: true,
    verified: true,
    tier2_approved_at: p.tier2_approved_at || now,
    rejection_reason: null,
    rejected_at: null,
    updated_at: now,
  };
  // Don't downgrade status if already approved/suspended
  if (p.status !== "suspended" && p.status !== "rejected") {
    if (p.status !== "approved") {
      proPatch.status = "approved";
      proPatch.approved_at = now;
    }
  }
  const vis = Number(p.visibility_tier);
  if (!Number.isFinite(vis) || vis < 2) {
    proPatch.visibility_tier = 2;
    proPatch.is_new_artisan = true;
  }
  if (!p.gov_id_kind && kind) proPatch.gov_id_kind = kind;
  if (!p.gov_id_number && number) proPatch.gov_id_number = number;
  if (!p.gov_id_front_url && front) proPatch.gov_id_front_url = front;
  if (!p.gov_id_back_url && back) proPatch.gov_id_back_url = back;
  if (!p.nin_encrypted && ninEnc) proPatch.nin_encrypted = ninEnc;
  if (!p.nin_last4 && ninLast4) proPatch.nin_last4 = ninLast4;
  if (!p.bvn_encrypted && bvnEnc) proPatch.bvn_encrypted = bvnEnc;
  if (!p.bvn_last4 && bvnLast4) proPatch.bvn_last4 = bvnLast4;
  if (!p.gov_id_meta && meta) proPatch.gov_id_meta = meta;

  const [motRes, proRes] = await Promise.all([
    supabase.from("motorist_profiles").update(motPatch).eq("user_id", userId),
    supabase.from("repair_pro_profiles").update(proPatch).eq("user_id", userId),
  ]);

  if (motRes.error && proRes.error) {
    return {
      ok: false,
      dual: true,
      mirroredTo: "none",
      error: motRes.error.message || proRes.error.message,
    };
  }

  if (!mOk && pOk) mirroredTo = "motorist";
  else if (mOk && !pOk) mirroredTo = "pro";
  else mirroredTo = "both";

  return { ok: true, dual: true, mirroredTo };
}

/**
 * One-shot backfill: all dual users with T2 approved on only one side.
 */
export async function backfillDualRoleT2Mirrors(
  supabase: SupabaseClient,
  opts?: { limit?: number }
): Promise<{ scanned: number; updated: number; errors: string[] }> {
  const limit = opts?.limit ?? 500;
  const errors: string[] = [];
  let updated = 0;

  const { data: mots } = await supabase
    .from("motorist_profiles")
    .select("user_id, identity_review_status, identity_verified_at")
    .or("identity_review_status.eq.approved,identity_verified_at.not.is.null")
    .limit(limit);

  const { data: pros } = await supabase
    .from("repair_pro_profiles")
    .select("user_id, gov_id_review_status, verified, tier2_approved_at")
    .or(
      "gov_id_review_status.eq.approved,verified.eq.true,tier2_approved_at.not.is.null"
    )
    .limit(limit);

  const ids = new Set<string>();
  for (const m of mots ?? []) ids.add(String(m.user_id));
  for (const p of pros ?? []) ids.add(String(p.user_id));

  for (const id of ids) {
    const res = await mirrorDualRoleT2Approved(supabase, id);
    if (!res.ok) {
      errors.push(`${id}: ${res.error || "fail"}`);
      continue;
    }
    if (res.mirroredTo !== "none") updated += 1;
  }

  return { scanned: ids.size, updated, errors };
}
