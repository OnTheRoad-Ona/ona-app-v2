import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { rateJob } from "@/lib/server/jobs/job-store";

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
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid rating", 400);

    const note = parsed.data.note?.trim() || undefined;
    if (note && note.length > 144) {
      return apiFail("Review max 144 characters", 400);
    }

    const res = await rateJob({
      jobId: id,
      rating: parsed.data.rating,
      note,
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({ job: res.job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Rate failed", 500);
  }
}
