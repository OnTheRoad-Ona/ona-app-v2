import { apiFail, apiOk } from "@/lib/server/api-json";
import { listAllReviews } from "@/lib/server/reviews/review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reviews = await listAllReviews(200);
    return apiOk({ reviews });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not list reviews",
      500
    );
  }
}
