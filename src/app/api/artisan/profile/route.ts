/**
 * Repair Pro pipeline + profile — Supabase-backed (Phase B).
 * Client may still mirror local draft; DB is source of truth when configured.
 */

import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  canTransitionPipeline,
  type ProPipelineStatus,
} from "@/lib/server/modules/pros/pipeline";
import { writePlatformAudit } from "@/lib/server/modules/platform-audit";
import { getUserFromRequest, requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  userId: z.string().uuid(),
  businessName: z.string().optional(),
  bio: z.string().optional(),
  yearsExperience: z.union([z.string(), z.number()]).optional(),
  serviceRadiusKm: z.number().optional(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  pipelineStatus: z.string().optional(),
  guarantor: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.unknown()).optional(),
  portfolio: z.array(z.unknown()).optional(),
  govIdMeta: z.record(z.string(), z.unknown()).optional(),
  skillProof: z.record(z.string(), z.unknown()).optional().nullable(),
  livenessPassedAt: z.string().optional().nullable(),
  pipelineNotes: z.string().optional(),
  bankName: z.string().optional(),
  bankCode: z.string().optional(),
});

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return apiFail("userId required", 400);
  if (userId !== auth.userId) {
    return apiFail("Forbidden", 403, "forbidden");
  }

  if (!isSupabaseAdminConfigured()) {
    return apiOk({
      source: "client_local_store",
      message: "Supabase not configured — use local draft",
      userId,
    });
  }

  const supabase = createServiceSupabase();
  const [{ data: profile }, { data: pro }, { data: motorist }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, email, avatar_url, role")
        .eq("id", auth.userId)
        .maybeSingle(),
      supabase
        .from("repair_pro_profiles")
        .select("*")
        .eq("user_id", auth.userId)
        .maybeSingle(),
      // Dual-role: Care may approve Customer T2 on motorist_profiles
      supabase
        .from("motorist_profiles")
        .select(
          "identity_review_status, identity_verified_at, gov_id_kind, phone_verified, nin_verified, bvn_verified"
        )
        .eq("user_id", auth.userId)
        .maybeSingle(),
    ]);

  // Never expose encrypted bank/NIN fields on this self-profile endpoint
  // if they are present as raw secrets — strip known sensitive keys for safety.
  let safePro = pro as Record<string, unknown> | null;
  if (safePro) {
    const {
      nin_encrypted: _n,
      bvn_encrypted: _b,
      bank_account_encrypted: _ba,
      gov_id_number: _g,
      ...rest
    } = safePro;
    safePro = rest;
  }

  const mot = motorist as {
    identity_review_status?: string | null;
    identity_verified_at?: string | null;
    gov_id_kind?: string | null;
    phone_verified?: boolean | null;
    nin_verified?: boolean | null;
    bvn_verified?: boolean | null;
  } | null;

  return apiOk({
    source: "supabase",
    profile,
    pro: safePro,
    /** Safe motorist identity flags for dual-role Care approval sync */
    motorist: mot
      ? {
          identity_review_status: mot.identity_review_status ?? null,
          identity_verified_at: mot.identity_verified_at ?? null,
          gov_id_kind: mot.gov_id_kind ?? null,
          phone_verified: Boolean(mot.phone_verified),
          nin_verified: Boolean(mot.nin_verified),
          bvn_verified: Boolean(mot.bvn_verified),
        }
      : null,
  });
}

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiOk({
      source: "client_local_store",
      message: "Supabase not configured — client keeps local draft",
    });
  }

  const user = await getUserFromRequest(req);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");
  const b = parsed.data;
  if (!user || user.id !== b.userId) {
    return apiFail("Unauthorized", 403);
  }
  const supabase = createServiceSupabase();

  const { data: existing } = await supabase
    .from("repair_pro_profiles")
    .select("pipeline_status")
    .eq("user_id", b.userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("repair_pro_profiles").upsert({
      user_id: b.userId,
      primary_service: "mechanic",
      pipeline_status: "draft",
    });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (b.businessName !== undefined) patch.business_name = b.businessName;
  if (b.bio !== undefined) patch.bio = b.bio;
  if (b.yearsExperience !== undefined)
    patch.years_experience = String(b.yearsExperience);
  if (b.serviceRadiusKm !== undefined)
    patch.service_radius_km = b.serviceRadiusKm;
  if (b.lat !== undefined) patch.lat = b.lat;
  if (b.lng !== undefined) patch.lng = b.lng;
  if (b.guarantor !== undefined) patch.guarantor = b.guarantor;
  if (b.tools !== undefined) patch.tools = b.tools;
  if (b.portfolio !== undefined) patch.portfolio = b.portfolio;
  if (b.govIdMeta !== undefined) patch.gov_id_meta = b.govIdMeta;
  if (b.skillProof !== undefined) patch.skill_proof = b.skillProof;
  if (b.livenessPassedAt !== undefined) {
    patch.liveness_passed_at = b.livenessPassedAt;
    if (b.livenessPassedAt) {
      patch.face_liveness_verified = true;
      patch.face_liveness_at = b.livenessPassedAt;
    }
  }
  if (b.pipelineNotes !== undefined) patch.pipeline_notes = b.pipelineNotes;
  if (b.bankName !== undefined) patch.bank_name = b.bankName;
  if (b.bankCode !== undefined) patch.bank_code = b.bankCode;

  if (b.pipelineStatus) {
    const from = (existing?.pipeline_status || "draft") as ProPipelineStatus;
    const to = b.pipelineStatus as ProPipelineStatus;
    if (!canTransitionPipeline(from, to) && from !== to) {
      return apiFail(
        `Invalid pipeline transition ${from} → ${to}`,
        400,
        "invalid_transition"
      );
    }
    patch.pipeline_status = to;
    if (to === "submitted") patch.submitted_at = new Date().toISOString();
    if (to === "approved") patch.approved_at = new Date().toISOString();
    if (to === "rejected") patch.rejected_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("repair_pro_profiles")
    .update(patch)
    .eq("user_id", b.userId)
    .select("*")
    .single();

  if (error) return apiFail(error.message, 500);

  // Auto ladder after liveness (T3) or other verification fields
  if (b.livenessPassedAt) {
    try {
      const { recomputeProVisibility } = await import(
        "@/lib/server/pro-visibility"
      );
      await recomputeProVisibility(supabase, b.userId);
    } catch {
      /* non-fatal */
    }
  }

  const { data: refreshed } = await supabase
    .from("repair_pro_profiles")
    .select("*")
    .eq("user_id", b.userId)
    .maybeSingle();

  await writePlatformAudit({
    actorId: b.userId,
    actorRole: "repair_pro",
    action: "pro.profile.patch",
    targetType: "repair_pro_profiles",
    targetId: b.userId,
    newValue: { keys: Object.keys(patch) },
  });

  return apiOk({ source: "supabase", pro: refreshed || data });
}
