import { apiFail, apiOk } from "@/lib/server/api-json";
import { getProReviewStats } from "@/lib/server/reviews/review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proId = searchParams.get("proId");
    if (!proId) return apiFail("proId is required", 400);

    const stats = await getProReviewStats(proId);
    return apiOk({ stats });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not fetch review stats",
      500,
    );
  }
}
