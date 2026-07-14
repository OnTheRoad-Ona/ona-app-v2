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

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const status = new URL(req.url).searchParams.get("status");
    const supabase = createServiceSupabase();

    let query = supabase
      .from("service_requests")
      .select(
        "*, motorist:profiles!service_requests_motorist_id_fkey(id, full_name, email, phone), pro:profiles!service_requests_repair_pro_id_fkey(id, full_name, email, phone)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return apiFail(error.message, 500);
    return apiOk({ requests: data ?? [] });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to list requests", 500);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z
    .enum([
      "draft",
      "requested",
      "matched",
      "accepted",
      "en_route",
      "in_progress",
      "completed",
      "cancelled",
    ])
    .optional(),
  repair_pro_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const { id, ...patch } = parsed.data;
    const supabase = createServiceSupabase();

    const update: Record<string, unknown> = { ...patch };
    if (patch.status === "accepted") update.accepted_at = new Date().toISOString();
    if (patch.status === "completed")
      update.completed_at = new Date().toISOString();
    if (patch.status === "cancelled")
      update.cancelled_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("service_requests")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return apiFail(error.message, 500);

    if (patch.status) {
      await supabase.from("job_status_events").insert({
        request_id: id,
        status: patch.status,
        actor_id: session.userId,
        note: "Admin update",
      });
    }

    await logAdminAction(session.userId, "update_request", null, {
      requestId: id,
      ...patch,
    });

    return apiOk({ request: data });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to update request", 500);
  }
}
