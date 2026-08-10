"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Car,
  Cog,
  Disc,
  Fan,
  Fuel,
  Lamp,
  PackageCheck,
  Plug,
  Shield,
  Tags,
  Thermometer,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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

/** Pick a small icon from the category / attribute name (keyword match). */
function iconForName(name: string): LucideIcon {
  const hay = name.toLowerCase();
  if (/engine|motor|gearbox|clutch|transmission/.test(hay)) return Cog;
  if (/brake|disc|pad/.test(hay)) return Disc;
  if (/tire|tyre|wheel|rim/.test(hay)) return Car;
  if (/cool|radiator|ac|heater|temperature/.test(hay)) return Thermometer;
  if (/fuel|filter|oil|lubricant|fluid/.test(hay)) return Fuel;
  if (/electric|battery|cable|wire|charg|solar|panel/.test(hay)) return Plug;
  if (/light|headlight|bulb|led/.test(hay)) return Lamp;
  if (/paint|coat|body|panel|bumper|door|glass/.test(hay)) return Box;
  if (/fan|blower/.test(hay)) return Fan;
  if (/safety|ppe|helmet|glove/.test(hay)) return Shield;
  if (/tool|equipment|hardware|fastener/.test(hay)) return Box;
  if (/wheel/.test(hay)) return Car;
  return Box;
}

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
          data?: { filters?: FilterDef[] | { filters?: FilterDef[] } };
        };
        const cJson = (await cRes.json()) as {
          ok?: boolean;
          data?: { categories?: Category[] };
        };
        if (!cancelled) {
          const raw = fJson.data?.filters;
          const list = Array.isArray(raw)
            ? raw
            : raw && typeof raw === "object" && Array.isArray(raw.filters)
              ? raw.filters
              : [];
          setDefs(list);
          setCats(
            Array.isArray(cJson.data?.categories) ? cJson.data.categories : []
          );
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

  const safeDefs = Array.isArray(defs) ? defs : [];
  const hasAvailability = safeDefs.some((d) => d.kind === "availability");
  const hasPrice = safeDefs.some((d) => d.kind === "price");
  const attrDefs = safeDefs.filter(
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

  const activeBox = isLight ? "bg-white text-slate-900 shadow-sm" : "bg-[#3d3d3d] text-white";
  const inactiveBox = isLight
    ? "bg-transparent text-slate-800"
    : "bg-transparent text-[#d0d0d0]";
  const subMuted = isLight ? "text-slate-500" : "text-white/50";

  const tile = (active: boolean) =>
    cn(
      "flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-lg border-0 px-1 py-2 transition-colors",
      active ? activeBox : inactiveBox
    );

  const iconCls = (active: boolean) =>
    cn(
      "h-5 w-5",
      active
        ? "text-[#FF6B35]"
        : isLight
          ? "text-slate-700"
          : "text-[#d0d0d0]"
    );

  const labelCls = (active: boolean) =>
    cn(
      "whitespace-normal text-center text-[9px] font-bold leading-tight",
      active ? undefined : subMuted
    );

  return (
    <div className="px-3 py-1">
      <div
        className={cn(
          "flex flex-wrap items-stretch gap-1 rounded-xl p-1",
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
            className={tile(filters.availability === "in_stock")}
          >
            <PackageCheck
              className={cn(
                iconCls(filters.availability === "in_stock"),
                filters.availability === "in_stock" && "text-emerald-500"
              )}
            />
            <span className={labelCls(filters.availability === "in_stock")}>
              In stock
            </span>
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
            className={tile(
              filters.minPriceMinor != null ||
                filters.maxPriceMinor != null ||
                priceOpen
            )}
          >
            <Wallet className={iconCls(filters.minPriceMinor != null || filters.maxPriceMinor != null || priceOpen)} />
            <span
              className={labelCls(
                filters.minPriceMinor != null ||
                  filters.maxPriceMinor != null ||
                  priceOpen
              )}
            >
              Price
            </span>
          </button>
        ) : null}

        {cats.map((c) => {
          const active = filters.categorySlug === c.slug;
          const Icon = iconForName(c.name);
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
              className={tile(active)}
            >
              <span className="relative">
                <Icon className={iconCls(active)} />
                {c.productCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#FF6B35] px-1 text-[8px] font-black leading-3 text-white">
                    {c.productCount}
                  </span>
                ) : null}
              </span>
              <span className={labelCls(active)}>{c.name}</span>
            </button>
          );
        })}

        {attrDefs.map((d) => {
          const Icon = iconForName(d.label);
          return (d.options ?? []).map((opt) => {
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
                className={tile(active)}
              >
                <Icon className={iconCls(active)} />
                <span className={labelCls(active)}>
                  {d.label}: {opt}
                </span>
              </button>
            );
          });
        })}

        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className={cn(
              "flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-lg border-0 px-2 py-2 text-[9px] font-black text-[#FF6B35] hover:text-[#FF6B35]/80"
            )}
          >
            <Tags className={cn("h-5 w-5", iconCls(true), "!text-[#FF6B35]")} />
            Clear
          </button>
        ) : null}
      </div>

      {hasPrice && priceOpen ? (
        <div
          className={cn(
            "mt-2 flex items-center gap-2 rounded-xl px-2 py-2",
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
          <span className={subMuted}>–</span>
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