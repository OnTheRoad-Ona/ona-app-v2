"use client";

/**
 * ONA Shop home — repair commerce catalog browser.
 * Customer: trade bar "Shop". Repair Pro: hamburger Shop.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, ShoppingBag, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ShopVehicleBar } from "@/components/shop/shop-vehicle-bar";
import { ShopProductCard } from "@/components/shop/product-card";
import { PRO_TRADE_OPTIONS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type TradeCat = {
  id: string;
  tradeKey: string;
  slug: string;
  name: string;
};

type ProductCard = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  tradeKey: string;
  primaryImageUrl: string | null;
  fromPriceMinor: number | null;
  currency: string;
  inStock: boolean;
  defaultVariantId?: string | null;
};

export default function ShopHomePage() {
  const { theme, isAuthenticated, accountType } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const ctx =
    accountType === "professional" ? "professional" : "motorist";
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [trades, setTrades] = useState<TradeCat[]>([]);
  const [popular, setPopular] = useState<ProductCard[]>([]);
  const [newArrivals, setNewArrivals] = useState<ProductCard[]>([]);
  const [results, setResults] = useState<ProductCard[] | null>(null);
  const [intentLabel, setIntentLabel] = useState<string | null>(null);
  const [suggestedTrade, setSuggestedTrade] = useState<string | null>(null);
  const [shopTitle, setShopTitle] = useState("Shop");
  const [allowBrowseAllParts, setAllowBrowseAllParts] = useState(true);
  const [defaultTradeKey, setDefaultTradeKey] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop/home?ctx=${encodeURIComponent(ctx)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        data?: {
          trades?: TradeCat[];
          popular?: ProductCard[];
          newArrivals?: ProductCard[];
          recommended?: ProductCard[];
          setupRequired?: boolean;
          shopTitle?: string;
          allowBrowseAllParts?: boolean;
          defaultTradeKey?: string | null;
        };
      };
      if (json.ok && json.data) {
        setTrades(json.data.trades ?? []);
        setPopular(json.data.popular ?? []);
        setNewArrivals(json.data.newArrivals ?? []);
        if (json.data.recommended?.length) {
          setPopular((prev) =>
            prev.length ? prev : json.data!.recommended ?? []
          );
        }
        setSetupRequired(Boolean(json.data.setupRequired));
        if (json.data.shopTitle) setShopTitle(json.data.shopTitle);
        setAllowBrowseAllParts(json.data.allowBrowseAllParts !== false);
        setDefaultTradeKey(json.data.defaultTradeKey ?? null);
      }
    } catch {
      setSetupRequired(true);
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  const runSearch = async () => {
    const query = q.trim();
    if (!query) {
      setResults(null);
      setIntentLabel(null);
      setSuggestedTrade(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/shop/search?q=${encodeURIComponent(query)}&ctx=${encodeURIComponent(ctx)}`
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: {
          results?: ProductCard[];
          suggestedTradeKey?: string | null;
          intent?: {
            tradeKey?: string | null;
            productHints?: string[];
            make?: string | null;
            model?: string | null;
            year?: number | null;
          };
        };
      };
      if (json.ok && json.data) {
        setResults(json.data.results ?? []);
        const i = json.data.intent;
        const tradeKey =
          json.data.suggestedTradeKey || i?.tradeKey || null;
        setSuggestedTrade(tradeKey);
        const bits = [
          tradeKey ? `Trade: ${tradeKey}` : null,
          i?.make,
          i?.model,
          i?.year ? String(i.year) : null,
          ...(i?.productHints ?? []),
        ].filter(Boolean);
        setIntentLabel(bits.length ? bits.join(" · ") : "Search results");
      }
    } finally {
      setSearching(false);
    }
  };

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white/90 text-slate-900" : "bg-[#1c1c1e] text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  /** Full-width listing rows — easy vertical scroll (not a grid of boxes). */
  const productList = (items: ProductCard[]) => (
    <div className="flex flex-col gap-2 px-3">
      {items.length === 0 ? (
        <p className={cn("px-1 py-2 text-[12px] italic", muted)}>
          Nothing here matches the filter.
        </p>
      ) : null}
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
            primaryImageUrl: p.primaryImageUrl,
            defaultVariantId: p.defaultVariantId,
          }}
        />
      ))}
    </div>
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader title={shopTitle} backHref={undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="flex justify-end gap-2 px-3 pt-1">
          {allowBrowseAllParts ? (
          <button
            type="button"
            onClick={() => router.push("/shop/vehicles")}
            className={cn(
              "rounded-lg border-0 px-2.5 py-1 text-[11px] font-bold",
              isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
            )}
          >
            Vehicles
          </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/shop/orders")}
            className={cn(
              "rounded-lg border-0 px-2.5 py-1 text-[11px] font-bold",
              isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
            )}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => router.push("/shop/cart")}
            className="inline-flex items-center gap-1 rounded-lg border-0 bg-[#FF6B35] px-2.5 py-1 text-[11px] font-bold text-white"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Cart
          </button>
        </div>
        {allowBrowseAllParts ? (
          <ShopVehicleBar tradeKey={defaultTradeKey || "mechanic"} />
        ) : null}
        {/* Search */}
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
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder={
                shopTitle === "Mechanic Shop"
                  ? "What part, tool, fluid or equipment are you looking for?"
                  : "What are you looking for?"
              }
              className={cn(
                "min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none",
                isLight ? "text-slate-900 placeholder:text-slate-400" : "text-white placeholder:text-white/40"
              )}
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              disabled={searching}
              className="rounded-lg border-0 bg-[#FF6B35] px-3 py-1.5 text-[12px] font-bold text-white"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Go"
              )}
            </button>
          </div>
          {!isAuthenticated ? (
            <p className={cn("mt-1.5 text-[11px]", muted)}>
              Sign in to checkout — browsing is open.
            </p>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
          </div>
        ) : setupRequired && popular.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-[#FF6B35]" />
            <p className="mt-3 text-[15px] font-bold">Shop is almost ready</p>
            <p className={cn("mt-1 text-[12px] leading-relaxed", muted)}>
              Apply migration{" "}
              <code className="text-[11px]">20260809_050_ona_shop_core.sql</code>{" "}
              and run the sample seed to load catalog products.
            </p>
          </div>
        ) : results ? (
          <>
            <div className="flex items-center justify-between px-3 py-3">
              <p className="text-[13px] font-bold">
                {intentLabel || "Results"}
              </p>
              <button
                type="button"
                className="border-0 bg-transparent text-[12px] font-semibold text-[#FF6B35]"
                onClick={() => {
                  setResults(null);
                  setIntentLabel(null);
                  setSuggestedTrade(null);
                  setQ("");
                }}
              >
                Clear
              </button>
            </div>
            {suggestedTrade ? (
              <div className="px-3 pb-2">
                <button
                  type="button"
                  onClick={() => {
                    const path = `/shop/c/${suggestedTrade}`;
                    const qs = q.trim()
                      ? `?q=${encodeURIComponent(q.trim())}`
                      : "";
                    router.push(`${path}${qs}`);
                  }}
                  className={cn(
                    "w-full rounded-xl border-0 px-3 py-2.5 text-left text-[12px] font-bold",
                    isLight
                      ? "bg-[#FF6B35]/15 text-slate-900"
                      : "bg-[#FF6B35]/20 text-white"
                  )}
                >
                  Jump to{" "}
                  <span className="text-[#FF6B35]">
                    {PRO_TRADE_OPTIONS.find((t) => t.id === suggestedTrade)
                      ?.homeLabel || suggestedTrade}
                  </span>{" "}
                  shop search →
                </button>
              </div>
            ) : null}
            {results.length === 0 ? (
              <div className="px-4 py-4">
                <p className={cn("text-[13px] font-semibold", muted)}>
                  No matching product found.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border-0 bg-[#FF6B35] px-3 py-2 text-[12px] font-bold text-white"
                    onClick={() => {
                      void fetch("/api/shop/product-requests", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          searchTerm: q.trim(),
                          tradeKey: defaultTradeKey || suggestedTrade || "mechanic",
                          notify: false,
                        }),
                      });
                    }}
                  >
                    Request Product
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-lg border-0 px-3 py-2 text-[12px] font-bold",
                      isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
                    )}
                    onClick={() => {
                      void fetch("/api/shop/product-requests", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          searchTerm: q.trim(),
                          tradeKey: defaultTradeKey || suggestedTrade || "mechanic",
                          notify: true,
                        }),
                      });
                    }}
                  >
                    Notify Me
                  </button>
                  <button
                    type="button"
                    className="border-0 bg-transparent text-[12px] font-semibold text-[#FF6B35]"
                    onClick={() => {
                      setResults(null);
                      setQ("");
                    }}
                  >
                    Try Another Search
                  </button>
                </div>
              </div>
            ) : (
              productList(results)
            )}
          </>
        ) : (
          <>
            {/* Browse by trade — original box grid (not product listings) */}
            <p className="px-3 pt-4 pb-2 text-[13px] font-black tracking-tight">
              Browse by trade
            </p>
            <div className="grid grid-cols-4 gap-2 px-3">
              {(trades.length
                ? trades
                : PRO_TRADE_OPTIONS.map((t) => ({
                    id: t.id,
                    tradeKey: t.id,
                    slug: t.id,
                    name: t.homeLabel,
                  }))
              )
                // One tile per trade. Keep ONLY the trade's canonical root
                // (slug === tradeKey, e.g. mechanic/mechanic) when it exists —
                // otherwise the newer taxonomy branches (mechanic/engine-engine-parts
                // etc.) share the same tradeKey and would eat the "Mechanic" tile.
                .filter((tr, i, arr) => {
                  const key = (x: { tradeKey?: string; slug?: string }) =>
                    x.tradeKey || x.slug;
                  const canonical = arr.findIndex(
                    (x) => key(x) === key(tr) && x.slug === x.tradeKey
                  );
                  if (canonical !== -1) return i === canonical;
                  return arr.findIndex((x) => key(x) === key(tr)) === i;
                })
                .map((tr) => {
                const opt = PRO_TRADE_OPTIONS.find(
                  (x) => x.id === tr.tradeKey || x.id === tr.slug
                );
                const Icon = opt?.icon;
                return (
                  <button
                    key={tr.id || tr.slug}
                    type="button"
                    onClick={() =>
                      router.push(`/shop/c/${tr.tradeKey || tr.slug}`)
                    }
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-0 px-1 py-2.5",
                      card
                    )}
                  >
                    {Icon ? (
                      <Icon
                        className="h-5 w-5 text-[#FF6B35]"
                        strokeWidth={2.2}
                      />
                    ) : (
                      <ShoppingBag className="h-5 w-5 text-[#FF6B35]" />
                    )}
                    <span className="truncate text-[10px] font-bold">
                      {tr.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {popular.length > 0 ? (
              <>
                <p className="px-3 pt-5 pb-2 text-[13px] font-black">Popular</p>
                {productList(popular)}
              </>
            ) : null}

            {newArrivals.length > 0 ? (
              <>
                <p className="px-3 pt-5 pb-2 text-[13px] font-black">
                  New arrivals
                </p>
                {productList(newArrivals)}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
