import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import { getJob } from "@/lib/server/jobs/job-store";
import {
  addJobRecommendation,
  listJobRecommendations,
  removeJobRecommendation,
  searchShopForJob,
} from "@/lib/server/shop/job-recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function loadParty(req: Request, jobId: string) {
  const auth = await requireUser(req);
  if (!auth.ok) return { error: auth.response };
  const job = await getJob(jobId);
  if (!job) return { error: apiFail("Job not found", 404) };
  if (!isJobParty(auth.userId, job)) {
    return { error: apiFail("Forbidden", 403, "forbidden") };
  }
  return { auth, job };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const loaded = await loadParty(req, id);
    if ("error" in loaded && loaded.error) return loaded.error;
    const q = req.nextUrl.searchParams.get("q");
    if (q != null) {
      const results = await searchShopForJob(q);
      return apiOk({ results, jobId: id });
    }
    const items = await listJobRecommendations(id);
    return apiOk({ recommendations: items, jobId: id });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const loaded = await loadParty(req, id);
    if ("error" in loaded && loaded.error) return loaded.error;
    if (loaded.job.repairProId !== loaded.auth.userId) {
      return apiFail("Only the Repair Pro on this job can recommend parts", 403);
    }
    const body = (await req.json()) as { productId?: string; note?: string };
    if (!body.productId) return apiFail("productId required", 400);
    const rec = await addJobRecommendation({
      jobId: id,
      productId: body.productId,
      recommendedBy: loaded.auth.userId,
      note: body.note ?? null,
    });
    return apiOk({ recommendation: rec }, { status: 201 });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const loaded = await loadParty(req, id);
    if ("error" in loaded && loaded.error) return loaded.error;
    if (loaded.job.repairProId !== loaded.auth.userId) {
      return apiFail("Only the Repair Pro on this job can remove parts", 403);
    }
    const recId = req.nextUrl.searchParams.get("recommendationId");
    if (!recId) return apiFail("recommendationId required", 400);
    await removeJobRecommendation({
      id: recId,
      jobId: id,
      actorId: loaded.auth.userId,
    });
    return apiOk({ removed: true });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
