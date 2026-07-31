import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Repair Pro submits government ID / NIN / skill docs for admin review.
 * Writes to repair_pro_profiles so care queues see media + numbers instantly.
 */
const bodySchema = z.object({
  access_token: z.string().min(10),
  kind: z.enum(["gov_id", "nin", "skill_docs", "profile_submit"]),
  govIdKind: z.string().max(40).optional(),
  govIdNumber: z.string().max(64).optional(),
  govIdFrontUrl: z.string().max(6_000_000).optional(),
  govIdBackUrl: z.string().max(6_000_000).optional(),
  nin: z.string().max(20).optional(),
  skillProofType: z.string().max(40).optional(),
  skillProofName: z.string().max(200).optional(),
  skillProofUrl: z.string().max(6_000_000).optional(),
  primaryService: z.string().max(40).optional(),
  businessName: z.string().max(120).optional(),
});

function last4(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length >= 4) return d.slice(-4);
  const a = raw.replace(/\W/g, "");
  return a.length >= 4 ? a.slice(-4) : null;
}

function cap(url: string | undefined | null): string | null {
  if (!url) return null;
  if (url.length > 1_500_000) return null;
  return url;
}

async function userFromToken(token: string) {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) return null;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server is not configured", 503);
  }
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiFail("Invalid body", 400);

    const userId = await userFromToken(parsed.data.access_token);
    if (!userId) return apiFail("Sign in again to submit", 401, "auth");

    const admin = createServiceSupabase();
    const now = new Date().toISOString();
    const kind = parsed.data.kind;

    const { data: existing } = await admin
      .from("repair_pro_profiles")
      .select("user_id, primary_service, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      await admin.from("repair_pro_profiles").upsert({
        user_id: userId,
        primary_service: parsed.data.primaryService || "mechanic",
        status: "pending",
        pipeline_status: "draft",
      });
    }

    const patch: Record<string, unknown> = {
      updated_at: now,
      status: "pending",
    };

    if (kind === "gov_id") {
      const num = (parsed.data.govIdNumber || "").trim();
      if (num.length < 5) return apiFail("Enter the ID number", 400);
      const front = cap(parsed.data.govIdFrontUrl);
      if (!front && !parsed.data.govIdFrontUrl) {
        return apiFail("Upload ID photo", 400);
      }
      patch.gov_id_kind = parsed.data.govIdKind || null;
      patch.gov_id_number = num;
      patch.nin_encrypted = num;
      patch.nin_last4 = last4(num);
      patch.gov_id_front_url = front;
      patch.gov_id_back_url = cap(parsed.data.govIdBackUrl);
      patch.gov_id_review_status = "submitted";
      patch.gov_id_submitted_at = now;
      patch.gov_id_reviewed_at = null;
      patch.nin_verified = false;
      patch.bvn_verified = false;
      patch.verified = false;
      patch.gov_id_meta = {
        govIdKind: parsed.data.govIdKind || null,
        primaryId: num,
        primaryLast4: last4(num),
        hasPhoto: Boolean(parsed.data.govIdFrontUrl),
        photoStored: Boolean(front),
        submittedAt: now,
        source: "pro_onboarding",
      };
      patch.pipeline_status = "pending_verification";
      patch.submitted_at = now;
      patch.rejection_reason = null;
      patch.rejected_at = null;
    }

    if (kind === "nin") {
      const nin = (parsed.data.nin || "").replace(/\D/g, "");
      if (nin.length !== 11) return apiFail("NIN/BVN must be 11 digits", 400);
      patch.nin_encrypted = nin;
      patch.bvn_encrypted = nin;
      patch.nin_last4 = last4(nin);
      patch.bvn_last4 = last4(nin);
      patch.bank_id_number = nin;
      // Keep gov_id_review submitted so care sees secondary ID too
      if (!patch.gov_id_review_status) {
        patch.gov_id_review_status = "submitted";
        patch.gov_id_submitted_at = now;
      }
      patch.nin_verified = false;
      patch.bvn_verified = false;
      patch.pipeline_status = "pending_verification";
      patch.submitted_at = now;
      const metaExtra = {
        nin: nin,
        ninLast4: last4(nin),
        ninSubmittedAt: now,
      };
      // merge meta
      const { data: cur } = await admin
        .from("repair_pro_profiles")
        .select("gov_id_meta")
        .eq("user_id", userId)
        .maybeSingle();
      const prev =
        cur?.gov_id_meta && typeof cur.gov_id_meta === "object"
          ? (cur.gov_id_meta as Record<string, unknown>)
          : {};
      patch.gov_id_meta = { ...prev, ...metaExtra };
    }

    if (kind === "skill_docs") {
      const url = cap(parsed.data.skillProofUrl);
      if (!url && !parsed.data.skillProofUrl) {
        return apiFail("Upload skill document", 400);
      }
      patch.docs_status = "under_review";
      patch.docs_submitted_at = now;
      patch.docs_reviewed_at = null;
      patch.docs_reviewed_by = null;
      patch.certification_file_name =
        parsed.data.skillProofName || "skill-document";
      patch.certification_file_url = url;
      patch.skill_proof = {
        type: parsed.data.skillProofType || null,
        name: parsed.data.skillProofName || null,
        url: url,
        submittedAt: now,
        status: "under_review",
      };
      patch.pipeline_status = "pending_document_review";
      patch.submitted_at = now;
    }

    if (kind === "profile_submit") {
      patch.pipeline_status = "pending_verification";
      patch.submitted_at = now;
      patch.status = "pending";
      if (parsed.data.businessName) {
        patch.business_name = parsed.data.businessName;
      }
      if (parsed.data.primaryService) {
        patch.primary_service = parsed.data.primaryService;
      }
    }

    const { error } = await admin
      .from("repair_pro_profiles")
      .update(patch)
      .eq("user_id", userId);

    if (error) {
      // Retry without newer columns
      if (
        /gov_id_|skill_proof|pipeline_|certification_/i.test(error.message)
      ) {
        const slim: Record<string, unknown> = {
          updated_at: now,
          status: "pending",
          nin_last4: patch.nin_last4,
          bvn_last4: patch.bvn_last4,
          nin_verified: false,
          bvn_verified: false,
          verified: false,
        };
        if (patch.docs_status) slim.docs_status = patch.docs_status;
        if (patch.certification_file_url)
          slim.certification_file_url = patch.certification_file_url;
        if (patch.certification_file_name)
          slim.certification_file_name = patch.certification_file_name;
        const { error: e2 } = await admin
          .from("repair_pro_profiles")
          .update(slim)
          .eq("user_id", userId);
        if (e2) return apiFail(e2.message, 500);
      } else {
        return apiFail(error.message, 500);
      }
    }

    await admin
      .from("profiles")
      .update({ role: "repair_pro", updated_at: now })
      .eq("id", userId);

    // Signup/onboarding-time duplicate detection: if this ID matches another
    // (non-deleted) account, queue the pair for admin review.
    if (kind === "gov_id" || kind === "nin") {
      try {
        const { detectMergeCandidatesForUser } = await import(
          "@/lib/server/identity/identity-sync"
        );
        await detectMergeCandidatesForUser(admin, userId, {
          userId,
          source: "pro_id_verify",
        });
      } catch (e) {
        console.error("pro-id merge detection failed", e);
      }
    }

    return apiOk({
      kind,
      status: "submitted",
      message:
        kind === "skill_docs"
          ? "Skill document submitted for admin review."
          : kind === "profile_submit"
            ? "Profile submitted for admin review."
            : "Document submitted for admin / customer care review.",
      submittedAt: now,
    });
  } catch {
    return apiFail("Could not submit for review", 500);
  }
}
