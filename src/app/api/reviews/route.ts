import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  createReview,
  getProReviews,
} from "@/lib/server/reviews/review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { jobId, repairProId, rating, comment, photos } = body;

    if (!jobId || !repairProId || !rating) {
      return apiFail("jobId, repairProId, and rating are required", 400);
    }

    // Extract motoristId from auth or body
    const motoristId = body.motoristId || body.motorist_id;
    if (!motoristId) {
      return apiFail("motoristId is required", 400);
    }

    const result = await createReview({
      jobId,
      motoristId,
      repairProId,
      rating: Number(rating),
      comment: comment || undefined,
      photos: Array.isArray(photos) ? photos : undefined,
    });

    if (!result.ok) {
      return apiFail(result.error, 400);
    }

    return apiOk({ review: result.review });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not create review",
      500
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proId = searchParams.get("proId");
    if (!proId) return apiFail("proId is required", 400);

    const reviews = await getProReviews(proId);
    return apiOk({ reviews });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not fetch reviews",
      500
    );
  }
}
