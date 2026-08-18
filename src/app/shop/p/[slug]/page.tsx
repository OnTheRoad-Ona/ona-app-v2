"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { detectCurrency, formatMoney, fromMinorUnits } from "@/lib/pricing";
import { shopAddToCart } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Variant = {
  id: string;
  sku: string;
  mpn?: string | null;
  oem_number?: string | null;
  title?: string;
  option_label?: string | null;
  stock_available?: number;
};

type Price = {
  variant_id: string;
  amount_minor: number;
  compare_at_minor?: number | null;
};

function formatPrice(minor: number): string {
  return formatMoney(fromMinorUnits(minor, "NGN"), detectCurrency());
}

export default function ShopProductPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const router = useRouter();
  const { theme, accountType, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Record<string, unknown> | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [images, setImages] = useState<Array<{ url: string; alt_text?: string }>>(
    []
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/shop/products/${encodeURIComponent(slug)}?ctx=${encodeURIComponent(
            accountType === "professional" ? "professional" : "motorist"
          )}`
        );
        const json = (await res.json()) as {
          ok?: boolean;
          data?: {
            product?: Record<string, unknown>;
            variants?: Variant[];
            prices?: Price[];
            images?: Array<{ url: string; alt_text?: string }>;
          };
        };
        if (!cancelled && json.ok && json.data) {
          setProduct(json.data.product ?? null);
          setVariants(json.data.variants ?? []);
          setPrices(json.data.prices ?? []);
          setImages(json.data.images ?? []);
          const first = json.data.variants?.find(
            (v) => Number(v.stock_available ?? 0) > 0
          )?.id;
          setSelectedVariantId(
            (first ?? json.data.variants?.[0]?.id) || null
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, accountType]);

  const priceFor = useCallback(
    (variantId: string | null): Price | undefined =>
      prices.find((p) => p.variant_id === variantId),
    [prices]
  );

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? null,
    [variants, selectedVariantId]
  );
  const selectedPrice = priceFor(selectedVariantId);
  const available = Number(selectedVariant?.stock_available ?? 0);
  const outOfStock = !selectedVariant || available <= 0;

  const clampQty = useCallback((n: number) => {
    const max = Math.max(1, Math.min(99, available));
    return Math.max(1, Math.min(max, n));
  }, [available]);

  useEffect(() => {
    if (!selectedVariantId) return;
    setQty((q) => (available > 0 ? clampQty(q) : 1));
  }, [selectedVariantId, available, clampQty]);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const border = isLight ? "border-black/10" : "border-white/10";
  const price = selectedPrice
    ? formatPrice(selectedPrice.amount_minor)
    : "—";
  const compareAt = selectedPrice?.compare_at_minor
    ? formatPrice(selectedPrice.compare_at_minor)
    : null;

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader
        title={product ? String(product.name) : "Product"}
        backHref="/shop"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
          </div>
        ) : !product ? (
          <p className={cn("text-center text-[13px]", muted)}>
            Product not found.
          </p>
        ) : (
          <>
            <div
              className={cn(
                "flex h-44 items-center justify-center overflow-hidden rounded-2xl",
                isLight ? "bg-white/90" : "bg-[#1c1c1e]"
              )}
            >
              {images[0]?.url || product.primary_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async"
                  src={String(images[0]?.url || product.primary_image_url)}
                  alt={String(product.name)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ShoppingBag className="h-12 w-12 text-[#FF6B35]" />
              )}
            </div>
            {images.length > 1 ? (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async"
                    key={`${img.url}-${i}`}
                    src={img.url}
                    alt=""
                    className={cn(
                      "h-14 w-14 shrink-0 rounded-lg object-cover",
                      isLight ? "bg-white" : "bg-[#1c1c1e]"
                    )}
                  />
                ))}
              </div>
            ) : null}
            <h1 className="mt-3 text-[18px] font-black leading-tight">
              {String(product.name)}
            </h1>
            {product.subtitle ? (
              <p className={cn("mt-1 text-[13px]", muted)}>
                {String(product.subtitle)}
              </p>
            ) : null}
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-[22px] font-black text-[#FF6B35]">{price}</p>
              {compareAt ? (
                <p className={cn("text-[13px] font-semibold line-through", muted)}>
                  {compareAt}
                </p>
              ) : null}
            </div>
            {product.description ? (
              <p className={cn("mt-3 text-[13px] leading-relaxed", muted)}>
                {String(product.description)}
              </p>
            ) : null}

            {/* Variant selector */}
            {variants.length > 1 ? (
              <div className={cn("mt-3 border-t pt-3", border)}>
                <p className="text-[12px] font-bold">Options</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {variants.map((v) => {
                    const vAvail = Number(v.stock_available ?? 0);
                    const vPrice = priceFor(v.id);
                    const soldOut = vAvail <= 0;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => {
                          setSelectedVariantId(v.id);
                          setMsg(null);
                        }}
                        className={cn(
                          "rounded-lg border px-2.5 py-1.5 text-left disabled:opacity-40",
                          selectedVariantId === v.id
                            ? "border-[#FF6B35] bg-[#FF6B35]/10"
                            : border
                        )}
                      >
                        <span className="block text-[12px] font-bold">
                          {v.option_label || v.title || v.sku}
                        </span>
                        <span className={cn("block text-[11px]", muted)}>
                          {vPrice ? formatPrice(vPrice.amount_minor) : "—"}
                          {soldOut ? " · Sold out" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {selectedVariant ? (
              <p className={cn("mt-2 text-[11px] font-semibold", muted)}>
                SKU {selectedVariant.sku}
                {selectedVariant.oem_number
                  ? ` · OEM ${String(selectedVariant.oem_number)}`
                  : ""}
                {selectedVariant.mpn
                  ? ` · MPN ${String(selectedVariant.mpn)}`
                  : ""}
              </p>
            ) : null}

            {/* Quantity selector */}
            {!outOfStock ? (
              <div
                className={cn(
                  "mt-3 flex items-center justify-between rounded-xl p-2.5",
                  isLight ? "bg-white/90" : "bg-[#1c1c1e]"
                )}
              >
                <span className="text-[12px] font-bold">Quantity</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty((q) => clampQty(q - 1))}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg border-0 text-[14px] font-bold",
                      isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
                    )}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-6 text-center text-[14px] font-black">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => clampQty(q + 1))}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg border-0 text-[14px] font-bold",
                      isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}

            {msg ? (
              <p
                className={cn(
                  "mt-3 text-center text-[12px] font-semibold",
                  msg.includes("Added") ? "text-emerald-600" : "text-red-500"
                )}
              >
                {msg}
              </p>
            ) : null}
            <button
              type="button"
              disabled={adding || outOfStock}
              onClick={async () => {
                if (!isAuthenticated) {
                  router.push("/login");
                  return;
                }
                if (!selectedVariant) return;
                setAdding(true);
                setMsg(null);
                try {
                  await shopAddToCart({
                    variantId: selectedVariant.id,
                    qty,
                    accountContext:
                      accountType === "professional"
                        ? "professional"
                        : "motorist",
                  });
                  setMsg("Added to cart");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Could not add");
                } finally {
                  setAdding(false);
                }
              }}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-0 bg-[#FF6B35] text-[14px] font-bold text-white disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {outOfStock ? "Out of stock" : `Add ${qty} to cart`}
            </button>
            <button
              type="button"
              onClick={() => router.push("/shop/cart")}
              className={cn(
                "mt-2 h-11 w-full rounded-xl border-0 text-[13px] font-bold",
                isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
              )}
            >
              View cart
            </button>
          </>
        )}
      </div>
    </div>
  );
}
