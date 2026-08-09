/**
 * User vehicle garage (signed-in only). Ona-owned catalog; free NHTSA-backed makes/models.
 */

import { createServiceSupabase } from "@/lib/supabase/server";

export type GarageVehicle = {
  id: string;
  makeId: string | null;
  modelId: string | null;
  makeName: string;
  modelName: string;
  year: number | null;
  engine: string | null;
  nickname: string | null;
  isDefault: boolean;
};

function mapVehicle(row: Record<string, unknown>): GarageVehicle {
  return {
    id: String(row.id),
    makeId: row.make_id ? String(row.make_id) : null,
    modelId: row.model_id ? String(row.model_id) : null,
    makeName: String(row.make_name || ""),
    modelName: String(row.model_name || ""),
    year: row.year != null ? Number(row.year) : null,
    engine: row.engine ? String(row.engine) : null,
    nickname: row.nickname ? String(row.nickname) : null,
    isDefault: Boolean(row.is_default),
  };
}

export async function listUserVehicles(userId: string): Promise<GarageVehicle[]> {
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("user_vehicles")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapVehicle(r as Record<string, unknown>));
}

export async function getDefaultVehicle(
  userId: string
): Promise<GarageVehicle | null> {
  const list = await listUserVehicles(userId);
  return list.find((v) => v.isDefault) || list[0] || null;
}

export async function setDefaultVehicle(
  userId: string,
  vehicleId: string
): Promise<GarageVehicle> {
  const sb = createServiceSupabase();
  await sb
    .from("user_vehicles")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  const { data, error } = await sb
    .from("user_vehicles")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapVehicle(data as Record<string, unknown>);
}

export async function addUserVehicle(
  userId: string,
  input: {
    makeId?: string | null;
    modelId?: string | null;
    makeName: string;
    modelName: string;
    year?: number | null;
    engine?: string | null;
    nickname?: string | null;
    setDefault?: boolean;
  }
): Promise<GarageVehicle> {
  const sb = createServiceSupabase();
  const makeName = input.makeName.trim();
  const modelName = input.modelName.trim();
  if (!makeName || !modelName) throw new Error("Make and model required");

  if (input.setDefault !== false) {
    await sb
      .from("user_vehicles")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  const { data, error } = await sb
    .from("user_vehicles")
    .insert({
      user_id: userId,
      make_id: input.makeId || null,
      model_id: input.modelId || null,
      make_name: makeName,
      model_name: modelName,
      year: input.year ?? null,
      engine: input.engine?.trim() || null,
      nickname: input.nickname?.trim() || null,
      is_default: input.setDefault !== false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapVehicle(data as Record<string, unknown>);
}

export async function deleteUserVehicle(
  userId: string,
  vehicleId: string
): Promise<void> {
  const sb = createServiceSupabase();
  const { error } = await sb
    .from("user_vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Cascading free catalog: makes → models (optionally year filter from model years). */
export async function listVehicleMakes(q?: string) {
  const sb = createServiceSupabase();
  let query = sb
    .from("vehicle_makes")
    .select("id, slug, name, source")
    .order("name", { ascending: true })
    .limit(200);
  if (q?.trim()) query = query.ilike("name", `%${q.trim().replace(/%/g, "")}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listVehicleModels(makeId: string, q?: string) {
  const sb = createServiceSupabase();
  let query = sb
    .from("vehicle_models")
    .select("id, slug, name, year_start, year_end")
    .eq("make_id", makeId)
    .order("name", { ascending: true })
    .limit(300);
  if (q?.trim()) query = query.ilike("name", `%${q.trim().replace(/%/g, "")}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Years available for a model (from model year_start/end or generations). */
export async function listVehicleYears(modelId: string): Promise<number[]> {
  const sb = createServiceSupabase();
  const { data: model } = await sb
    .from("vehicle_models")
    .select("year_start, year_end")
    .eq("id", modelId)
    .maybeSingle();
  const ys = model?.year_start != null ? Number(model.year_start) : null;
  const ye = model?.year_end != null ? Number(model.year_end) : null;
  if (ys != null && ye != null && ye >= ys) {
    const out: number[] = [];
    for (let y = ye; y >= ys; y--) out.push(y);
    return out.slice(0, 40);
  }
  const { data: gens } = await sb
    .from("vehicle_generations")
    .select("year_start, year_end")
    .eq("model_id", modelId);
  const years = new Set<number>();
  for (const g of gens ?? []) {
    const a = g.year_start != null ? Number(g.year_start) : null;
    const b = g.year_end != null ? Number(g.year_end) : null;
    if (a != null && b != null) {
      for (let y = b; y >= a; y--) years.add(y);
    }
  }
  if (years.size === 0) {
    // Fallback: last 25 years for garage UX when source has no range
    const now = new Date().getFullYear();
    return Array.from({ length: 25 }, (_, i) => now - i);
  }
  return [...years].sort((a, b) => b - a).slice(0, 40);
}
