import { z } from "zod";
import {
  AdminAuthError,
  requireSensitiveAction,
  userAgent,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  executeCareAction,
  type CareAction,
} from "@/lib/server/modules/care-service";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import type { CarePermission } from "@/lib/server/modules/admin-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("freeze_user"),
    userId: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("unfreeze_user"),
    userId: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("release_escrow"),
    jobId: z.string().min(1),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("refund_escrow"),
    jobId: z.string().min(1),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal("resolve_dispute"),
    jobId: z.string().min(1),
    outcome: z.enum([
      "full_release_pro",
      "full_refund_motorist",
      "partial_split",
    ]),
    proPercent: z.number().min(0).max(100).optional(),
    note: z.string().optional(),
    kind: z.enum(["dispute", "appeal"]).optional(),
  }),
]);

function permFor(type: CareAction["type"]): CarePermission {
  switch (type) {
    case "freeze_user":
    case "unfreeze_user":
      return "user_freeze";
    case "release_escrow":
      return "escrow_release";
    case "refund_escrow":
      return "escrow_refund";
    case "resolve_dispute":
      return "dispute_resolve";
    default:
      return "view_jobs";
  }
}

/** One-click Customer Care actions (all password-gated) */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const body = schema.safeParse(await req.json());
    if (!body.success) return apiFail("Invalid action body", 400);

    const action = body.data as CareAction;
    const { session, ip } = await requireSensitiveAction(
      permFor(action.type),
      req
    );

    const result = await executeCareAction(action, {
      adminId: session.userId,
      ip,
      userAgent: userAgent(req),
    });

    if (!result.ok) return apiFail(result.error, 400);
    return apiOk({ message: result.message, data: result.data });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    console.error(e);
    return apiFail("Action failed", 500);
  }
}
