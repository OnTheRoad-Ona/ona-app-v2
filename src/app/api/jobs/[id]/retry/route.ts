import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import { retrySearch } from "@/lib/server/pairing/pairing-engine";
import { getJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (!isJobParty(auth.userId, job)) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    // Only the motorist can re-run their own search.
    if (job.motoristId !== auth.userId) {
      return apiFail("Only the customer can retry this search", 403);
    }

    const result = await retrySearch(id);
    if (!result.ok) {
      return apiFail(
        result.error || "Could not retry search",
        result.status || 500
      );
    }

    const fresh = await getJob(id);
    return apiOk({ job: fresh ?? job, serverNow: new Date().toISOString() });
  } catch (e) {
    console.error("[retry]", id, e);
    return apiFail(e instanceof Error ? e.message : "Retry failed", 500);
  }
}