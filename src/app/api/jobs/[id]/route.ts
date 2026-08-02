import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import { getJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return apiOk({ job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
