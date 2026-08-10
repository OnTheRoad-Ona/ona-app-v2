"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import type { FacetFilters } from "@/components/shop/shop-facet-bar";

type FilterDef =
  | { kind: "category"; key: string; label: string }
  | { kind: "price"; key: string; label: string }
  | { kind: "availability"; key: string; label: string }
  | {
      kind: "attribute";
      key: string;
      label: string;
      type: string;
      unit?: string;
      options?: string[];
    };

type Category = { id: string; slug: string; name: string; productCount: number };

type Props = {
  tradeKey: string;
  filters: FacetFilters;
  onChange: (next: FacetFilters) => void;
};

/**
 * Segmented facet chips for the trade parts page — same interaction style as
 * the customer-dashboard FilterChips, but each chip maps to a product facet
 * (in-stock, category, price, attributes) instead of a technician signal.
 */
export function ShopFacetChips({ tradeKey, filters, onChange }: Props) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const [defs, setDefs] = useState<FilterDef[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [priceOpen, setPriceOpen] = useState(false);
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fRes, cRes] = await Promise.all([
          fetch(`/api/shop/filters?trade=${encodeURIComponent(tradeKey)}`),
          fetch(
            `/api/shop/categories?trade=${encodeURIComponent(tradeKey)}&roots=1`
          ),
        ]);
        const fJson = (await fRes.json()) as {
          ok?: boolean;
          data?: { filters?: FilterDef[] };
        };
        const cJson = (await cRes.json()) as {
          ok?: boolean;
          data?: { categories?: Category[] };
        };
        if (!cancelled) {
          setDefs(fJson.data?.filters ?? []);
          setCats(cJson.data?.categories ?? []);
        }
      } catch {
        if (!cancelled) {
          setDefs([]);
          setCats([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tradeKey]);

  const hasAvailability = defs.some((d) => d.kind === "availability");
  const hasPrice = defs.some((d) => d.kind === "price");
  const attrDefs = defs.filter(
    (d): d is Extract<FilterDef, { kind: "attribute" }> =>
      d.kind === "attribute" && d.type === "enum" && Boolean(d.options?.length)
  );

  const activeCount =
    (filters.availability === "in_stock" ? 1 : 0) +
    (filters.categorySlug ? 1 : 0) +
    (filters.minPriceMinor != null ? 1 : 0) +
    (filters.maxPriceMinor != null ? 1 : 0) +
    Object.values(filters.attributes).filter((v) => v !== "" && v != null)
      .length;

  const anyDef =
    hasAvailability || hasPrice || cats.length > 0 || attrDefs.length > 0;
  if (!anyDef) return null;

  const clearAll = () => {
    setMinInput("");
    setMaxInput("");
    setPriceOpen(false);
    onChange({
      availability: "all",
      categorySlug: null,
      minPriceMinor: null,
      maxPriceMinor: null,
      attributes: {},
    });
  };

  const applyPrice = () => {
    const min = minInput ? Math.round(Number(minInput) * 100) : null;
    const max = maxInput ? Math.round(Number(maxInput) * 100) : null;
    onChange({
      ...filters,
      minPriceMinor: min != null && !Number.isNaN(min) ? min : null,
      maxPriceMinor: max != null && !Number.isNaN(max) ? max : null,
    });
    setPriceOpen(false);
  };

  const muted = isLight ? "text-slate-600" : "text-white/55";

  const chipBase = cn(
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-none border-0",
    "px-2.5 py-1.5 text-[10px] font-bold transition-colors"
  );
  const chipActive = isLight
    ? "bg-white text-slate-900 shadow-sm"
    : "bg-[#3d3d3d] text-white";
  const chipInactive = isLight
    ? "bg-transparent text-slate-800 hover:bg-white/50"
    : "bg-transparent text-[#d0d0d0] hover:bg-white/[0.06] hover:text-white";

  const chip = (active: boolean) =>
    cn(chipBase, active ? chipActive : chipInactive);

  return (
    <div className="px-3 py-1">
<div
          className={cn(
            "flex items-center gap-px overflow-x-auto rounded-md",
            "scrollbar-hide",
            isLight ? "bg-[#c5ccd6]" : "bg-[#2a2a2a]"
          )}
        role="group"
        aria-label="Filters"
      >
        {hasAvailability ? (
          <button
            type="button"
            title="Only products in stock"
            aria-pressed={filters.availability === "in_stock"}
            onClick={() =>
              onChange({
                ...filters,
                availability:
                  filters.availability === "in_stock" ? "all" : "in_stock",
              })
            }
            className={cn(
              chip(filters.availability === "in_stock"),
              filters.availability === "in_stock" && "text-emerald-600"
            )}
          >
            In stock
          </button>
        ) : null}

        {hasPrice ? (
          <button
            type="button"
            title="Filter by price range"
            aria-pressed={
              filters.minPriceMinor != null ||
              filters.maxPriceMinor != null ||
              priceOpen
            }
            onClick={() => setPriceOpen((o) => !o)}
            className={chip(
              filters.minPriceMinor != null ||
                filters.maxPriceMinor != null ||
                priceOpen
            )}
          >
            ₦ Price
            {filters.minPriceMinor != null || filters.maxPriceMinor != null ? (
              <span className="rounded-full bg-[#FF6B35] px-1.5 py-0.5 text-[10px] font-black text-white">
                1
              </span>
            ) : null}
          </button>
        ) : null}

        {cats.map((c) => {
          const active = filters.categorySlug === c.slug;
          return (
            <button
              key={c.id}
              type="button"
              title={active ? "Clear category" : `Category: ${c.name}`}
              aria-pressed={active}
              onClick={() =>
                onChange({
                  ...filters,
                  categorySlug: active ? null : c.slug,
                })
              }
              className={chip(active)}
            >
              {c.name}
              <span className={cn("text-[9px] font-semibold", muted)}>
                {c.productCount}
              </span>
            </button>
          );
        })}

        {attrDefs.map((d) =>
          (d.options ?? []).map((opt) => {
            const active = filters.attributes[d.key] === opt;
            return (
              <button
                key={`${d.key}:${opt}`}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...filters,
                    attributes: {
                      ...filters.attributes,
                      [d.key]: active ? "" : opt,
                    },
                  })
                }
                className={chip(active)}
              >
                {d.label}: {opt}
              </button>
            );
          })
        )}

        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className={cn(
              chipBase,
              "font-black text-[#FF6B35] hover:text-[#FF6B35]/80"
            )}
          >
            Clear all
          </button>
        ) : null}
      </div>

      {hasPrice && priceOpen ? (
        <div
          className={cn(
            "mt-2 flex items-center gap-2 rounded-md px-2 py-2",
            isLight ? "bg-[#e2e3e6]" : "bg-[#232323]"
          )}
        >
          <input
            inputMode="numeric"
            value={minInput}
            onChange={(e) =>
              setMinInput(e.target.value.replace(/[^0-9]/g, ""))
            }
            placeholder="Min"
            aria-label="Minimum price"
            className={cn(
              "h-9 w-full flex-1 rounded-lg border-0 px-3 text-[12px] outline-none",
              isLight ? "bg-black/5 text-slate-900" : "bg-white/10 text-white"
            )}
          />
          <span className={muted}>–</span>
          <input
            inputMode="numeric"
            value={maxInput}
            onChange={(e) =>
              setMaxInput(e.target.value.replace(/[^0-9]/g, ""))
            }
            placeholder="Max"
            aria-label="Maximum price"
            className={cn(
              "h-9 w-full flex-1 rounded-lg border-0 px-3 text-[12px] outline-none",
              isLight ? "bg-black/5 text-slate-900" : "bg-white/10 text-white"
            )}
          />
          <button
            type="button"
            onClick={applyPrice}
            className="shrink-0 rounded-lg border-0 bg-[#FF6B35] px-3 py-2 text-[12px] font-bold text-white"
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}