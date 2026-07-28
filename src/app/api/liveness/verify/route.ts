/**
 * Report face-liveness result to the backend (no media/frames).
 * Used by Tier 3 liveness so admin/care can see verified_at status.
 */

import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { writePlatformAudit } from "@/lib/server/modules/platform-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().uuid().optional(),
  passed: z.boolean(),
  challenges: z.array(z.string()).max(12).optional(),
  durationMs: z.number().min(0).max(120_000).optional(),
  clientScore: z.number().min(0).max(1).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiFail("Invalid body", 400, "invalid_body");
  }
  const b = parsed.data;

  if (!b.passed) {
    return apiOk({
      recorded: false,
      reason: "fail_not_persisted",
      message: "Only successful liveness is stored on the profile",
    });
  }

  if (!isSupabaseAdminConfigured()) {
    return apiOk({
      recorded: false,
      reason: "no_db",
      message: "Database not configured — client keeps local pass",
    });
  }

  if (!b.userId) {
    return apiOk({
      recorded: false,
      reason: "no_user",
      message: "Sign in required to report liveness to server",
    });
  }

  const supabase = createServiceSupabase();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("repair_pro_profiles")
    .select("user_id")
    .eq("user_id", b.userId)
    .maybeSingle();

  if (!existing) {
    // Not a pro profile — still accept report without failing the client UX
    return apiOk({
      recorded: false,
      reason: "not_pro",
      message: "No repair pro profile for user",
    });
  }

  const { error } = await supabase
    .from("repair_pro_profiles")
    .update({
      face_liveness_verified: true,
      face_liveness_at: now,
      liveness_passed_at: now,
      updated_at: now,
    })
    .eq("user_id", b.userId);

  if (error) {
    console.error("[liveness/verify]", error.message);
    return apiFail(error.message, 500, "db_error");
  }

  try {
    const { recomputeProVisibility } = await import(
      "@/lib/server/pro-visibility"
    );
    await recomputeProVisibility(supabase, b.userId);
  } catch {
    /* non-fatal */
  }

  await writePlatformAudit({
    actorId: b.userId,
    actorRole: "repair_pro",
    action: "pro.liveness.passed",
    targetType: "repair_pro_profiles",
    targetId: b.userId,
    newValue: {
      challenges: b.challenges ?? [],
      durationMs: b.durationMs ?? null,
      clientScore: b.clientScore ?? null,
    },
  }).catch(() => undefined);

  return apiOk({
    recorded: true,
    faceLivenessVerified: true,
    verifiedAt: now,
  });
}
