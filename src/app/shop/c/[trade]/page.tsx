"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronRight, Loader2, Search, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ShopVehicleBar } from "@/components/shop/shop-vehicle-bar";
import { ShopProductCard } from "@/components/shop/product-card";
import { ShopAvailabilityChips } from "@/components/shop/shop-availability-chips";
import type { FacetFilters } from "@/components/shop/shop-facet-bar";
import { PRO_TRADE_OPTIONS } from "@/lib/services";
import {
  type ListingFilterKey,
  listingMatchesCard,
} from "@/lib/shop/listing-status";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type ProductCard = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  fromPriceMinor: number | null;
  inStock: boolean;
  status?: string | null;
  availabilityLabel?: string | null;
  fitmentStatus?: string | null;
  fitmentBadge?: string | null;
  fitmentScore?: number;
  matchReasons?: string[];
  defaultVariantId?: string | null;
};

type AllPartsCat = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
  depth: number;
};

/** Neutral browse level — a category or subcategory shown as a listing row. */
type BrowseCat = {
  id: string;
  slug: string;
  name: string;
  productCount?: number;
  depth: number;
};

/** Trade-skill example inside the search box — derived from each trade's
 * PRO_TRADE_OPTIONS hint so it references the skill, not a generic car part
 * like "Camry brake pad". */
const TRADE_SEARCH_EXAMPLES: Record<string, string> = {
  mechanic: "engine, brakes",
  vulcanizer: "tyres, tubes",
  towing: "tow rope, winch",
  battery: "battery, jumper",
  ac: "gas, condenser",
  body: "bumper, panel",
  electrical: "alternator, wiring",
  diagnostics: "scanner, fault code",
  wash: "foam, polish",
  plumber: "pipe, faucet",
  carpenter: "timber, hinge",
  painter: "paint, roller",
  solar: "panel, inverter",
  generator: "spark plug, filter",
};

function ShopTradePageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const trade = String(params.trade || "");
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const ctx =
    accountType === "professional" ? "professional" : "motorist";
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<ProductCard[]>([]);
  const [intentLabel, setIntentLabel] = useState<string | null>(null);
  const [availability, setAvailability] = useState<ListingFilterKey>("all");
  const [facets] = useState<FacetFilters>({
    availability: "all",
    categorySlug: null,
    minPriceMinor: null,
    maxPriceMinor: null,
    attributes: {},
  });

  // ALL PARTS mode (C3: tree then list)
  const allParts = searchParams.get("allParts") === "1";
  const [cats, setCats] = useState<AllPartsCat[]>([]);
  const [partsProducts, setPartsProducts] = useState<ProductCard[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(
    searchParams.get("categoryId")
  );
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);

  // Neutral browse (no vehicle) — category > subcategory > product listing rows.
  const [browseStack, setBrowseStack] = useState<BrowseCat[]>([]);
  const [browseLevel, setBrowseLevel] = useState<BrowseCat[]>([]);
  const [browseProducts, setBrowseProducts] = useState<ProductCard[] | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState(false);

  const label =
    PRO_TRADE_OPTIONS.find((t) => t.id === trade)?.homeLabel || trade;
  const searchExample = TRADE_SEARCH_EXAMPLES[trade] || "part name";

  const loadAllParts = useCallback(async () => {
    if (!allParts) return;
    const makeName = searchParams.get("makeName") || "";
    const modelName = searchParams.get("modelName") || "";
    if (!makeName || !modelName) return;
    setPartsLoading(true);
    try {
      const qs = new URLSearchParams({
        trade,
        makeName,
        modelName,
        ctx,
      });
      if (searchParams.get("year")) qs.set("year", searchParams.get("year")!);
      if (searchParams.get("makeId")) qs.set("makeId", searchParams.get("makeId")!);
      if (searchParams.get("modelId"))
        qs.set("modelId", searchParams.get("modelId")!);
      if (categoryId) qs.set("categoryId", categoryId);
      const res = await fetch(`/api/shop/all-parts?${qs.toString()}`);
      const json = (await res.json()) as {
        ok?: boolean;
        data?: {
          vehicle?: { makeName: string; modelName: string; year: number | null };
          categories?: AllPartsCat[];
          products?: ProductCard[];
        };
      };
      if (json.ok && json.data) {
        const v = json.data.vehicle;
        setVehicleLabel(
          v
            ? [v.year, v.makeName, v.modelName].filter(Boolean).join(" ")
            : null
        );
        setCats(json.data.categories ?? []);
        setPartsProducts(json.data.products ?? []);
      }
    } finally {
      setPartsLoading(false);
    }
  }, [allParts, trade, searchParams, categoryId, ctx]);

  useEffect(() => {
    void loadAllParts();
  }, [loadAllParts]);

  const runSearch = useCallback(
    async (override?: string, overrideFacets?: FacetFilters) => {
      const query = (override ?? q).trim();
      const f = overrideFacets ?? facets;
      if (!query) {
        setSearched(false);
        setResults([]);
        setIntentLabel(null);
        return;
      }
      setSearching(true);
      setSearched(true);
      try {
        const qs = new URLSearchParams({
          q: query,
          trade,
          lockTrade: "1",
          ctx,
        });
        if (availability !== "all") qs.set("listingStatus", availability);
        if (f.availability === "in_stock") qs.set("availability", "in_stock");
        if (f.categorySlug) qs.set("category", f.categorySlug);
        if (f.minPriceMinor != null) qs.set("minPrice", String(f.minPriceMinor));
        if (f.maxPriceMinor != null) qs.set("maxPrice", String(f.maxPriceMinor));
        for (const [k, v] of Object.entries(f.attributes)) {
          if (v !== "" && v != null) qs.set(`attr.${k}`, String(v));
        }
        const res = await fetch(`/api/shop/search?${qs.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          data?: {
            results?: ProductCard[];
            intent?: {
              make?: string | null;
              model?: string | null;
              year?: number | null;
              productHints?: string[];
            };
          };
        };
        if (json.ok && json.data) {
          setResults(json.data.results ?? []);
          const i = json.data.intent;
          const bits = [
            i?.make,
            i?.model,
            i?.year ? String(i.year) : null,
            ...(i?.productHints ?? []),
          ].filter(Boolean);
          setIntentLabel(
            bits.length ? bits.join(" · ") : `Results in ${label}`
          );
        } else {
          setResults([]);
          setIntentLabel(null);
        }
      } finally {
        setSearching(false);
      }
    },
    [q, trade, label, ctx, facets, availability]
  );

  useEffect(() => {
    const initial = searchParams.get("q")?.trim() || "";
    if (allParts) return;
    setQ(initial);
    setSearched(false);
    setResults([]);
    setIntentLabel(null);
    if (initial) void runSearch(initial, facets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade, searchParams, allParts]);
  // Re-run the active search when facet filters or availability chips change.
  useEffect(() => {
    if (!searched) return;
    if (!q.trim()) return;
    void runSearch(q, facets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets, availability]);

  /** Load a neutral browse level — children of `parent`, else roots. */
  const loadBrowse = useCallback(
    async (parent?: BrowseCat) => {
      setBrowseLoading(true);
      setBrowseError(false);
      setBrowseProducts(null);
      try {
        const qs = new URLSearchParams({ trade });
        if (parent) qs.set("parent", parent.id);
        else qs.set("start", "1");
        const res = await fetch(`/api/shop/categories?${qs.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { categories?: BrowseCat[] };
        };
        if (json.ok) {
          const list = Array.isArray(json.data?.categories)
            ? json.data.categories
            : [];
          setBrowseLevel(list);
        } else {
          setBrowseError(true);
        }
      } catch {
        setBrowseError(true);
      } finally {
        setBrowseLoading(false);
      }
    },
    [trade]
  );

  /** Show products for a selected category row (leaf of the browse tree). */
  const openBrowseCategory = useCallback(
    async (cat: BrowseCat) => {
      setBrowseLoading(true);
      setBrowseProducts(null);
      try {
        const qs = new URLSearchParams({
          trade,
          category: cat.slug,
          limit: "100",
          ctx,
        });
        if (availability !== "all") qs.set("listingStatus", availability);
        const res = await fetch(`/api/shop/products?${qs.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { products?: ProductCard[] };
        };
        if (json.ok) {
          setBrowseProducts(json.data?.products ?? []);
          setBrowseLevel([]);
        } else {
          setBrowseProducts([]);
        }
      } catch {
        setBrowseProducts([]);
      } finally {
        setBrowseLoading(false);
      }
    },
    [trade, ctx, availability]
  );

  /** Drill into a category row: children level if present, else its products. */
  const drillBrowse = useCallback(
    async (cat: BrowseCat) => {
      setBrowseLoading(true);
      setBrowseError(false);
      setBrowseProducts(null);
      try {
        const qs = new URLSearchParams({ trade, parent: cat.id });
        const res = await fetch(`/api/shop/categories?${qs.toString()}`);
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { categories?: BrowseCat[] };
        };
        const children = Array.isArray(json.data?.categories)
          ? json.data.categories
          : [];
        if (children.length > 0) {
          setBrowseStack((s) => [...s, cat]);
          setBrowseLevel(children);
        } else {
          setBrowseStack((s) => [...s, cat]);
          await openBrowseCategory(cat);
        }
      } catch {
        setBrowseError(true);
      } finally {
        setBrowseLoading(false);
      }
    },
    [trade, openBrowseCategory]
  );

  /** Pop back one level (or to roots) when a breadcrumb is tapped. */
  const popBrowse = useCallback(
    async (keep?: BrowseCat) => {
      setBrowseProducts(null);
      if (!keep) {
        setBrowseStack([]);
        void loadBrowse();
        return;
      }
      const next = browseStack.filter((c) => c.id !== keep.id);
      setBrowseStack(next);
      const parent = next[next.length - 1];
      void loadBrowse(parent);
    },
    [browseStack, loadBrowse]
  );

  // Seed the neutral browse with root categories on first load (non-ALL PARTS).
  const browseSeeded = browseStack.length > 0 || browseLevel.length > 0;
  useEffect(() => {
    if (allParts) return;
    if (browseSeeded) return;
    void loadBrowse();
  }, [allParts, browseSeeded, loadBrowse]);

  // Reset the neutral browse when switching trades or entering ALL PARTS.
  useEffect(() => {
    setBrowseStack([]);
    setBrowseProducts(null);
    setBrowseLevel([]);
  }, [trade, allParts]);

  // When the availability chip changes while a category's products are open,
  // re-pull that list so the chips act as a product filter (chips only apply
  // to products, not to category/subcategory rows).
  useEffect(() => {
    if (searched) return;
    if (browseProducts === null) return;
    if (browseStack.length === 0) return;
    void openBrowseCategory(browseStack[browseStack.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability]);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white/90" : "bg-[#1c1c1e]";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  // The stock chips (All/Available/Low/Out/Pre-order/Coming soon) only appear
  // alongside a product list, and tapping one narrows THAT list down.
  const visibleBrowse =
    availability === "all" || !browseProducts
      ? browseProducts
      : browseProducts.filter((p) => listingMatchesCard(p, availability));
  const visibleResults =
    availability === "all" || !results
      ? results
      : results.filter((p) => listingMatchesCard(p, availability));

  const productRows = (items: ProductCard[]) => (
    <div className="flex flex-col gap-3 px-3 pb-4">
      {items.map((p) => (
        <ShopProductCard
          key={p.id}
          product={{
            id: p.id,
            slug: p.slug,
            name: p.name,
            subtitle: p.subtitle,
            fromPriceMinor: p.fromPriceMinor,
            inStock: p.inStock,
            fitmentStatus: p.fitmentStatus,
            fitmentBadge: p.fitmentBadge,
            defaultVariantId: p.defaultVariantId,
          }}
        />
      ))}
    </div>
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader
        title={allParts ? `ALL PARTS · ${label}` : label}
        backHref="/shop"
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <ShopVehicleBar tradeKey={trade} />

        {allParts ? (
          <>
            {vehicleLabel ? (
              <p className="px-3 pt-2 text-[12px] font-bold text-[#FF6B35]">
                {vehicleLabel}
              </p>
            ) : (
              <p className={cn("px-3 pt-2 text-[12px]", muted)}>
                Select a vehicle to see systems with products.
              </p>
            )}
            {partsLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
              </div>
            ) : (
              <>
                {/* Category tree — only non-empty */}
                {!categoryId && cats.length > 0 ? (
                  <>
                    <p className="px-3 pt-3 pb-2 text-[13px] font-black">
                      Systems
                    </p>
                    <div className="flex flex-col gap-1.5 px-3">
                      {cats.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategoryId(c.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl border-0 px-3 py-2.5 text-left",
                            card,
                            isLight ? "text-slate-900" : "text-white"
                          )}
                        >
                          <span className="text-[13px] font-bold">{c.name}</span>
                          <span className={cn("text-[11px] font-semibold", muted)}>
                            {c.productCount}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                {categoryId ? (
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-[13px] font-bold">
                      {cats.find((c) => c.id === categoryId)?.name || "Parts"}
                    </p>
                    <button
                      type="button"
                      className="border-0 bg-transparent text-[12px] font-semibold text-[#FF6B35]"
                      onClick={() => setCategoryId(null)}
                    >
                      All systems
                    </button>
                  </div>
                ) : null}
                <p className="px-3 pt-3 pb-2 text-[13px] font-black">
                  {categoryId ? "Products" : "Featured for this vehicle"}
                </p>
                {partsProducts.length === 0 ? (
                  <p className={cn("px-4 text-[13px]", muted)}>
                    No products in catalog for this selection yet.
                  </p>
                ) : (
                  productRows(partsProducts)
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="px-3 pt-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5",
                  isLight ? "bg-white/95" : "bg-[#1c1c1e]"
                )}
              >
                <Search className="h-4 w-4 shrink-0 text-[#FF6B35]" />
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    if (!e.target.value.trim()) {
                      setSearched(false);
                      setResults([]);
                      setIntentLabel(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch();
                  }}
                  placeholder={`Search ${label}… e.g. ${searchExample}`}
                  className={cn(
                    "min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none",
                    isLight
                      ? "text-slate-900 placeholder:text-slate-400"
                      : "text-white placeholder:text-white/40"
                  )}
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching || !q.trim()}
                  className="rounded-lg border-0 bg-[#FF6B35] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Go"
                  )}
                </button>
              </div>
            </div>

            {!searched ? (
              <div className="px-3 pt-3">
                {/* Breadcrumb back when browsing deeper than roots */}
                {browseStack.length > 0 ? (
                  <div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
                    <button
                      type="button"
                      className="shrink-0 border-0 bg-transparent text-[12px] font-bold text-[#FF6B35]"
                      onClick={() => void popBrowse()}
                    >
                      All categories
                    </button>
                    {browseStack.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="shrink-0 border-0 bg-transparent text-[12px] font-semibold"
                        onClick={() => void popBrowse(c)}
                      >
                        <span className={muted}>/ {c.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {browseLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-7 w-7 animate-spin text-[#FF6B35]" />
                  </div>
                ) : browseError ? (
                  <p className={cn("px-1 py-10 text-center text-[13px]", muted)}>
                    Could not load categories.
                  </p>
                ) : browseProducts ? (
                  <>
                    <div className="flex items-center justify-between pb-2">
                      <p className="text-[13px] font-bold">
                        {browseStack.length
                          ? browseStack[browseStack.length - 1].name
                          : "Products"}
                      </p>
                      <button
                        type="button"
                        className="border-0 bg-transparent text-[12px] font-semibold text-[#FF6B35]"
                        onClick={() => void popBrowse()}
                      >
                        Back to categories
                      </button>
                    </div>
                    <ShopAvailabilityChips
                      value={availability}
                      onChange={setAvailability}
                    />
                    {!visibleBrowse || visibleBrowse.length === 0 ? (
                      <p className={cn("px-1 py-8 text-center text-[13px]", muted)}>
                        No products in this category yet.
                      </p>
                    ) : (
                      productRows(visibleBrowse)
                    )}
                  </>
                ) : (
                  <>
                    <p className="pb-2 text-[13px] font-black">
                      {browseStack.length
                        ? browseStack[browseStack.length - 1].name
                        : "My Shop"}
                    </p>
                    {browseLevel.length === 0 ? (
                      <p className={cn("px-1 py-10 text-center text-[13px]", muted)}>
                        No categories available yet.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {browseLevel.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => void drillBrowse(c)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border-0 px-3 py-2.5 text-left",
                              card,
                              isLight ? "text-slate-900" : "text-white"
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                              {c.name}
                            </span>
                            {typeof c.productCount === "number" &&
                            c.productCount > 0 ? (
                              <span
                                className={cn(
                                  "shrink-0 text-[11px] font-semibold",
                                  muted
                                )}
                              >
                                {c.productCount}
                              </span>
                            ) : null}
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : searching ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
              </div>
            ) : (visibleResults ?? []).length === 0 ? (
              <div className="px-4 py-12 text-center">
                <ShopAvailabilityChips
                  value={availability}
                  onChange={setAvailability}
                />
                <ShoppingBag className="mx-auto h-9 w-9 text-[#FF6B35]" />
                <p className={cn("mt-2 text-[13px]", muted)}>
                  No matches in {label}.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-3 py-3">
                  <p className="text-[13px] font-bold">
                    {intentLabel || "Results"}
                  </p>
                  <button
                    type="button"
                    className="border-0 bg-transparent text-[12px] font-semibold text-[#FF6B35]"
                    onClick={() => {
                      setQ("");
                      setSearched(false);
                      setResults([]);
                      setIntentLabel(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <ShopAvailabilityChips
                  value={availability}
                  onChange={setAvailability}
                />
                {productRows(visibleResults)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ShopTradePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-black">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
        </div>
      }
    >
      <ShopTradePageInner />
    </Suspense>
  );
}
