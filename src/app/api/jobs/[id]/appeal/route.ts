import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { openAppeal, resolveAppeal } from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openSchema = z.object({
  action: z.literal("open"),
  by: z.enum(["motorist", "repair_pro"]),
  reason: z.string().min(5).max(2000),
  media: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["photo", "voice", "other"]),
        url: z.string(),
        name: z.string().optional(),
        mime: z.string().optional(),
        durationSec: z.number().optional(),
        createdAt: z.string(),
        uploadedBy: z.string(),
      })
    )
    .optional(),
});

const resolveSchema = z.object({
  action: z.literal("resolve"),
  outcome: z.enum([
    "full_release_pro",
    "full_refund_motorist",
    "partial_split",
  ]),
  proPercent: z.number().min(0).max(100).optional(),
  note: z.string().optional(),
  adminId: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (body?.action === "resolve") {
      const parsed = resolveSchema.safeParse(body);
      if (!parsed.success) return apiFail("Invalid resolve payload", 400);
      const res = await resolveAppeal({
        jobId: id,
        outcome: parsed.data.outcome,
        proPercent: parsed.data.proPercent,
        note: parsed.data.note,
        adminId: parsed.data.adminId,
      });
      if ("error" in res) return apiFail(res.error, 400);
      return apiOk({ job: res.job });
    }
    const parsed = openSchema.safeParse(body);
    if (!parsed.success) return apiFail("Invalid appeal payload", 400);
    const res = await openAppeal({
      jobId: id,
      by: parsed.data.by,
      reason: parsed.data.reason,
      media: parsed.data.media,
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({ job: res.job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Appeal failed", 500);
  }
}
