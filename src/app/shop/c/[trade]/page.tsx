"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Search, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ShopVehicleBar } from "@/components/shop/shop-vehicle-bar";
import { ShopProductCard } from "@/components/shop/product-card";
import {
  ShopFacetChips,
} from "@/components/shop/shop-facet-chips";
import { ShopAvailabilityChips } from "@/components/shop/shop-availability-chips";
import type { FacetFilters } from "@/components/shop/shop-facet-bar";
import { PRO_TRADE_OPTIONS } from "@/lib/services";
import {
  getRootCategoriesForTrade,
  isVehicleTrade,
} from "@/lib/shop/taxonomy";
import {
  type ListingFilterKey,
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
  const [facets, setFacets] = useState<FacetFilters>({
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

  const label =
    PRO_TRADE_OPTIONS.find((t) => t.id === trade)?.homeLabel || trade;
  const searchExample = TRADE_SEARCH_EXAMPLES[trade] || "part name";

  // Trade-skill aware empty-state suggestion (this trade's catalog terms).
  const emptyStateSuggestion = (() => {
    const roots = getRootCategoriesForTrade(trade).slice(0, 3);
    const names = roots.map((r) => r.name.toLowerCase());
    const list =
      names.length > 2
        ? `${names.slice(0, 2).join(", ")}, or ${names[2]}`
        : names.join(", ");
    const allPartsHint = isVehicleTrade(trade)
      ? " — or use ALL PARTS on the vehicle bar."
      : "";
    return `Look for ${list}${allPartsHint}`;
  })();

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

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white/90" : "bg-[#1c1c1e]";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  const productRows = (items: ProductCard[]) => (
    <div className="flex flex-col gap-2 px-3">
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

            <ShopAvailabilityChips
              value={availability}
              onChange={setAvailability}
            />

            <ShopFacetChips
              tradeKey={trade}
              filters={facets}
              onChange={setFacets}
            />

            {!searched ? (
              <div className="px-4 py-14 text-center">
                <Search className="mx-auto h-9 w-9 text-[#FF6B35]/80" />
                <p className="mt-3 text-[14px] font-bold">
                  Search {label} parts &amp; supplies
                </p>
                <p className={cn("mt-1.5 text-[12px] leading-relaxed", muted)}>
                  {emptyStateSuggestion}
                </p>
              </div>
            ) : searching ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-12 text-center">
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
                {productRows(results)}
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
