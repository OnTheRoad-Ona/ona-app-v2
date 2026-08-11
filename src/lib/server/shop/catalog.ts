/**
 * ONA Shop catalog reads (server-side, service role).
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { availabilityState } from "@/lib/shop/catalog-status";
import { productStatusesForListing } from "@/lib/shop/listing-status";
import { getUserFromRequest } from "@/lib/server/auth-utils";
import type {
  ShopAccountContext,
  ShopCategory,
  ShopProductCard,
} from "@/lib/server/shop/types";

/** Parse ?ctx= from a request into a shop account context (default motorist). */
export function shopCtxFromQuery(value: string | null): ShopAccountContext {
  return value === "professional" ? "professional" : "motorist";
}

/**
 * Resolve the buyer's account context from the REAL session — never from a
 * query param. Guests are always motorist. A guest sending ?ctx=professional
 * cannot bypass the professional-only product gate.
 */
export async function resolveAccountContext(
  req: Request
): Promise<ShopAccountContext> {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return "motorist";
    const sb = createServiceSupabase();
    const { data: profile } = await sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "repair_pro") return "professional";
    return "motorist";
  } catch {
    return "motorist";
  }
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
  return await withProductCounts(sb, out);
}

/** Attach productCount (products directly + under descendant subcategories).
 * Subtrees are walked by the real parent_id links against the FULL active
 * category tree, so a category's number EXACTLY equals its own products plus
 * every subcategory's products — regardless of queried subset or path-string
 * inconsistencies. */
async function withProductCounts(
  sb: ReturnType<typeof createServiceSupabase>,
  cats: ShopCategory[]
): Promise<ShopCategory[]> {
  if (!cats.length) return cats;
  const tradeKeys = [...new Set(cats.map((c) => c.tradeKey))];
  const { data: catRows } = await sb
    .from("shop_trade_categories")
    .select("id, parent_id")
    .in("trade_key", tradeKeys)
    .eq("is_active", true);
  const childrenOf = new Map<string, Set<string>>();
  for (const r of catRows ?? []) {
    const pid = r.parent_id ? String(r.parent_id) : "";
    if (!pid) continue;
    let kids = childrenOf.get(pid);
    if (!kids) {
      kids = new Set();
      childrenOf.set(pid, kids);
    }
    kids.add(String(r.id));
  }
  const { data: rows } = await sb
    .from("shop_products")
    .select("category_id")
    .in("trade_key", tradeKeys)
    .eq("status", "active");
  const direct = new Map<string, number>();
  for (const r of rows ?? []) {
    const cid = r.category_id ? String(r.category_id) : "";
    if (!cid) continue;
    direct.set(cid, (direct.get(cid) || 0) + 1);
  }
  const memo = new Map<string, number>();
  const subtree = (id: string): number => {
    const seen = memo.get(id);
    if (seen !== undefined) return seen;
    let total = direct.get(id) || 0;
    for (const kid of childrenOf.get(id) ?? []) total += subtree(kid);
    memo.set(id, total);
    return total;
  };
  return cats.map((c) => ({ ...c, productCount: subtree(c.id) }));
}

/**
 * Browse start categories for a trade shop ("My Shop"). Each trade has one
 * container root (slug === tradeKey) whose children are the actual shop
 * categories; seed the browse with those children so users see the real
 * categories immediately instead of a trade-name shell row. Falls back to all
 * depth-0 roots when the container is missing or has no children.
 */
export async function getTradeBrowseStart(
  tradeKey: string
): Promise<ShopCategory[]> {
  const roots = await getTradeCategories({ tradeKey, rootsOnly: true });
  const container = roots.find((r) => r.slug === tradeKey);
  if (container) {
    const children = await getTradeCategories({
      tradeKey,
      parentId: container.id,
    });
    if (children.length > 0) return children;
  }
  return roots;
}

/** Featured mix for the general shop home: mechanic equipment dominates,
 * with generator + solar as supporting trades. */
const FEATURED_MIX: Array<{ tradeKey: string; count: number }> = [
  { tradeKey: "mechanic", count: 8 },
  { tradeKey: "generator", count: 2 },
  { tradeKey: "solar", count: 2 },
];

async function featuredProducts(opts: {
  accountContext?: ShopAccountContext;
  order?: "created_at" | "name";
}): Promise<ShopProductCard[]> {
  const out: ShopProductCard[] = [];
  for (const m of FEATURED_MIX) {
    const items = await listProducts({
      tradeKey: m.tradeKey,
      limit: m.count,
      status: "active",
      order: opts.order,
      accountContext: opts.accountContext,
    });
    out.push(...items);
  }
  return out.slice(0, 12);
}

