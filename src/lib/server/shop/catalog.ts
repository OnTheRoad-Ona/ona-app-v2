/**
 * ONA Shop catalog reads (server-side, service role).
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import type {
  ShopAccountContext,
  ShopCategory,
  ShopProductCard,
} from "@/lib/server/shop/types";

/** Parse ?ctx= from a request into a shop account context (default motorist). */
export function shopCtxFromQuery(value: string | null): ShopAccountContext {
  return value === "professional" ? "professional" : "motorist";
}

function mapCategory(row: Record<string, unknown>): ShopCategory {
  return {
    id: String(row.id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    tradeKey: String(row.trade_key),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    sortOrder: Number(row.sort_order ?? 0),
    depth: Number(row.depth ?? 0),
    path: String(row.path ?? ""),
  };
}

export async function getTradeCategories(opts?: {
  tradeKey?: string;
  parentId?: string | null;
  rootsOnly?: boolean;
}): Promise<ShopCategory[]> {
  const sb = createServiceSupabase();
  let q = sb
    .from("shop_trade_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (opts?.tradeKey) q = q.eq("trade_key", opts.tradeKey);
  if (opts?.rootsOnly) q = q.eq("depth", 0);
  if (opts?.parentId === null) q = q.is("parent_id", null);
  else if (opts?.parentId) q = q.eq("parent_id", opts.parentId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const mapped = (data ?? []).map((r: Record<string, unknown>) => mapCategory(r));
  // Dedupe by tradeKey+slug (guards against double-seeded categories)
  const seen = new Set<string>();
  const out: ShopCategory[] = [];
  for (const c of mapped) {
    const key = `${c.tradeKey}::${c.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export async function getShopHomeSections(opts?: {
  accountContext?: ShopAccountContext;
}): Promise<{
  trades: ShopCategory[];
  popular: ShopProductCard[];
  newArrivals: ShopProductCard[];
}> {
  const trades = await getTradeCategories({ rootsOnly: true });
  const popular = await listProducts({
    limit: 12,
    status: "active",
    accountContext: opts?.accountContext,
  });
  const newArrivals = await listProducts({
    limit: 12,
    status: "active",
    order: "created_at",
    accountContext: opts?.accountContext,
  });
  return { trades, popular, newArrivals };
}

export async function listProducts(opts: {
  tradeKey?: string;
  categoryId?: string;
  q?: string;
  /** Optional pre-split tokens — OR across fields; products matching any token. */
  tokens?: string[];
  limit?: number;
  status?: string;
  order?: "created_at" | "name";
  /** Motorist/guest never sees professional-only stock. */
  accountContext?: ShopAccountContext;
}): Promise<ShopProductCard[]> {
  const sb = createServiceSupabase();
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100);

  let q = sb
    .from("shop_products")
    .select(
      "id, slug, name, subtitle, trade_key, primary_image_url, condition_type, status, created_at"
    )
    .eq("status", opts.status ?? "active")
    .limit(limit);

  if (opts.tradeKey) q = q.eq("trade_key", opts.tradeKey);
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  // Role-gate professional-only products (guest + motorist = excluded)
  if (opts.accountContext !== "professional") {
    q = q.eq("is_professional_only", false);
  }

  const tokens = (
    opts.tokens?.length
      ? opts.tokens
      : opts.q?.trim()
        ? [opts.q.trim()]
        : []
  )
    .map((t) => t.replace(/[%*,()]/g, "").trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);

  if (tokens.length === 1) {
    const term = tokens[0];
    q = q.or(
      `name.ilike.%${term}%,subtitle.ilike.%${term}%,slug.ilike.%${term}%`
    );
  } else if (tokens.length > 1) {
    // OR each token against name/subtitle/slug so multi-word intent still hits
    const parts: string[] = [];
    for (const term of tokens) {
      parts.push(`name.ilike.%${term}%`);
      parts.push(`subtitle.ilike.%${term}%`);
      parts.push(`slug.ilike.%${term}%`);
    }
    q = q.or(parts.join(","));
  }

  if (opts.order === "name") q = q.order("name", { ascending: true });
  else q = q.order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let products = (data ?? []) as Array<Record<string, unknown>>;

  // Soft re-score client-side when multi-token: prefer products matching more tokens
  if (tokens.length > 1 && products.length > 0) {
    products = products
      .map((p) => {
        const hay =
          `${p.name} ${p.subtitle || ""} ${p.slug}`.toLowerCase();
        const hits = tokens.filter((t) => hay.includes(t.toLowerCase())).length;
        return { p, hits };
      })
      .sort((a, b) => b.hits - a.hits)
      .map((x) => x.p);
  }

  if (products.length === 0) return [];

  const ids = products.map((p) => String(p.id));
  const prices = await loadFromPrices(ids);
  const stock = await loadInStock(ids);

  return products.map((p) => {
    const id = String(p.id);
    return {
      id,
      slug: String(p.slug),
      name: String(p.name),
      subtitle: p.subtitle ? String(p.subtitle) : null,
      tradeKey: String(p.trade_key),
      primaryImageUrl: p.primary_image_url
        ? String(p.primary_image_url)
        : null,
      conditionType: p.condition_type ? String(p.condition_type) : null,
      fromPriceMinor: prices.get(id) ?? null,
      currency: "NGN",
      inStock: stock.get(id) ?? false,
    };
  });
}

async function loadFromPrices(
  productIds: string[]
): Promise<Map<string, number>> {
  const sb = createServiceSupabase();
  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("id, product_id")
    .in("product_id", productIds)
    .eq("status", "active");
  const vlist = (variants ?? []) as Array<Record<string, unknown>>;
  if (vlist.length === 0) return new Map();

  const variantIds = vlist.map((v) => String(v.id));
  const { data: prices } = await sb
    .from("shop_prices")
    .select("variant_id, amount_minor")
    .in("variant_id", variantIds)
    .eq("is_active", true);

  const variantToProduct = new Map(
    vlist.map((v) => [String(v.id), String(v.product_id)])
  );
  const out = new Map<string, number>();
  for (const pr of (prices ?? []) as Array<Record<string, unknown>>) {
    const pid = variantToProduct.get(String(pr.variant_id));
    if (!pid) continue;
    const amt = Number(pr.amount_minor);
    const prev = out.get(pid);
    if (prev == null || amt < prev) out.set(pid, amt);
  }
  return out;
}

async function loadInStock(productIds: string[]): Promise<Map<string, boolean>> {
  const sb = createServiceSupabase();
  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("id, product_id")
    .in("product_id", productIds)
    .eq("status", "active");
  const vlist = (variants ?? []) as Array<Record<string, unknown>>;
  if (vlist.length === 0) return new Map();

  const variantIds = vlist.map((v) => String(v.id));
  const { data: inv } = await sb
    .from("shop_inventory")
    .select("variant_id, qty_on_hand, qty_reserved")
    .in("variant_id", variantIds);

  const variantToProduct = new Map(
    vlist.map((v) => [String(v.id), String(v.product_id)])
  );
  const out = new Map<string, boolean>();
  for (const row of (inv ?? []) as Array<Record<string, unknown>>) {
    const pid = variantToProduct.get(String(row.variant_id));
    if (!pid) continue;
    const avail =
      Number(row.qty_on_hand ?? 0) - Number(row.qty_reserved ?? 0) > 0;
    if (avail) out.set(pid, true);
    else if (!out.has(pid)) out.set(pid, false);
  }
  return out;
}

export async function getProductBySlug(
  slug: string,
  accountContext?: ShopAccountContext
): Promise<{
  product: Record<string, unknown>;
  variants: Record<string, unknown>[];
  prices: Record<string, unknown>[];
  images: Record<string, unknown>[];
} | null> {
  const sb = createServiceSupabase();
  const { data: product, error } = await sb
    .from("shop_products")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) return null;
  // Role-gate professional-only product detail
  if (
    Boolean(product.is_professional_only) &&
    accountContext !== "professional"
  ) {
    return null;
  }

  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("*")
    .eq("product_id", product.id)
    .eq("status", "active");

  const vids = ((variants ?? []) as Array<Record<string, unknown>>).map((v) =>
    String(v.id)
  );
  let prices: Record<string, unknown>[] = [];
  if (vids.length) {
    const { data: pr } = await sb
      .from("shop_prices")
      .select("*")
      .in("variant_id", vids)
      .eq("is_active", true);
    prices = (pr ?? []) as Record<string, unknown>[];
  }

  let images: Record<string, unknown>[] = [];
  try {
    const { data: imgs } = await sb
      .from("shop_product_images")
      .select("id, url, sort_order, is_primary, alt_text")
      .eq("product_id", product.id)
      .order("sort_order", { ascending: true });
    images = (imgs ?? []) as Record<string, unknown>[];
  } catch {
    images = [];
  }

  // Fallback: primary_image_url as single gallery entry
  if (
    !images.length &&
    product.primary_image_url &&
    String(product.primary_image_url).trim()
  ) {
    images = [
      {
        id: "primary",
        url: String(product.primary_image_url),
        sort_order: 0,
        is_primary: true,
        alt_text: product.name,
      },
    ];
  }

  return {
    product: product as Record<string, unknown>,
    variants: (variants ?? []) as Record<string, unknown>[],
    prices,
    images,
  };
}
