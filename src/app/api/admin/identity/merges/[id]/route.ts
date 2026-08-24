import { z } from "zod";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { mergeIdentities } from "@/lib/server/identity/identity-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["merge", "reject"]),
  /** Admin may override which side of the pair becomes the primary identity. */
  primaryUserId: z.string().uuid().optional(),
});

/** Approve + perform (or reject) an identity merge candidate. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const { session } = await requireAdmin();
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const supabase = createServiceSupabase();
    const { data: mergeRow, error: findErr } = await supabase
      .from("identity_merges")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (findErr) return apiFail(findErr.message, 500);
    if (!mergeRow) return apiFail("Merge candidate not found", 404);

    if (parsed.data.action === "reject") {
      const { error } = await supabase
        .from("identity_merges")
        .update({
          status: "rejected",
          reviewed_by: session.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) return apiFail(error.message, 500);
      return apiOk({
        status: "rejected",
        message: "Merge candidate rejected.",
      });
    }

    // Approve + perform the merge.
    const primaryUserId =
      parsed.data.primaryUserId || String(mergeRow.primary_user_id);
    const duplicateUserId =
      primaryUserId === String(mergeRow.primary_user_id)
        ? String(mergeRow.duplicate_user_id)
        : String(mergeRow.primary_user_id);

    const result = await mergeIdentities(supabase, {
      primaryUserId,
      duplicateUserId,
      performedBy: session.userId,
      performedByRole: session.adminRole,
    });
    if (!result.ok) {
      return apiFail(result.error || "Merge failed", 500);
    }

    return apiOk({
      status: "merged",
      message: "Accounts merged into one identity.",
      warnings: result.warnings ?? [],
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Merge action failed", 500);
  }
}
