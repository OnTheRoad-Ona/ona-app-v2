import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  createReview,
  getProReviews,
} from "@/lib/server/reviews/review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { jobId, repairProId, rating, comment, photos } = body;

    if (!jobId || !repairProId || !rating) {
      return apiFail("jobId, repairProId, and rating are required", 400);
    }

    // Motorist id always from session — ignore spoofed body motoristId
    const motoristId = auth.userId;
    if (body.motoristId && body.motoristId !== auth.userId) {
      return apiFail("Forbidden", 403, "forbidden");
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

/** Public: list reviews for a pro (marketplace). Write path is auth'd. */
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
