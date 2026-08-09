/**
 * ALL PARTS navigation for a selected vehicle + trade.
 * Data-driven from shop_trade_categories + products with fitment (or soft match).
 * Empty categories are omitted (E1 honesty).
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { listProducts } from "@/lib/server/shop/catalog";
import type {
  ShopAccountContext,
  ShopProductCard,
} from "@/lib/server/shop/types";
import type { GarageVehicle } from "@/lib/server/shop/garage";

export type AllPartsCategory = {
  id: string;
  slug: string;
  name: string;
  tradeKey: string;
  productCount: number;
  depth: number;
  path: string;
};

export type AllPartsTree = {
  vehicle: {
    makeName: string;
    modelName: string;
    year: number | null;
  };
  tradeKey: string;
  categories: AllPartsCategory[];
  products: Array<
    ShopProductCard & {
      fitmentStatus: string | null;
      fitmentBadge: string | null;
    }
  >;
};

function fitmentBadge(status: string | null | undefined): string | null {
  const s = String(status || "").toLowerCase();
  if (s === "direct_fit") return "Fits your vehicle";
  if (s === "compatible") return "Compatible";
  if (s === "conditional") return "Check fit";
  // E1: unknown / missing → no badge
  return null;
}

async function productIdsForVehicle(
  vehicle: Pick<GarageVehicle, "makeId" | "modelId" | "year">
): Promise<Map<string, string>> {
  const sb = createServiceSupabase();
  const out = new Map<string, string>(); // productId -> fitment_status

  if (!vehicle.makeId && !vehicle.modelId) return out;

  let q = sb
    .from("shop_product_fitments")
    .select(
      "variant_id, fitment_status, verification_status, make_id, model_id, year_start, year_end"
    )
    .in("fitment_status", ["direct_fit", "compatible", "conditional"])
    .neq("verification_status", "rejected")
    .limit(500);

  if (vehicle.makeId) q = q.eq("make_id", vehicle.makeId);
  if (vehicle.modelId) q = q.eq("model_id", vehicle.modelId);

  const { data: fits } = await q;
  const vids: string[] = [];
  const fitByVariant = new Map<string, string>();

  for (const f of fits ?? []) {
    const vs = String(f.verification_status || "source_verified");
    if (vs === "rejected" || vs === "conflicted" || vs === "unverified") {
      // unverified: still allow product in list but no strong badge later
    }
    if (vehicle.year != null) {
      const ys = f.year_start != null ? Number(f.year_start) : null;
      const ye = f.year_end != null ? Number(f.year_end) : null;
      if (ys != null && vehicle.year < ys) continue;
      if (ye != null && vehicle.year > ye) continue;
    }
    const vid = String(f.variant_id);
    vids.push(vid);
    fitByVariant.set(vid, String(f.fitment_status || "compatible"));
  }

  if (!vids.length) return out;

  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("id, product_id")
    .in("id", vids)
    .eq("status", "active");

  for (const v of variants ?? []) {
    const pid = String(v.product_id);
    const st = fitByVariant.get(String(v.id)) || "compatible";
    // Prefer direct_fit if multiple
    const prev = out.get(pid);
    if (!prev || st === "direct_fit") out.set(pid, st);
  }
  return out;
}

export async function getAllPartsForVehicle(opts: {
  tradeKey: string;
  vehicle: Pick<
    GarageVehicle,
    "makeId" | "modelId" | "makeName" | "modelName" | "year"
  >;
  categoryId?: string;
  limit?: number;
  accountContext?: ShopAccountContext;
}): Promise<AllPartsTree> {
  const sb = createServiceSupabase();
  const tradeKey = opts.tradeKey || "mechanic";
  const fitMap = await productIdsForVehicle(opts.vehicle);

  // Categories under trade (depth >= 1 preferred; include roots with children)
  const { data: cats } = await sb
    .from("shop_trade_categories")
    .select("id, slug, name, trade_key, depth, path, parent_id")
    .eq("trade_key", tradeKey)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const categories = (cats ?? []) as Array<Record<string, unknown>>;

  // Products in trade
  const products = await listProducts({
    tradeKey,
    categoryId: opts.categoryId,
    limit: opts.limit ?? 48,
    accountContext: opts.accountContext,
  });

  // Prefer fitment-matched products first; keep others without badge (E1)
  const enriched = products.map((p) => {
    const fs = fitMap.get(p.id) || null;
    // Soft text match when no DB fitment
    let soft: string | null = null;
    if (!fs) {
      const hay = `${p.name} ${p.subtitle || ""}`.toLowerCase();
      const mk = opts.vehicle.makeName.toLowerCase();
      const md = opts.vehicle.modelName.toLowerCase();
      if (mk && md && hay.includes(mk) && hay.includes(md)) {
        soft = "compatible";
      }
    }
    const status = fs || soft;
    return {
      ...p,
      fitmentStatus: status,
      fitmentBadge: fitmentBadge(status),
    };
  });

  // If vehicle has fitment data, sort matching first; still show others in category
  enriched.sort((a, b) => {
    const as = a.fitmentBadge ? 1 : 0;
    const bs = b.fitmentBadge ? 1 : 0;
    if (as !== bs) return bs - as;
    return (a.fromPriceMinor ?? 0) - (b.fromPriceMinor ?? 0);
  });

  // Count products per category (from full trade list)
  const allTrade = opts.categoryId
    ? await listProducts({
        tradeKey,
        limit: 100,
        accountContext: opts.accountContext,
      })
    : products;
  const countByCat = new Map<string, number>();
  // load category_id for products
  const ids = allTrade.map((p) => p.id);
  if (ids.length) {
    const { data: rows } = await sb
      .from("shop_products")
      .select("id, category_id")
      .in("id", ids);
    for (const r of rows ?? []) {
      const cid = String(r.category_id || "");
      if (!cid) continue;
      countByCat.set(cid, (countByCat.get(cid) || 0) + 1);
    }
  }

  const nonEmpty: AllPartsCategory[] = categories
    .filter((c) => Number(c.depth) >= 1 || !c.parent_id)
    .map((c) => {
      const id = String(c.id);
      const count = countByCat.get(id) || 0;
      // Also count children under path
      let total = count;
      const path = String(c.path || "");
      for (const [cid, n] of countByCat) {
        const child = categories.find((x) => String(x.id) === cid);
        if (child && String(child.path || "").startsWith(path + "/") && cid !== id) {
          total += n;
        }
      }
      return {
        id,
        slug: String(c.slug),
        name: String(c.name),
        tradeKey: String(c.trade_key),
        productCount: total || count,
        depth: Number(c.depth ?? 0),
        path: String(c.path || ""),
      };
    })
    .filter((c) => c.productCount > 0);

  return {
    vehicle: {
      makeName: opts.vehicle.makeName,
      modelName: opts.vehicle.modelName,
      year: opts.vehicle.year,
    },
    tradeKey,
    categories: nonEmpty,
    products: enriched,
  };
}
