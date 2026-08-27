"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ShoppingBag, X } from "lucide-react";
import { ProductSheet } from "@/components/shop/product-sheet";
import { detectCurrency, formatMoney, fromMinorUnits } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type ProductHit = {
  id: string;
  slug: string;
  name: string;
  fromPriceMinor: number | null;
  primaryImageUrl: string | null;
  inStock: boolean;
  vehicleTags?: string[];
  priceOnRequest?: boolean;
  stockLabel?: string;
};

type Recommendation = {
  id: string;
  productId: string;
  product: ProductHit | null;
};

type Props = {
  jobId: string;
  isLight: boolean;
  canEdit: boolean;
};

function priceLabel(p: ProductHit): string {
  if (p.priceOnRequest || p.fromPriceMinor == null) return "Contact for price";
  return formatMoney(fromMinorUnits(p.fromPriceMinor, "NGN"), detectCurrency());
}

export function JobShopRecommend({ jobId, isLight, canEdit }: Props) {
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const card = isLight
    ? "bg-black/[0.02] text-slate-900"
    : "bg-white/[0.02] text-white";
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(true);

  const loadRecs = useCallback(async () => {
    setLoadingRecs(true);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/recommendations`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { recommendations?: Recommendation[] };
      };
      if (json.ok) setRecs(json.data?.recommendations ?? []);
    } finally {
      setLoadingRecs(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadRecs();
  }, [loadRecs]);

  const runSearch = async () => {
    const query = q.trim();
    if (!query) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/recommendations?q=${encodeURIComponent(query)}`,
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { results?: ProductHit[] };
      };
      setHits(json.ok ? (json.data?.results ?? []) : []);
    } finally {
      setSearching(false);
    }
  };

  const recommend = async (productId: string) => {
    setBusyId(productId);
    try {
      await fetch(`/api/jobs/${encodeURIComponent(jobId)}/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      await loadRecs();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (recommendationId: string) => {
    setBusyId(recommendationId);
    try {
      await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/recommendations?recommendationId=${encodeURIComponent(recommendationId)}`,
        { method: "DELETE" },
      );
      await loadRecs();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={cn("rounded-xl p-3", card)}>
      <p className="text-[12px] font-black tracking-tight">Recommended parts</p>
      <p className={cn("mt-0.5 text-[11px]", muted)}>
        Linked to this repair request
      </p>

      {loadingRecs ? (
        <ul className="mt-2 space-y-1.5">
          {[0, 1].map((i) => (
            <li
              key={`sk-${i}`}
              className="flex items-center gap-2 rounded-lg bg-transparent px-2 py-1.5"
            >
              <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-black/10 dark:bg-white/10" />
              <span className="h-3 w-32 animate-pulse rounded bg-black/10 dark:bg-white/10" />
              <span className="ml-auto h-3 w-12 animate-pulse rounded bg-black/10 dark:bg-white/10" />
            </li>
          ))}
        </ul>
      ) : recs.length ? (
        <ul className="mt-2 space-y-1.5">
          {recs.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg bg-transparent px-2 py-1.5"
            >
              <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]" />
              <button
                type="button"
                onClick={() => {
                  if (r.product?.slug) setSelectedSlug(r.product.slug);
                }}
                className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-[#FF6B35]"
              >
                {r.product?.name || "Part"}
              </button>
              {r.product ? (
                <span className={cn("shrink-0 text-[10px] font-bold", muted)}>
                  {priceLabel(r.product)}
                </span>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  aria-label="Remove"
                  disabled={busyId === r.id}
                  onClick={() => void remove(r.id)}
                  className="border-0 bg-transparent p-0 text-slate-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn("mt-2 text-[11px] italic", muted)}>
          No parts recommended yet.
        </p>
      )}

      {canEdit ? (
        <div className="mt-2">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2 py-1.5",
              isLight ? "bg-black/[0.02]" : "bg-white/[0.02]",
            )}
          >
            <Search className="h-3.5 w-3.5 text-[#FF6B35]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="Search Shop by name or vehicle"
              className={cn(
                "min-w-0 flex-1 border-0 bg-transparent text-[12px] outline-none",
                isLight
                  ? "text-slate-900 placeholder:text-slate-400"
                  : "text-white placeholder:text-white/40",
              )}
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              className="border-0 bg-transparent text-[11px] font-bold text-[#FF6B35]"
            >
              {searching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Go"
              )}
            </button>
          </div>
          {hits.length ? (
            <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
              {hits.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-2 rounded-lg px-1 py-1"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedSlug(h.slug)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[12px] font-semibold">
                      {h.name}
                    </p>
                    <p className={cn("text-[10px]", muted)}>
                      {priceLabel(h)} ·{" "}
                      {h.stockLabel ||
                        (h.inStock ? "In Stock" : "Out of Stock")}
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={busyId === h.id}
                    onClick={() => void recommend(h.id)}
                    className="shrink-0 border-0 bg-transparent px-2 py-1 text-[10px] font-bold text-[#FF6B35] disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <ProductSheet slug={selectedSlug} onClose={() => setSelectedSlug(null)} />
    </div>
  );
}
