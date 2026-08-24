import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireAdmin, AdminAuthError } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/security/security-store";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: list courier providers (registry for the deliveries board). */
export async function GET() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status || 401);
    return apiFail("Auth failed", 401);
  }
  void admin;
  if (!isSupabaseAdminConfigured())
    return apiOk({ providers: [] });
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("shop_courier_providers")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  if (error) return apiFail(error.message, 500);
  return apiOk({ providers: data || [] });
}

/** POST: create or update a courier provider. */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status || 401);
    return apiFail("Auth failed", 401);
  }
  if (!isSupabaseAdminConfigured())
    return apiFail("Supabase not configured", 500);

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return apiFail("Provider name is required", 400);

  const sb = createServiceSupabase();
  const patch = {
    name,
    phone: body.phone ? String(body.phone) : null,
    active: body.active !== false,
    notes: body.notes ? String(body.notes) : null,
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    const { data, error } = await sb
      .from("shop_courier_providers")
      .update(patch)
      .eq("id", String(body.id))
      .select()
      .single();
    if (error) return apiFail(error.message, 500);
    await logAdminAction({
      adminId: admin.session.userId,
      adminName: admin.profile.full_name || undefined,
      targetType: "courier_provider",
      targetId: String(body.id),
      actionType: "update-courier",
    });
    return apiOk({ provider: data });
  }

  // Default provider: only one at a time
  if (body.isDefault) {
    await sb
      .from("shop_courier_providers")
      .update({ is_default: false })
      .eq("is_default", true);
  }
  const { data, error } = await sb
    .from("shop_courier_providers")
    .insert({
      name: patch.name,
      phone: patch.phone,
      active: patch.active,
      notes: patch.notes,
      is_default: body.isDefault === true,
    })
    .select()
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message || "")) {
      return apiFail("A provider with that name already exists", 400);
    }
    return apiFail(error.message, 500);
  }
  await logAdminAction({
    adminId: admin.session.userId,
    adminName: admin.profile.full_name || undefined,
    targetType: "courier_provider",
    targetId: String(data.id),
    actionType: "create-courier",
  });
  return apiOk({ provider: data });
}

/** PATCH: toggle active / default / quick-edit phone. */
export async function PATCH(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status || 401);
    return apiFail("Auth failed", 401);
  }
  if (!isSupabaseAdminConfigured())
    return apiFail("Supabase not configured", 500);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return apiFail("Missing id", 400);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (body.isDefault === true) {
    const sb = createServiceSupabase();
    await sb
      .from("shop_courier_providers")
      .update({ is_default: false })
      .eq("is_default", true);
    patch.is_default = true;
  }

  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("shop_courier_providers")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return apiFail(error.message, 500);
  await logAdminAction({
    adminId: admin.session.userId,
    adminName: admin.profile.full_name || undefined,
    targetType: "courier_provider",
    targetId: id,
    actionType: "update-courier",
  });
  return apiOk({ provider: data });
}
