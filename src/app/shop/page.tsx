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
};

function formatNgn(minor: number | null): string {
  if (minor == null) return "—";
  return `₦${Math.round(minor / 100).toLocaleString("en-NG")}`;
}

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
          setupRequired?: boolean;
        };
      };
      if (json.ok && json.data) {
        setTrades(json.data.trades ?? []);
        setPopular(json.data.popular ?? []);
        setNewArrivals(json.data.newArrivals ?? []);
        setSetupRequired(Boolean(json.data.setupRequired));
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
    <div className="flex flex-col gap-1.5 px-3">
      {items.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => router.push(`/shop/p/${p.slug}`)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border-0 px-2.5 py-2 text-left",
            card
          )}
        >
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg",
              isLight ? "bg-black/5" : "bg-white/5"
            )}
          >
            {p.primaryImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.primaryImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ShoppingBag className="h-6 w-6 text-[#FF6B35]/80" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-[13px] font-bold leading-snug">
              {p.name}
            </p>
            {p.subtitle ? (
              <p className={cn("mt-0.5 line-clamp-1 text-[11px]", muted)}>
                {p.subtitle}
              </p>
            ) : null}
            <div className="mt-1 flex items-center gap-2">
              <p className="text-[14px] font-black text-[#FF6B35]">
                {formatNgn(p.fromPriceMinor)}
              </p>
              <p className={cn("text-[10px] font-semibold", muted)}>
                {p.inStock ? "In stock" : "Check availability"}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader title="Shop" backHref={undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="flex justify-end gap-2 px-3 pt-1">
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
        <ShopVehicleBar tradeKey="mechanic" />
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
              placeholder="What are you looking for?"
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
              <p className={cn("px-4 text-[13px]", muted)}>
                No matches. Try a brand, part name, or vehicle.
              </p>
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
                // Never show the same trade twice (guards double-seeded categories)
                .filter(
                  (tr, i, arr) =>
                    arr.findIndex(
                      (x) =>
                        (x.tradeKey || x.slug) === (tr.tradeKey || tr.slug)
                    ) === i
                )
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
