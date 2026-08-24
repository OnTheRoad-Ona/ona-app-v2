/**
 * Ona Merit Ranking Engine (MRE).
 *
 * Pure scoring core + Supabase persistence for `merit_scores`.
 * See docs/SSPE_REFACTOR_PLAN.md §5 for design decisions:
 *  - Verified boosts but never gates (D4).
 *  - Distance is handled at query time, never stored here.
 *  - Recalculations are event-driven (completed job, rating, review,
 *    cancellation, dispute, availability, profile update), not per-dispatch.
 */

import { createServiceSupabase } from "@/lib/supabase/server";

/** Composite merit 0..100 with per-component sub-scores (mirrors merit_scores columns). */
export type MeritBreakdown = {
  score: number;
  verified_bonus: number;
  rating_score: number;
  jobs_completed_score: number;
  review_quality_score: number;
  completion_rate_score: number;
  dispute_rate_score: number;
  response_speed_score: number;
  reliability_score: number;
  availability_score: number;
  profile_completeness_score: number;
  recent_activity_score: number;
};

/** Raw inputs needed to score one pro. All optional; missing → neutral. */
export type MeritInput = {
  verified: boolean;
  faceLiveness?: boolean;
  inPerson?: boolean;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  completionRate: number; // 0..1 (1 = always completes)
  avgResponseMinutes: number | null;
  disputesCount: number;
  disputesWon: number;
  cancellationsCount: number;
  isOnline: boolean;
  locationUpdatedAt?: string | null;
  isNewArtisan?: boolean;
  visibilityTier?: number | null;
  /** profile-completeness flags */
  hasBio: boolean;
  hasSkills: boolean;
  hasVehicleFocus: boolean;
  hasLabourPrices: boolean;
  hasGovId: boolean;
  hasBusinessName: boolean;
  guarantorCount: number;
  /** ISO of the pro's most recent completed job (recent_activity) */
  lastJobAt?: string | null;
};

/**
 * Sub-score weights (sum = 1.0). Kept next to the code so tuning is explicit.
 * Verified bonus and new-artisan penalty are applied on top and never gate.
 */
const WEIGHTS = {
  rating: 0.18,
  jobs_completed: 0.12,
  review_quality: 0.07,
  completion_rate: 0.15,
  dispute_rate: 0.1,
  response_speed: 0.12,
  reliability: 0.07,
  availability: 0.08,
  profile_completeness: 0.06,
  recent_activity: 0.05,
} as const;

const VERIFIED_BONUS_PTS = 8;
const NEW_ARTISAN_PENALTY_PTS = 8;

const clamp = (v: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));

function countWeight(ratingCount: number): number {
  // Need ≥ 5 ratings to trust the average fully; scale linearly below that.
  return clamp(ratingCount / 5);
}

function ratingQuality(ratingAvg: number): number {
  return clamp(ratingAvg / 5);
}

function disputeRateScore(input: MeritInput): number {
  const jobs = Math.max(0, input.jobsCompleted);
  const disputes = Math.max(0, input.disputesCount);
  if (jobs + disputes <= 0) {
    // No history: slightly favour verified pros, else neutral.
    return input.verified ? 0.8 : 0.5;
  }
  const clean = 1 - disputes / (jobs + disputes);
  const wonBonus = clamp(input.disputesWon) * 0.05;
  return clamp(clean + wonBonus);
}

function responseSpeedScore(minutes: number | null): number {
  if (minutes == null || !Number.isFinite(minutes)) return 0.5; // neutral
  if (minutes <= 0) return 1;
  return clamp(1 / (1 + minutes / 10));
}

function reliabilityScore(input: MeritInput): number {
  const completion = clamp(input.completionRate);
  const cancelAvoidance = clamp(
    1 - Math.min(Math.max(0, input.cancellationsCount), 20) / 20,
  );
  return (completion + cancelAvoidance) / 2;
}

function availabilityScore(input: MeritInput): number {
  if (!input.isOnline) return 0.2;
  const fresh = input.locationUpdatedAt
    ? Date.now() - new Date(input.locationUpdatedAt).getTime() <= 5 * 60 * 1000
    : false;
  return fresh ? 1 : 0.7;
}

function profileCompletenessScore(input: MeritInput): number {
  const flags = [
    input.hasBio,
    input.hasSkills,
    input.hasVehicleFocus,
    input.hasLabourPrices,
    input.hasGovId,
    input.hasBusinessName,
    input.guarantorCount > 0,
  ];
  const present = flags.filter(Boolean).length;
  return clamp(present / flags.length);
}

function recentActivityScore(input: MeritInput): number {
  const refs = [input.lastJobAt, input.locationUpdatedAt]
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
    .filter((t) => Number.isFinite(t));
  const latest = refs.length ? Math.max(...refs) : 0;
  const ageMs = Date.now() - latest;
  let base: number;
  if (!latest) base = 0.2;
  else if (ageMs <= 5 * 60 * 1000) base = 1;
  else if (ageMs <= 24 * 60 * 60 * 1000) base = 0.8;
  else if (ageMs <= 7 * 24 * 60 * 60 * 1000) base = 0.5;
  else base = 0.2;
  const tier = Number(input.visibilityTier);
  if (Number.isFinite(tier) && tier >= 3) base += 0.1;
  return clamp(base);
}

