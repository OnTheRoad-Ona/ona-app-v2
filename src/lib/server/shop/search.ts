/**
 * Smart shop search — text intent + optional trade lock + fitment re-rank.
 */

import { listProducts } from "@/lib/server/shop/catalog";
import { interpretShopQuery } from "@/lib/server/shop/intent";
import { parseTyreSize } from "@/lib/shop/tyre-size";
import type {
  FitmentStatus,
  ShopAccountContext,
  ShopProductCard,
  ShopSearchIntent,
} from "@/lib/server/shop/types";
import { createServiceSupabase } from "@/lib/supabase/server";

export type ShopSearchResultCard = ShopProductCard & {
  fitmentStatus: FitmentStatus;
  fitmentScore: number;
  matchReasons: string[];
  /** Phase 3 ranking ladder score (exact > sku > brand > category > trade > attribute > partial). */
  relevance: number;
  relevanceReason: string;
};

export type SearchShopOptions = {
  userId?: string;
  limit?: number;
  /** Force results into this trade (trade page search). */
  tradeKey?: string;
  /**
   * When true, intent cannot change trade — only filters within tradeKey.
   * Global search leaves this false so intent can detect trade and UI can jump.
   */
  lockTrade?: boolean;
  /** Role gate for professional-only products + search analytics. */
  accountContext?: ShopAccountContext;
  /** Facet filters (category, price, availability, attributes) applied before ranking. */
  filters?: import("@/lib/server/shop/catalog").ProductFilterOptions;
};

const FITMENT_RANK: Record<FitmentStatus, number> = {
  direct_fit: 100,
  compatible: 80,
  conditional: 50,
  unknown: 10,
  not_compatible: -100,
};

function tokenizeForSearch(intent: ShopSearchIntent, raw: string): string[] {
  const bag = new Set<string>();
  const push = (s: string | null | undefined) => {
    const t = (s || "").trim().toLowerCase();
    if (t.length >= 2) bag.add(t);
  };
  push(intent.normalizedQuery);

  // Tyre-size query: "205 55 16" and "205/55 R16" and "205/55R16" are all the
  // same tyre. Tokenize with the canonical size forms so the OR-search matches
  // the one product regardless of the user's spacing/punctuation.
  const tyre = parseTyreSize(raw);
  if (tyre?.canonical) {
    for (const t of tyre.tokens) push(t);
    push(tyre.canonical.toLowerCase());
  }

  for (const h of intent.productHints) push(h);
  push(intent.make);
  push(intent.model);
  if (intent.year) push(String(intent.year));
  push(intent.position);
  for (const [k, v] of Object.entries(intent.specs)) {
    push(String(v));
    if (k === "kva") push(`${v}kva`);
    if (k === "voltage") push(`${v}v`);
    if (k === "diameterMm") push(`${v}mm`);
  }
  // Also split raw words for multi-token OR (fixes "oil oil" join bug)
  for (const w of raw
    .toLowerCase()
    .replace(/[^\w\s./-]/g, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 2)) {
    bag.add(w);
  }
  // Drop ultra-common noise
  for (const n of ["the", "for", "and", "with", "my", "car", "part"]) {
    bag.delete(n);
  }
  return [...bag].slice(0, 12);
}

