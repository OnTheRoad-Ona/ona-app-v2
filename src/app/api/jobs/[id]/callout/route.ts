import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import { getJob } from "@/lib/server/jobs/job-store";
import { getCalloutQuote } from "@/lib/server/callout/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only quote for a job party. Amounts are server-calculated.
 * Clients cannot POST a fee here (Phase 1).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (!isJobParty(auth.userId, job)) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    const quote = await getCalloutQuote(id);
    return apiOk({
      quote,
      labour: {
        proBaseMajor: job.proBaseMajor,
        agreedMajor: job.agreedMajor,
        currency: job.currency,
      },
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not load call-out",
      500
    );
  }
}