export function computeMeritScore(input: MeritInput): MeritBreakdown {
  const rating =
    ratingQuality(input.ratingAvg) * countWeight(input.ratingCount);
  const jobs = clamp(Math.min(Math.max(0, input.jobsCompleted), 60) / 60);
  const reviewQuality =
    ratingQuality(input.ratingAvg) * countWeight(input.ratingCount);
  const completion = clamp(input.completionRate);
  const dispute = disputeRateScore(input);
  const response = responseSpeedScore(input.avgResponseMinutes);
  const reliability = reliabilityScore(input);
  const availability = availabilityScore(input);
  const profile = profileCompletenessScore(input);
  const recent = recentActivityScore(input);

  const weighted =
    rating * WEIGHTS.rating +
    jobs * WEIGHTS.jobs_completed +
    reviewQuality * WEIGHTS.review_quality +
    completion * WEIGHTS.completion_rate +
    dispute * WEIGHTS.dispute_rate +
    response * WEIGHTS.response_speed +
    reliability * WEIGHTS.reliability +
    availability * WEIGHTS.availability +
    profile * WEIGHTS.profile_completeness +
    recent * WEIGHTS.recent_activity;

  const verified = Boolean(
    input.verified || input.faceLiveness || input.inPerson,
  );
  const verifiedBonus = verified ? VERIFIED_BONUS_PTS : 0;
  const newArtisanPenalty = input.isNewArtisan ? NEW_ARTISAN_PENALTY_PTS : 0;
  const score = Math.max(
    0,
    Math.min(100, weighted * 100 + verifiedBonus - newArtisanPenalty),
  );

  return {
    score: Math.round(score * 1000) / 1000,
    verified_bonus: verifiedBonus,
    rating_score: Math.round(rating * 1000) / 1000,
    jobs_completed_score: Math.round(jobs * 1000) / 1000,
    review_quality_score: Math.round(reviewQuality * 1000) / 1000,
    completion_rate_score: Math.round(completion * 1000) / 1000,
    dispute_rate_score: Math.round(dispute * 1000) / 1000,
    response_speed_score: Math.round(response * 1000) / 1000,
    reliability_score: Math.round(reliability * 1000) / 1000,
    availability_score: Math.round(availability * 1000) / 1000,
    profile_completeness_score: Math.round(profile * 1000) / 1000,
    recent_activity_score: Math.round(recent * 1000) / 1000,
  };
}

// ── Persistence ────────────────────────────────────────────────────────────

/** Minimal columns required to build a MeritInput from repair_pro_profiles. */
const PRO_MERIT_COLUMNS = [
  "user_id",
  "business_name",
  "verified",
  "nin_verified",
  "bvn_verified",
  "face_liveness_verified",
  "in_person_verified",
  "rating_avg",
  "rating_count",
  "jobs_completed",
  "completion_rate",
  "avg_response_minutes",
  "is_online",
  "location_updated_at",
  "is_new_artisan",
  "visibility_tier",
  "bio",
  "skills",
  "vehicle_focus",
  "labour_prices",
  "disputes_count",
  "disputes_won",
  "cancellations_count",
].join(",");

type ProMeritRow = {
  user_id: string;
  business_name: string | null;
  verified: boolean | null;
  nin_verified: boolean | null;
  bvn_verified: boolean | null;
  face_liveness_verified?: boolean | null;
  in_person_verified?: boolean | null;
  rating_avg: number | null;
  rating_count: number | null;
  jobs_completed: number | null;
  completion_rate: number | null;
  avg_response_minutes: number | null;
  is_online: boolean | null;
  location_updated_at?: string | null;
  is_new_artisan?: boolean | null;
  visibility_tier?: number | null;
  bio: string | null;
  skills: unknown;
  vehicle_focus: unknown;
  labour_prices: unknown;
  disputes_count?: number | null;
  disputes_won?: number | null;
  cancellations_count?: number | null;
};

