import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { getJob } from "@/lib/server/jobs/job-store";
import {
  ProReview,
  ProReviewStats,
  MIN_REVIEWS_FOR_RATING,
} from "@/lib/reviews/types";

export type CreateReviewInput = {
  jobId: string;
  motoristId: string;
  repairProId: string;
  rating: number;
  comment?: string;
  photos?: string[];
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rowToReview(row: Record<string, unknown>): ProReview {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    motoristId: String(row.motorist_id),
    repairProId: String(row.repair_pro_id),
    rating: Number(row.rating),
    comment: row.comment ? String(row.comment) : null,
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    createdAt: String(row.created_at),
  };
}

export async function createReview(
  input: CreateReviewInput
): Promise<{ ok: true; review: ProReview } | { ok: false; error: string }> {
  if (input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "Rating must be between 1 and 5" };
  }

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Database not configured" };
  }

  const sb = createServiceSupabase();

  // Verify job exists and is completed/released
  const job = await getJob(input.jobId);
  if (!job) return { ok: false, error: "Job not found" };
  if (job.motoristId !== input.motoristId) {
    return { ok: false, error: "Only the customer can review this job" };
  }
  if (job.repairProId !== input.repairProId) {
    return { ok: false, error: "Pro mismatch" };
  }
  if (job.status !== "released" && job.status !== "satisfied") {
    return { ok: false, error: "Job must be completed and released before reviewing" };
  }

  // Check for duplicate review
  const { data: existing } = await sb
    .from("pro_reviews")
    .select("id")
    .eq("job_id", input.jobId)
    .eq("motorist_id", input.motoristId)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "You have already reviewed this job" };
  }

  const ts = new Date().toISOString();
  const { data, error } = await sb
    .from("pro_reviews")
    .insert({
      job_id: input.jobId,
      motorist_id: input.motoristId,
      repair_pro_id: input.repairProId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
      photos: input.photos || [],
      created_at: ts,
      updated_at: ts,
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "Could not create review" };
  }

  return { ok: true, review: rowToReview(data as Record<string, unknown>) };
}

export async function getProReviews(
  proId: string
): Promise<ProReview[]> {
  if (!isSupabaseAdminConfigured()) return [];

  const sb = createServiceSupabase();
  const { data } = await sb
    .from("pro_reviews")
    .select("*, profiles:profiles!motorist_id(full_name)")
    .eq("repair_pro_id", proId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!data) return [];

  return data.map((row: Record<string, unknown>) => {
    const review = rowToReview(row);
    const profile = row.profiles as { full_name?: string } | undefined;
    return {
      ...review,
      motoristName: profile?.full_name || "Customer",
    };
  });
}

export async function getProReviewStats(
  proId: string
): Promise<ProReviewStats> {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  if (!isSupabaseAdminConfigured()) {
    return { median: null, count: 0, distribution: dist, minReviews: MIN_REVIEWS_FOR_RATING };
  }

  const sb = createServiceSupabase();
  const { data } = await sb
    .from("pro_reviews")
    .select("rating")
    .eq("repair_pro_id", proId);

  if (!data?.length) {
    return { median: null, count: 0, distribution: dist, minReviews: MIN_REVIEWS_FOR_RATING };
  }

  const ratings = data.map((r: { rating: number }) => r.rating);
  for (const r of ratings) {
    dist[r] = (dist[r] || 0) + 1;
  }

  return {
    median: data.length >= MIN_REVIEWS_FOR_RATING ? median(ratings) : null,
    count: data.length,
    distribution: dist,
    minReviews: MIN_REVIEWS_FOR_RATING,
  };
}

export async function listAllReviews(
  limit = 100
): Promise<ProReview[]> {
  if (!isSupabaseAdminConfigured()) return [];

  const sb = createServiceSupabase();
  const { data } = await sb
    .from("pro_reviews")
    .select("*, motorist_profile:profiles!motorist_id(full_name), pro_profile:repair_pro_profiles!repair_pro_id(business_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((row: Record<string, unknown>) => {
    const review = rowToReview(row);
    const motoristProfile = row.motorist_profile as { full_name?: string } | undefined;
    const proProfile = row.pro_profile as { business_name?: string } | undefined;
    return {
      ...review,
      motoristName: motoristProfile?.full_name || "Customer",
      repairProName: proProfile?.business_name || "Pro",
    } as ProReview & { repairProName?: string };
  });
}
