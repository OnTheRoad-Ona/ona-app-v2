import { apiFail, apiOk } from "@/lib/server/api-json";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { listAllReviews } from "@/lib/server/reviews/review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const reviews = await listAllReviews(200);
    return apiOk({ reviews });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail(
      e instanceof Error ? e.message : "Could not list reviews",
      500,
    );
  }
}
