import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isJobParty, requireUser } from "@/lib/server/auth-utils";
import {
  AdminAuthError,
  requireAdmin,
} from "@/lib/server/admin-auth";
import {
  getJob,
  openAppeal,
  resolveAppeal,
} from "@/lib/server/jobs/job-store";

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
      let adminUserId: string;
      try {
        const { session } = await requireAdmin();
        adminUserId = session.userId;
      } catch (e) {
        if (e instanceof AdminAuthError) {
          return apiFail(e.message, e.status, "auth");
        }
        return apiFail("Admin access required to resolve appeals", 403);
      }
      const parsed = resolveSchema.safeParse(body);
      if (!parsed.success) return apiFail("Invalid resolve payload", 400);
      const res = await resolveAppeal({
        jobId: id,
        outcome: parsed.data.outcome,
        proPercent: parsed.data.proPercent,
        note: parsed.data.note,
        adminId: adminUserId,
      });
      if ("error" in res) return apiFail(res.error, 400);
      return apiOk({ job: res.job });
    }

    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = openSchema.safeParse(body);
    if (!parsed.success) return apiFail("Invalid appeal payload", 400);

    const job = await getJob(id);
    if (!job) return apiFail("Job not found", 404);
    if (!isJobParty(auth.userId, job)) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    const by =
      auth.userId === job.motoristId
        ? ("motorist" as const)
        : ("repair_pro" as const);
    if (parsed.data.by !== by) {
      return apiFail("by does not match your role on this job", 403);
    }

    const res = await openAppeal({
      jobId: id,
      by,
      reason: parsed.data.reason,
      media: parsed.data.media,
    });
    if ("error" in res) return apiFail(res.error, 400);
    return apiOk({ job: res.job });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Appeal failed", 500);
  }
}
