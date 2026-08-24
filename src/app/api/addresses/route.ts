/**
 * Customer saved addresses Postgres user_addresses.
 */

import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  userId: z.string().uuid(),
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(40).default("Home"),
  addressText: z.string().min(1).max(500),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  isDefault: z.boolean().optional(),
});

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return apiFail("userId required", 400);
  if (userId !== auth.userId) return apiFail("Forbidden", 403, "forbidden");

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("user_addresses")
    .select(
      "id, label, address_text, lat, lng, is_default, created_at, updated_at",
    )
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return apiFail(error.message, 500);
  return apiOk({ addresses: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");
  const b = parsed.data;
  if (b.userId !== auth.userId) return apiFail("Forbidden", 403, "forbidden");

  const supabase = createServiceSupabase();

  if (b.isDefault) {
    await supabase
      .from("user_addresses")
      .update({ is_default: false })
      .eq("user_id", auth.userId);
  }

  if (b.id) {
    const { data, error } = await supabase
      .from("user_addresses")
      .update({
        label: b.label,
        address_text: b.addressText,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
        is_default: b.isDefault ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", b.id)
      .eq("user_id", auth.userId)
      .select("*")
      .single();
    if (error) return apiFail(error.message, 500);
    return apiOk({ address: data });
  }

  const { data, error } = await supabase
    .from("user_addresses")
    .insert({
      user_id: auth.userId,
      label: b.label,
      address_text: b.addressText,
      lat: b.lat ?? null,
      lng: b.lng ?? null,
      is_default: b.isDefault ?? false,
    })
    .select("*")
    .single();
  if (error) return apiFail(error.message, 500);
  return apiOk({ address: data });
}

export async function DELETE(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId");
  if (!id || !userId) return apiFail("id and userId required", 400);
  if (userId !== auth.userId) return apiFail("Forbidden", 403, "forbidden");

  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from("user_addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return apiFail(error.message, 500);
  return apiOk({ deleted: true });
}
