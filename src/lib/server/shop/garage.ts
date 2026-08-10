/**
 * User vehicle garage (signed-in only). Ona-owned catalog; free NHTSA-backed makes/models.
 */

import { createServiceSupabase } from "@/lib/supabase/server";

export type GarageVehicle = {
  id: string;
  vehicleTypeSlug: string;
  makeId: string | null;
  modelId: string | null;
  makeName: string;
  modelName: string;
  year: number | null;
  engine: string | null;
  nickname: string | null;
  isDefault: boolean;
};

export type VehicleType = {
  slug: string;
  name: string;
  sortOrder: number;
};

export const VEHICLE_TYPES: VehicleType[] = [
  { slug: "automobile", name: "Automobile", sortOrder: 1 },
  { slug: "motorcycle", name: "Motorcycle", sortOrder: 2 },
  { slug: "truck", name: "Truck", sortOrder: 3 },
  { slug: "van", name: "Van", sortOrder: 4 },
  { slug: "bus", name: "Bus", sortOrder: 5 },
  { slug: "trailer", name: "Trailer", sortOrder: 6 },
  { slug: "motorhome", name: "Motorhome / RV", sortOrder: 7 },
  { slug: "atv_utv", name: "ATV / UTV", sortOrder: 8 },
  { slug: "construction_ag", name: "Construction & Ag", sortOrder: 9 },
  { slug: "other", name: "Other", sortOrder: 10 },
];

/** Used when DB makes table is empty so the tall picker still has content. */
const FALLBACK_MAKES: Array<{
  id: string;
  slug: string;
  name: string;
  source: string;
  type_slugs: string[];
}> = [
  "Toyota",
  "Honda",
  "Ford",
  "Chevrolet",
  "Nissan",
  "Hyundai",
  "Kia",
  "Mercedes-Benz",
  "BMW",
  "Volkswagen",
  "Audi",
  "Lexus",
  "Mazda",
  "Subaru",
  "Jeep",
  "Ram",
  "GMC",
  "Dodge",
  "Chrysler",
  "Buick",
  "Cadillac",
  "Acura",
  "Infiniti",
  "Volvo",
  "Land Rover",
  "Porsche",
  "Tesla",
  "Mitsubishi",
  "Peugeot",
  "Renault",
  "Fiat",
  "Suzuki",
  "Isuzu",
  "Mini",
  "Jaguar",
  "Genesis",
  "Alfa Romeo",
  "Bentley",
  "Rolls-Royce",
  "Maserati",
  "Ferrari",
  "Lamborghini",
  "McLaren",
  "Bugatti",
  "Aston Martin",
  "Opel",
  "Skoda",
  "SEAT",
  "Citroën",
  "Dacia",
  "Saab",
  "Pontiac",
  "Saturn",
  "Hummer",
  "Lincoln",
  "Mercury",
  "Oldsmobile",
  "Scion",
  "Smart",
  "Fisker",
  "Rivian",
  "Lucid",
  "Polestar",
  "BYD",
  "Geely",
  "Great Wall",
  "Chery",
  "Tata",
  "Mahindra",
  "Proton",
  "Perodua",
  "Holden",
  "Vauxhall",
  "MG",
  "Rover",
  "Daihatsu",
  "SsangYong",
  "Cupra",
  "Alpine",
  "Lancia",
].map((name) => ({
  id: `fb-make-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  source: "fallback",
  type_slugs: ["automobile", "truck", "van"],
}));

export function vehicleTypeName(slug: string | null | undefined): string {
  return (
    VEHICLE_TYPES.find((t) => t.slug === slug)?.name ||
    VEHICLE_TYPES[0].name
  );
}

function mapVehicle(row: Record<string, unknown>): GarageVehicle {
  const typeSlug = row.vehicle_type_slug
    ? String(row.vehicle_type_slug)
    : "automobile";
  return {
    id: String(row.id),
    vehicleTypeSlug: typeSlug,
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
    vehicleTypeSlug?: string;
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

  const typeSlug = input.vehicleTypeSlug || "automobile";

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
      vehicle_type_slug: typeSlug,
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

/** Cascading free catalog: types → makes → models (optionally year filter from model years). */
export async function listVehicleTypes(): Promise<VehicleType[]> {
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("vehicle_types")
    .select("slug, name, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length > 0) {
    return rows.map((r) => ({
      slug: String(r.slug),
      name: String(r.name || r.slug),
      sortOrder: Number(r.sort_order ?? 99),
    }));
  }
  return VEHICLE_TYPES;
}

export async function listVehicleMakes(
  vehicleType?: string,
  q?: string
) {
  const sb = createServiceSupabase();
  let query = sb
    .from("vehicle_makes")
    .select("id, slug, name, source, type_slugs")
    .order("name", { ascending: true })
    .limit(800);
  if (vehicleType && vehicleType !== "all") {
    query = query.contains("type_slugs", [vehicleType]);
  }
  if (q?.trim()) query = query.ilike("name", `%${q.trim().replace(/%/g, "")}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = data ?? [];
  // If type filter returned a thin set, fall back to all makes so the list fills.
  if (vehicleType && vehicleType !== "all" && rows.length < 40 && !q?.trim()) {
    const { data: all, error: e2 } = await sb
      .from("vehicle_makes")
      .select("id, slug, name, source, type_slugs")
      .order("name", { ascending: true })
      .limit(800);
    if (!e2 && all?.length) rows = all;
  }
  if (rows.length === 0) {
    const needle = q?.trim().toLowerCase();
    return needle
      ? FALLBACK_MAKES.filter((m) => m.name.toLowerCase().includes(needle))
      : FALLBACK_MAKES;
  }
  return rows;
}

export async function listVehicleModels(makeId: string, q?: string) {
  const sb = createServiceSupabase();
  let query = sb
    .from("vehicle_models")
    .select("id, slug, name, year_start, year_end")
    .eq("make_id", makeId)
    .order("name", { ascending: true })
    .limit(800);
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
    return out.slice(0, 60);
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
    // Fallback: last 50 years so Year list fills the tall picker
    const now = new Date().getFullYear();
    return Array.from({ length: 50 }, (_, i) => now - i);
  }
  return [...years].sort((a, b) => b - a).slice(0, 60);
}
