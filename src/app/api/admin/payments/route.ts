import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return apiFail(error.message, 500);
    return apiOk({ payments: data ?? [] });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to list payments", 500);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "paid", "failed", "refunded"]),
  provider_ref: z.string().optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const supabase = createServiceSupabase();
    const update: Record<string, unknown> = {
      status: parsed.data.status,
    };
    if (parsed.data.provider_ref) update.provider_ref = parsed.data.provider_ref;
    if (parsed.data.status === "paid") update.paid_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("payments")
      .update(update)
      .eq("id", parsed.data.id)
      .select("*")
      .single();

    if (error) return apiFail(error.message, 500);

    await logAdminAction(session.userId, "update_payment", null, {
      paymentId: parsed.data.id,
      status: parsed.data.status,
    });

    return apiOk({ payment: data });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to update payment", 500);
  }
}