async function buildMeritInput(
  supabase: ReturnType<typeof createServiceSupabase>,
  pro: ProMeritRow,
): Promise<MeritInput> {
  const skills = Array.isArray(pro.skills) ? pro.skills : [];
  const vehicleFocus = pro.vehicle_focus
    ? Object.keys(pro.vehicle_focus as Record<string, unknown>).length > 0
    : false;
  const labourPrices = pro.labour_prices
    ? Object.keys(pro.labour_prices as Record<string, unknown>).length > 0
    : false;

  const [{ count: guarantorCount }, { data: lastJob }] = await Promise.all([
    supabase
      .from("repair_pro_guarantors")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", pro.user_id),
    supabase
      .from("service_requests")
      .select("released_at")
      .eq("repair_pro_id", pro.user_id)
      .in("flow_status", ["released", "satisfied"])
      .order("released_at", { ascending: false })
      .limit(1),
  ]);

  return {
    verified: Boolean(pro.verified),
    faceLiveness: Boolean(pro.face_liveness_verified),
    inPerson: Boolean(pro.in_person_verified),
    ratingAvg: Number(pro.rating_avg) || 0,
    ratingCount: Number(pro.rating_count) || 0,
    jobsCompleted: Number(pro.jobs_completed) || 0,
    completionRate: Number(pro.completion_rate) || 0,
    avgResponseMinutes:
      pro.avg_response_minutes != null &&
      Number.isFinite(Number(pro.avg_response_minutes))
        ? Number(pro.avg_response_minutes)
        : null,
    disputesCount: Number(pro.disputes_count) || 0,
    disputesWon: Number(pro.disputes_won) || 0,
    cancellationsCount: Number(pro.cancellations_count) || 0,
    isOnline: Boolean(pro.is_online),
    locationUpdatedAt: pro.location_updated_at ?? null,
    isNewArtisan: Boolean(pro.is_new_artisan),
    visibilityTier: Number.isFinite(Number(pro.visibility_tier))
      ? Number(pro.visibility_tier)
      : null,
    hasBio: Boolean((pro.bio || "").trim()),
    hasSkills: skills.length > 0,
    hasVehicleFocus: vehicleFocus,
    hasLabourPrices: labourPrices,
    hasGovId: Boolean(pro.nin_verified || pro.bvn_verified),
    hasBusinessName: Boolean((pro.business_name || "").trim()),
    guarantorCount: Number(guarantorCount) || 0,
    lastJobAt: (lastJob?.[0]?.released_at as string | null) ?? null,
  };
}

/** Compute + upsert a single pro's merit score. Fire-and-forget friendly. */
export async function recalculateMerit(proId: string): Promise<void> {
  try {
    const supabase = createServiceSupabase();
    const { data: row } = await supabase
      .from("repair_pro_profiles")
      .select(PRO_MERIT_COLUMNS)
      .eq("user_id", proId)
      .maybeSingle();
    if (!row) return;
    const input = await buildMeritInput(
      supabase,
      row as unknown as ProMeritRow,
    );
    const breakdown = computeMeritScore(input);
    await supabase.from("merit_scores").upsert(
      {
        pro_id: proId,
        ...breakdown,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pro_id" },
    );
  } catch (e) {
    console.error("recalculateMerit failed for", proId, e);
  }
}

/** Recompute many pros (batched, never blocks critical paths). */
export async function recalculateMeritMany(proIds: string[]): Promise<void> {
  await Promise.all(proIds.map((id) => recalculateMerit(id)));
}

/** Backfill all approved pros that lack a merit row (idempotent). */
export async function backfillAllMeritScores(): Promise<{ count: number }> {
  const supabase = createServiceSupabase();
  const { data: rows } = await supabase
    .from("repair_pro_profiles")
    .select("user_id")
    .neq("status", "rejected")
    .limit(2000);
  const ids = (rows ?? []).map((r) => r.user_id as string);
  await recalculateMeritMany(ids);
  return { count: ids.length };
}

/** Map pro_id → current merit score (0..100). Missing rows default to a neutral 0. */
export async function getMeritScoresForPros(
  proIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!proIds.length) return map;
  const supabase = createServiceSupabase();
  const { data: rows } = await supabase
    .from("merit_scores")
    .select("pro_id, score")
    .in("pro_id", proIds);
  for (const r of rows ?? []) {
    map.set(String(r.pro_id), Number(r.score) || 0);
  }
  return map;
}

type DispatchRank = {
  score: number;
  rating: number;
  speed: number;
};

async function getDispatchRankForPros(
  proIds: string[],
): Promise<Map<string, DispatchRank>> {
  const map = new Map<string, DispatchRank>();
  if (!proIds.length) return map;
  const supabase = createServiceSupabase();
  const { data: rows } = await supabase
    .from("merit_scores")
    .select("pro_id, score, rating_score, response_speed_score")
    .in("pro_id", proIds);
  for (const r of rows ?? []) {
    map.set(String(r.pro_id), {
      score: Number(r.score) || 0,
      rating: Number(r.rating_score) || 0,
      speed: Number(r.response_speed_score) || 0,
    });
  }
  return map;
}

/**
 * Best job first: highest rating, then fastest reply, then closer.
 * Used by SSPE dispatch and /api/pros?sort=merit.
 */
export async function orderCandidatesByMerit<T extends { user_id: string }>(
  candidates: T[],
  distanceKm: (pro: T) => number,
): Promise<T[]> {
  if (candidates.length <= 1) return candidates;
  const ranks = await getDispatchRankForPros(candidates.map((p) => p.user_id));
  return [...candidates].sort((a, b) => {
    const ra = ranks.get(a.user_id);
    const rb = ranks.get(b.user_id);
    const ratingDiff = (rb?.rating ?? 0) - (ra?.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    const speedDiff = (rb?.speed ?? 0) - (ra?.speed ?? 0);
    if (speedDiff !== 0) return speedDiff;
    return distanceKm(a) - distanceKm(b);
  });
}