export async function getShopHomeSections(opts?: {
  accountContext?: ShopAccountContext;
  /** Cap trades to these keys (Mechanic Shop). null = all. */
  allowedTradeKeys?: string[] | null;
  defaultTradeKey?: string | null;
}): Promise<{
  trades: ShopCategory[];
  popular: ShopProductCard[];
  newArrivals: ShopProductCard[];
  recommended: ShopProductCard[];
}> {
  let trades = await getTradeCategories({ rootsOnly: true });
  if (opts?.allowedTradeKeys) {
    const allow = new Set(opts.allowedTradeKeys);
    trades = trades.filter((t) => allow.has(t.tradeKey));
  }
  // Mechanic shop home: show mechanic root categories, not all 14 trades
  if (opts?.defaultTradeKey === "mechanic") {
    trades = await getTradeCategories({
      tradeKey: "mechanic",
      rootsOnly: true,
    });
  }
  const tradeFilter =
    opts?.allowedTradeKeys?.length === 1
      ? opts.allowedTradeKeys[0]
      : opts?.defaultTradeKey || undefined;
  // General shop home: surface the curated mechanic/generator/solar mix.
  const isGeneralHome = !tradeFilter;
  const popular = isGeneralHome
    ? await featuredProducts({ accountContext: opts?.accountContext })
    : await listProducts({
        limit: 12,
        status: "active",
        tradeKey: tradeFilter,
        accountContext: opts?.accountContext,
      });
  const newArrivals = isGeneralHome
    ? await featuredProducts({
        accountContext: opts?.accountContext,
        order: "created_at",
      })
    : await listProducts({
        limit: 12,
        status: "active",
        order: "created_at",
        tradeKey: tradeFilter,
        accountContext: opts?.accountContext,
      });
  const recommended = await listProducts({
    limit: 12,
    status: "active",
    tradeKey: tradeFilter || "mechanic",
    accountContext: opts?.accountContext,
  });
  return { trades, popular, newArrivals, recommended };
}

export type ProductFilterOptions = {
  /** Category slug (resolved inside listProducts via trade). */
  categorySlug?: string;
  /** Availability: "in_stock" filters to available-only; "all" shows everything. */
  availability?: "in_stock" | "all";
  /** Listing-status filter: maps to the product status set the chip represents. */
  listingStatus?: "all" | "available" | "low_stock" | "out_of_stock" | "pre_order" | "coming_soon";
  /** Price range in minor units (filters on the active price for a variant). */
  minPriceMinor?: number;
  maxPriceMinor?: number;
  /** Trade-specific dynamic attribute filters (validated per trade schema). */
  attributes?: Record<string, string | number | boolean>;
};

