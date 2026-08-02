import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { getJob, rateJob } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  rating: z.number().min(1).max(5),
  note: z.string().max(144).optional(),
  actor: z.enum(["motorist", "repair_pro"]).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid rating", 400);

    const note = parsed.data.note?.trim() || undefined;
    if (note && note.length > 144) {
      return apiFail("Review max 144 characters", 400);
    }

    // Motorist rates Repair Pro only — pros never rate
    if (parsed.data.actor === "repair_pro") {
      return apiFail(
        "Only the motorist can rate and review the Repair Pro",
        403
      );
    }

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (job.motoristId !== auth.userId) {
      return apiFail("Only the motorist on this job can rate", 403);
    }

    const res = await rateJob({
      jobId: id,
      rating: parsed.data.rating,
      note,
      actor: "motorist",
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({ job: res.job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Rate failed", 500);
  }
}