function softFitmentScore(
  product: ShopProductCard,
  intent: ShopSearchIntent
): { status: FitmentStatus; score: number; reasons: string[] } {
  const hay =
    `${product.name} ${product.subtitle || ""} ${product.slug}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (intent.make && hay.includes(intent.make.toLowerCase())) {
    score += 25;
    reasons.push(`make:${intent.make}`);
  }
  if (intent.model && hay.includes(intent.model.toLowerCase())) {
    score += 35;
    reasons.push(`model:${intent.model}`);
  }
  if (intent.year && hay.includes(String(intent.year))) {
    score += 15;
    reasons.push(`year:${intent.year}`);
  }
  if (intent.position && hay.includes(intent.position.toLowerCase())) {
    score += 12;
    reasons.push(`position:${intent.position}`);
  }
  for (const h of intent.productHints) {
    if (h && hay.includes(h.toLowerCase())) {
      score += 18;
      reasons.push(`hint:${h}`);
    }
  }
  for (const [k, v] of Object.entries(intent.specs)) {
    const s = String(v).toLowerCase();
    if (hay.includes(s) || hay.includes(`${s}kva`) || hay.includes(`${s}v`)) {
      score += 20;
      reasons.push(`spec:${k}`);
    }
  }

  let status: FitmentStatus = "unknown";
  if (score >= 50 && intent.make && intent.model) status = "direct_fit";
  else if (score >= 30) status = "compatible";
  else if (score >= 12) status = "conditional";

  return { status, score, reasons };
}

/**
 * Phase 3 relevance ladder (Priority: exact product > exact SKU/part >
 * exact brand > category > trade > attribute > partial text).
 * Returns a score in (0..100] plus a human-readable reason.
 */
export function relevanceScore(opts: {
  product: ShopProductCard;
  query: string;
  tokens: string[];
  intent: Pick<ShopSearchIntent, "tradeKey">;
  partMatch: "exact" | "contains" | null;
}): { score: number; reason: string } {
  const q = opts.query.trim().toLowerCase();
  const name = opts.product.name.toLowerCase();
  const subtitle = (opts.product.subtitle || "").toLowerCase();
  const brand = (opts.product.brandName || "").toLowerCase();

  // 1. exact product name
  if (q.length >= 2 && name === q) return { score: 100, reason: "exact name" };

  // 2. exact SKU / part number / OEM / MPN
  if (opts.partMatch === "exact") return { score: 90, reason: "exact sku/part" };

  // 3. exact brand
  if (q.length >= 2 && brand === q) return { score: 80, reason: "exact brand" };

  // 4. contains part identity (sku/oem/mpn substring)
  if (opts.partMatch === "contains") return { score: 65, reason: "part match" };

  // 5. category/slug match
  if (opts.tokens.some((t) => opts.product.slug.includes(t))) {
    return { score: 60, reason: "category match" };
  }

  // 6. trade match
  if (opts.intent.tradeKey && opts.product.tradeKey === opts.intent.tradeKey) {
    return { score: 50, reason: "trade match" };
  }

  // 7. attribute value match
  const attrs = opts.product.attributes ?? {};
  for (const [key, value] of Object.entries(attrs)) {
    const sv = String(value).toLowerCase();
    if (opts.tokens.some((t) => sv.includes(t))) {
      return { score: 40, reason: `attribute:${key}` };
    }
  }

  // 8. partial text match
  if (
    (q.length >= 2 && name.includes(q)) ||
    (q.length >= 2 && subtitle.includes(q))
  ) {
    return { score: 30, reason: "partial text" };
  }

  return { score: 10, reason: "weak" };
}

/** Map productId -> how well its variant part-identities matched the query. */
async function loadPartMatchMap(
  productIds: string[],
  tokens: string[]
): Promise<Map<string, "exact" | "contains">> {
  const out = new Map<string, "exact" | "contains">();
  if (!productIds.length) return out;

  const sb = createServiceSupabase();
  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("product_id, sku, mpn, oem_number")
    .in("product_id", productIds)
    .eq("status", "active");
  const vlist = (variants ?? []) as Array<{
    product_id: string;
    sku: string | null;
    mpn: string | null;
    oem_number: string | null;
  }>;

  for (const v of vlist) {
    const identities = [v.sku, v.mpn, v.oem_number]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.trim().toLowerCase().replace(/[\s-]/g, ""));
    const pid = String(v.product_id);
    for (const t of tokens) {
      const norm = t.toLowerCase().replace(/[\s-]/g, "");
      if (identities.some((id) => id === norm)) {
        out.set(pid, "exact");
        break;
      }
      if (identities.some((id) => id.includes(norm))) {
        if (out.get(pid) !== "exact") out.set(pid, "contains");
      }
    }
  }
  return out;
}

async function loadDbFitmentScores(
  productIds: string[],
  intent: ShopSearchIntent
): Promise<Map<string, { status: FitmentStatus; score: number; reasons: string[] }>> {
  const out = new Map<
    string,
    { status: FitmentStatus; score: number; reasons: string[] }
  >();
  if (!productIds.length) return out;
  if (!intent.make && !intent.model && !intent.year) return out;

  const sb = createServiceSupabase();
  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("id, product_id")
    .in("product_id", productIds)
    .eq("status", "active");
  const vlist = (variants ?? []) as Array<{ id: string; product_id: string }>;
  if (!vlist.length) return out;

  const vids = vlist.map((v) => v.id);
  const vToP = new Map(vlist.map((v) => [v.id, v.product_id]));

  // Resolve make/model ids when possible
  let makeId: string | null = null;
  let modelId: string | null = null;
  if (intent.make) {
    const { data: mk } = await sb
      .from("vehicle_makes")
      .select("id")
      .ilike("slug", intent.make)
      .maybeSingle();
    makeId = mk?.id ? String(mk.id) : null;
    if (!makeId) {
      const { data: mk2 } = await sb
        .from("vehicle_makes")
        .select("id")
        .ilike("name", intent.make)
        .maybeSingle();
      makeId = mk2?.id ? String(mk2.id) : null;
    }
  }
  if (makeId && intent.model) {
    const { data: md } = await sb
      .from("vehicle_models")
      .select("id")
      .eq("make_id", makeId)
      .ilike("slug", intent.model)
      .maybeSingle();
    modelId = md?.id ? String(md.id) : null;
  }

  const { data: fits } = await sb
    .from("shop_product_fitments")
    .select(
      "variant_id, make_id, model_id, year_start, year_end, position, fitment_status, engine"
    )
    .in("variant_id", vids)
    .limit(500);

  for (const f of (fits ?? []) as Array<Record<string, unknown>>) {
    const pid = vToP.get(String(f.variant_id));
    if (!pid) continue;

    let score = 0;
    const reasons: string[] = [];
    const status = (String(f.fitment_status || "compatible") ||
      "compatible") as FitmentStatus;

    if (makeId && f.make_id && String(f.make_id) === makeId) {
      score += 30;
      reasons.push("db:make");
    } else if (makeId && f.make_id && String(f.make_id) !== makeId) {
      // wrong make — skip
      continue;
    }

    if (modelId && f.model_id && String(f.model_id) === modelId) {
      score += 40;
      reasons.push("db:model");
    } else if (modelId && f.model_id && String(f.model_id) !== modelId) {
      continue;
    }

    if (intent.year != null) {
      const ys = f.year_start != null ? Number(f.year_start) : null;
      const ye = f.year_end != null ? Number(f.year_end) : null;
      if (ys != null && ye != null) {
        if (intent.year >= ys && intent.year <= ye) {
          score += 25;
          reasons.push("db:year");
        } else {
          continue;
        }
      } else if (ys != null && intent.year >= ys) {
        score += 10;
      } else if (ye != null && intent.year <= ye) {
        score += 10;
      }
    }

    if (
      intent.position &&
      f.position &&
      String(f.position).toLowerCase() === intent.position.toLowerCase()
    ) {
      score += 15;
      reasons.push("db:position");
    }

    score += FITMENT_RANK[status] ?? 0;

    const prev = out.get(pid);
    if (!prev || score > prev.score) {
      out.set(pid, { status, score, reasons });
    }
  }

  return out;
}

export async function searchShop(
  query: string,
  opts?: SearchShopOptions
): Promise<{
  intent: ShopSearchIntent;
  results: ShopSearchResultCard[];
  suggestedTradeKey: string | null;
}> {
  const intent = interpretShopQuery(query);
  const locked = Boolean(opts?.lockTrade && opts.tradeKey);
  const effectiveTrade = locked
    ? opts!.tradeKey!
    : opts?.tradeKey || intent.tradeKey || undefined;

  // When trade is locked, keep intent.tradeKey for analytics but filter by lock
  if (locked) {
    intent.tradeKey = opts!.tradeKey!;
  }

  const tokens = tokenizeForSearch(intent, query);
  const searchQ = tokens.join(" ") || query;

  // Pull a wider pool then re-rank (fitment + stock)
  let results = await listProducts({
    tradeKey: effectiveTrade,
    q: searchQ,
    tokens,
    limit: Math.min(Math.max(opts?.limit ?? 40, 1), 80),
    accountContext: opts?.accountContext,
    filters: opts?.filters,
  });

  // If token AND is too strict and empty, fall back to first product hint or raw
  if (results.length === 0 && tokens.length > 1) {
    results = await listProducts({
      tradeKey: effectiveTrade,
      q: intent.productHints[0] || tokens[0] || query,
      tokens: [intent.productHints[0] || tokens[0] || query],
      limit: opts?.limit ?? 40,
      accountContext: opts?.accountContext,
      filters: opts?.filters,
    });
  }

  const ids = results.map((r) => r.id);
  const dbFit = await loadDbFitmentScores(ids, intent);
  const partMatches = await loadPartMatchMap(ids, tokens);

  const scored: ShopSearchResultCard[] = results.map((p) => {
    const soft = softFitmentScore(p, intent);
    const hard = dbFit.get(p.id);
    const fitmentScore = Math.max(soft.score, hard?.score ?? 0);
    const fitmentStatus: FitmentStatus =
      hard && (hard.score ?? 0) >= soft.score ? hard.status : soft.status;
    const matchReasons = [
      ...(hard?.reasons ?? []),
      ...soft.reasons.filter((r) => !(hard?.reasons ?? []).includes(r)),
    ];
    const rel = relevanceScore({
      product: p,
      query,
      tokens,
      intent,
      partMatch: partMatches.get(p.id) ?? null,
    });
    return {
      ...p,
      fitmentStatus,
      fitmentScore,
      matchReasons,
      relevance: rel.score,
      relevanceReason: rel.reason,
    };
  });

  scored.sort((a, b) => {
    // Phase 3 ladder first (exact > sku > brand > category > trade > attribute > partial)
    if (a.relevance !== b.relevance) return b.relevance - a.relevance;
    if (a.fitmentScore !== b.fitmentScore) return b.fitmentScore - a.fitmentScore;
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    // Prefer lower price as soft tie-break for same fit
    return (a.fromPriceMinor ?? 0) - (b.fromPriceMinor ?? 0);
  });

  // Global: suggest trade jump when intent detected a trade and we aren't locked
  const suggestedTradeKey =
    !locked && intent.tradeKey ? intent.tradeKey : null;

  if (opts?.userId) {
    try {
      const sb = createServiceSupabase();
      await sb.from("shop_search_events").insert({
        user_id: opts.userId,
        query: query.slice(0, 500),
        account_context: opts.accountContext ?? "motorist",
        intent: {
          ...intent,
          lockTrade: locked,
          tradeKey: effectiveTrade ?? intent.tradeKey,
        },
        result_count: scored.length,
      });
    } catch {
      /* non-blocking analytics */
    }
  }

  return {
    intent,
    results: scored.slice(0, opts?.limit ?? 40),
    suggestedTradeKey,
  };
}
