import { apiFail, apiOk } from "@/lib/server/api-json";
import { deferJob, getJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const proId: string | undefined = body.proId;
    if (!proId) return apiFail("Missing proId", 400);

    await deferJob(id, proId);
    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    return apiOk({ job });
  } catch (e) {
    console.error("[defer]", id, e);
    return apiFail(e instanceof Error ? e.message : "Defer failed", 500);
  }
}