export async function listProducts(opts: {
  tradeKey?: string;
  categoryId?: string;
  categorySlug?: string;
  q?: string;
  /** Optional pre-split tokens — OR across fields; products matching any token. */
  tokens?: string[];
  limit?: number;
  status?: string;
  order?: "created_at" | "name";
  /** Motorist/guest never sees professional-only stock. */
  accountContext?: ShopAccountContext;
  /** Phase 2 filter engine — irrelevant filters are dropped. */
  filters?: ProductFilterOptions;
}): Promise<ShopProductCard[]> {
  const sb = createServiceSupabase();
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100);

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

  // Resolve categorySlug -> categoryId so the filter engine can use slugs.
  let effectiveCategoryId = opts.categoryId;
  if (!effectiveCategoryId && opts.categorySlug && opts.tradeKey) {
    const { data: cat } = await sb
      .from("shop_trade_categories")
      .select("id")
      .eq("trade_key", opts.tradeKey)
      .eq("slug", opts.categorySlug)
      .maybeSingle();
    if (cat) effectiveCategoryId = String(cat.id);
  }

  const partTerms = tokens
    .flatMap((t) => [`sku.ilike.%${t}%`, `mpn.ilike.%${t}%`, `oem_number.ilike.%${t}%`])
    .join(",");
  const { data: variantIds } = partTerms
    ? await sb
        .from("shop_product_variants")
        .select("product_id")
        .or(partTerms)
        .limit(500)
    : { data: null };

  let q = sb
    .from("shop_products")
    .select(
      "id, slug, name, subtitle, trade_key, brand_id, shop_brands(name), primary_image_url, condition_type, status, attributes, created_at"
    )
    .limit(limit);

  // Serving status: explicit active by default, unless a listing-status filter
  // (5 chips) widens the set (pre_order/coming_soon are catalog products that
  // are NOT "active" but have their own lifecycle status).
  const listingStatii = opts.filters?.listingStatus
    ? productStatusesForListing(opts.filters.listingStatus)
    : null;
  const queryStatus = opts.status ?? "active";
  if (listingStatii) q = q.in("status", [...listingStatii]);
  else q = q.eq("status", queryStatus);

  if (opts.tradeKey) q = q.eq("trade_key", opts.tradeKey);
  if (effectiveCategoryId) q = q.eq("category_id", effectiveCategoryId);
  // Role-gate professional-only products (guest + motorist = excluded)
  if (opts.accountContext !== "professional") {
    q = q.eq("is_professional_only", false);
  }

  // Availability filter (Phase 2): in_stock must be explicitly requested.
  if (opts.filters?.availability === "in_stock") {
    q = q.in(
      "id",
      await availableProductIds(sb)
    );
  }

  // Price range filter: product must have an active price within [min, max].
  const minP = opts.filters?.minPriceMinor;
  const maxP = opts.filters?.maxPriceMinor;
  if (minP != null || maxP != null) {
    let pq = sb
      .from("shop_prices")
      .select("variant_id")
      .eq("is_active", true);
    if (minP != null) pq = pq.gte("amount_minor", minP);
    if (maxP != null) pq = pq.lte("amount_minor", maxP);
    pq = pq.limit(2000);
    const { data: pricedVariants } = await pq;
    const pricedVariantIds = new Set(
      ((pricedVariants ?? []) as Array<{ variant_id: string }>).map((r) =>
        String(r.variant_id)
      )
    );
    if (pricedVariantIds.size === 0) return [];
    const { data: pricedProductIds } = await sb
      .from("shop_product_variants")
      .select("product_id")
      .in("id", [...pricedVariantIds].slice(0, 1000))
      .limit(2000);
    const pids = [
      ...new Set(
        ((pricedProductIds ?? []) as Array<{ product_id: string }>).map((r) =>
          String(r.product_id)
        )
      ),
    ];
    if (!pids.length) return [];
    q = q.in("id", pids);
  }

  // Search: name/subtitle/slug/keywords OR part-identity matches.
  if (tokens.length === 1) {
    const term = tokens[0];
    q = q.or(
      `name.ilike.%${term}%,subtitle.ilike.%${term}%,slug.ilike.%${term}%,keywords.cs.{${term}}`
    );
  } else if (tokens.length > 1) {
    const parts: string[] = [];
    for (const term of tokens) {
      parts.push(`name.ilike.%${term}%`);
      parts.push(`subtitle.ilike.%${term}%`);
      parts.push(`slug.ilike.%${term}%`);
    }
    q = q.or(parts.join(","));
  }

  // Dynamic attribute filters (validated per trade by the filter engine).
  const attrs = opts.filters?.attributes ?? {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === "") continue;
    const search = `attributes->>'${key}'`;
    q = q.ilike(search, `%${String(value)}%`);
  }

  if (opts.order === "name") q = q.order("name", { ascending: true });
  else q = q.order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let products = (data ?? []) as Array<Record<string, unknown>>;

  // Merge part-identity matches (sku/mpn/oem) into results.
  if (variantIds?.length) {
    const ids = new Set(products.map((p) => String(p.id)));
    const matchedProductIds = new Set(variantIds.map((v) => String(v.product_id)));
    if (matchedProductIds.size && !ids.size) {
      let extraQ = sb
        .from("shop_products")
        .select(
          "id, slug, name, subtitle, trade_key, brand_id, shop_brands(name), primary_image_url, condition_type, status, attributes, created_at"
        )
        .in("id", [...matchedProductIds].slice(0, limit));
      if (listingStatii) extraQ = extraQ.in("status", [...listingStatii]);
      else extraQ = extraQ.eq("status", opts.status ?? "active");
      const { data: extra } = await extraQ;
      products = extra ?? [];
    } else if (matchedProductIds.size) {
      // keep original ordering; part matches already surfaced via search or will
      // be appended at end (bounded)
      const extra = products.filter((p) => matchedProductIds.has(String(p.id)));
      if (extra.length) products = extra;
    }
  }

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
  const defaultVariantIds = await loadDefaultVariantIds(ids);

  return products.map((p) => {
    const id = String(p.id);
    const price = prices.get(id) ?? null;
    const hasStock = stock.get(id) ?? false;
    const av = availabilityState({
      status: p.status ? String(p.status) : "active",
      priced: price != null,
      inStock: hasStock,
    });
    return {
      id,
      slug: String(p.slug),
      name: String(p.name),
      subtitle: p.subtitle ? String(p.subtitle) : null,
      tradeKey: String(p.trade_key),
      brandName: brandNameOf(p),
      primaryImageUrl: p.primary_image_url
        ? String(p.primary_image_url)
        : null,
      conditionType: p.condition_type ? String(p.condition_type) : null,
      fromPriceMinor: price,
      currency: "NGN",
      inStock: av.available,
      status: p.status ? String(p.status) : "active",
      availabilityLabel: av.label,
      attributes: p.attributes
        ? (p.attributes as Record<string, unknown>)
        : undefined,
      defaultVariantId: defaultVariantIds.get(id) ?? null,
    };
  });
}

