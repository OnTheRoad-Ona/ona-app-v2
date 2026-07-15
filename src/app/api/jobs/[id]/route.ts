import { apiFail, apiOk } from "@/lib/server/api-json";
import { getJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    return apiOk({ job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
