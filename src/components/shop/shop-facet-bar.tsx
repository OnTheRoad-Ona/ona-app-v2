"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export type FacetFilters = {
  categorySlug?: string | null;
  availability?: "in_stock" | "all";
  minPriceMinor?: number | null;
  maxPriceMinor?: number | null;
  attributes: Record<string, string | number | boolean>;
};

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

type Category = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
};

type Props = {
  tradeKey: string;
  filters: FacetFilters;
  onChange: (next: FacetFilters) => void;
};

export function ShopFacetBar({ tradeKey, filters, onChange }: Props) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const [defs, setDefs] = useState<FilterDef[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fRes, cRes] = await Promise.all([
          fetch(`/api/shop/filters?trade=${encodeURIComponent(tradeKey)}`),
          fetch(
            `/api/shop/categories?trade=${encodeURIComponent(tradeKey)}&roots=1`,
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
            Array.isArray(cJson.data?.categories) ? cJson.data.categories : [],
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

  const activeCount =
    (filters.availability === "in_stock" ? 1 : 0) +
    (filters.categorySlug ? 1 : 0) +
    (filters.minPriceMinor != null ? 1 : 0) +
    (filters.maxPriceMinor != null ? 1 : 0) +
    Object.values(filters.attributes).filter((v) => v !== "" && v != null)
      .length;

  const clearAll = () => {
    setMinInput("");
    setMaxInput("");
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
  };

  const safeDefs = Array.isArray(defs) ? defs : [];
  const attrDefs = safeDefs.filter(
    (d): d is Extract<FilterDef, { kind: "attribute" }> =>
      d.kind === "attribute" &&
      (d.key === "vehicleMake" || d.key === "vehicleModel"),
  );
  const hasPrice = safeDefs.some((d) => d.kind === "price");
  const hasCategory = cats.length > 0;
  const hasAvailability = safeDefs.some((d) => d.kind === "availability");

  if (!hasPrice && !hasCategory && !hasAvailability && attrDefs.length === 0) {
    return null;
  }

  const muted = isLight ? "text-slate-600" : "text-white/55";
  const border = isLight ? "border-black/10" : "border-white/10";

  return (
    <div className={cn("px-3 pt-2", border)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 border-0 bg-transparent text-[12px] font-bold"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#FF6B35]" />
          Filters
          {activeCount > 0 ? (
            <span className="rounded-full bg-[#FF6B35] px-1.5 py-0.5 text-[10px] font-black text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="border-0 bg-transparent text-[11px] font-semibold text-[#FF6B35]"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 space-y-3 border-t pt-2">
          {hasAvailability ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    availability:
                      filters.availability === "in_stock" ? "all" : "in_stock",
                  })
                }
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[12px] font-bold",
                  filters.availability === "in_stock"
                    ? "border-[#FF6B35] bg-[#FF6B35]/10 text-[#FF6B35]"
                    : border,
                )}
              >
                In stock only
              </button>
            </div>
          ) : null}

          {hasPrice ? (
            <div>
              <p className="text-[12px] font-bold">Price (₦)</p>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={minInput}
                  onChange={(e) =>
                    setMinInput(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="Min"
                  className={cn(
                    "h-9 w-full flex-1 rounded-lg border-0 px-3 text-[12px] outline-none",
                    isLight
                      ? "bg-black/5 text-slate-900"
                      : "bg-white/10 text-white",
                  )}
                />
                <span className={muted}>-</span>
                <input
                  inputMode="numeric"
                  value={maxInput}
                  onChange={(e) =>
                    setMaxInput(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="Max"
                  className={cn(
                    "h-9 w-full flex-1 rounded-lg border-0 px-3 text-[12px] outline-none",
                    isLight
                      ? "bg-black/5 text-slate-900"
                      : "bg-white/10 text-white",
                  )}
                />
                <button
                  type="button"
                  onClick={applyPrice}
                  className="h-9 rounded-lg border-0 bg-[#FF6B35] px-3 text-[12px] font-bold text-white"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : null}

          {hasCategory ? (
            <div>
              <p className="text-[12px] font-bold">Category</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...filters,
                        categorySlug:
                          filters.categorySlug === c.slug ? null : c.slug,
                      })
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                      filters.categorySlug === c.slug
                        ? "border-[#FF6B35] bg-[#FF6B35]/15 text-[#FF6B35]"
                        : border,
                    )}
                  >
                    {c.name}
                    <span
                      className={cn("ml-1 text-[10px] font-semibold", muted)}
                    >
                      {c.productCount}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {attrDefs.map((d) => {
            if (d.type !== "enum" || !d.options?.length) return null;
            return (
              <div key={d.key}>
                <p className="text-[12px] font-bold">{d.label}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {d.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...filters,
                          attributes: {
                            ...filters.attributes,
                            [d.key]:
                              filters.attributes[d.key] === opt ? "" : opt,
                          },
                        })
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                        filters.attributes[d.key] === opt
                          ? "border-[#FF6B35] bg-[#FF6B35]/15 text-[#FF6B35]"
                          : border,
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