async function availableProductIds(
  sb: ReturnType<typeof createServiceSupabase>
): Promise<string[]> {
  const { data } = await sb
    .from("shop_availability_view")
    .select("product_id")
    .eq("available", true)
    .limit(500);
  return (data ?? []).map((r) => String(r.product_id));
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

/**
 * First active, in-stock variant per product, used for quick add-to-cart from
 * a product card. Falls back to the first active variant when none are stocked.
 */
async function loadDefaultVariantIds(
  productIds: string[]
): Promise<Map<string, string>> {
  const sb = createServiceSupabase();
  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("id, product_id")
    .in("product_id", productIds)
    .eq("status", "active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .limit(500);
  const vlist = (variants ?? []) as Array<Record<string, unknown>>;
  if (vlist.length === 0) return new Map();

  const variantByProduct = new Map<string, string[]>();
  for (const v of vlist) {
    const pid = String(v.product_id);
    const list = variantByProduct.get(pid) ?? [];
    list.push(String(v.id));
    variantByProduct.set(pid, list);
  }
  const variantIds = vlist.map((v) => String(v.id));
  const out = new Map<string, string>();
  if (variantIds.length === 0) return out;

  const { data: inv } = await sb
    .from("shop_inventory")
    .select("variant_id, qty_on_hand, qty_reserved")
    .in("variant_id", variantIds);

  const stocked = new Set<string>();
  for (const row of (inv ?? []) as Array<Record<string, unknown>>) {
    if (Number(row.qty_on_hand ?? 0) - Number(row.qty_reserved ?? 0) > 0) {
      stocked.add(String(row.variant_id));
    }
  }
  for (const [pid, vidList] of variantByProduct) {
    const first = vidList.find((vid) => stocked.has(vid)) ?? vidList[0];
    if (first) out.set(pid, first);
  }
  return out;
}

function brandNameOf(p: Record<string, unknown>): string | null {
  const emb = p.shop_brands as
    | { name?: unknown }
    | null
    | undefined;
  const name = emb?.name;
  return typeof name === "string" && name.trim()
    ? name.trim()
    : typeof p.brand_name === "string"
      ? p.brand_name
      : null;
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
  const { data: rawProduct, error } = await sb
    .from("shop_products")
    .select("*, shop_brands(name)")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!rawProduct) return null;
  const product = {
    ...rawProduct,
    brandName: brandNameOf(rawProduct as Record<string, unknown>),
  };
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

  // Per-variant available stock (sum across active locations).
  let stockByVariant = new Map<string, number>();
  if (vids.length) {
    try {
      const { data: inv } = await sb
        .from("shop_inventory")
        .select("variant_id, qty_on_hand, qty_reserved")
        .in("variant_id", vids);
      for (const row of (inv ?? []) as Array<{
        variant_id: string;
        qty_on_hand: number;
        qty_reserved: number;
      }>) {
        const cur = stockByVariant.get(String(row.variant_id)) ?? 0;
        stockByVariant.set(
          String(row.variant_id),
          cur + Math.max(0, Number(row.qty_on_hand) - Number(row.qty_reserved))
        );
      }
    } catch {
      stockByVariant = new Map();
    }
  }
  const variantsWithStock = (variants ?? []).map((v) => ({
    ...(v as Record<string, unknown>),
    stock_available: stockByVariant.get(String((v as { id?: string }).id)) ?? 0,
  }));

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
    variants: variantsWithStock as Record<string, unknown>[],
    prices,
    images,
  };
}
