import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  listDisputedJobs,
  resolveAppeal,
  resolveDispute,
} from "@/lib/server/jobs/job-store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    // Still allow memory-backed disputes in local/dev
  }
  try {
    await requireAdmin();
    const jobs = await listDisputedJobs();
    // Also surface recently resolved with disputes for appeal window visibility
    return apiOk({
      jobs,
      totals: {
        disputed: jobs.filter((j) => j.status === "disputed").length,
        underAppeal: jobs.filter((j) => j.status === "under_appeal").length,
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load disputes", 500);
  }
}

const patchSchema = z.object({
  jobId: z.string().min(1),
  kind: z.enum(["dispute", "appeal"]),
  outcome: z.enum([
    "full_release_pro",
    "full_refund_motorist",
    "partial_split",
  ]),
  proPercent: z.number().min(0).max(100).optional(),
  note: z.string().optional(),
});

export async function PATCH(req: Request) {
  try {
    const { session } = await requireAdmin();
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);
    const b = parsed.data;

    const res =
      b.kind === "appeal"
        ? await resolveAppeal({
            jobId: b.jobId,
            outcome: b.outcome,
            proPercent: b.proPercent,
            note: b.note,
            adminId: session.userId,
          })
        : await resolveDispute({
            jobId: b.jobId,
            outcome: b.outcome,
            proPercent: b.proPercent,
            note: b.note,
            adminId: session.userId,
          });

    if ("error" in res) return apiFail(res.error, 400);

    await logAdminAction(session.userId, `dispute_${b.kind}_resolve`, b.jobId, {
      outcome: b.outcome,
      proPercent: b.proPercent,
    });

    return apiOk({ job: res.job });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Resolve failed", 500);
  }
}
