"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { shopAddToCart } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function ShopProductPage() {
  const params = useParams();
  const slug = String(params.slug || "");
  const router = useRouter();
  const { theme, accountType, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const ctx =
    accountType === "professional" ? "professional" : "motorist";
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Record<string, unknown> | null>(null);
  const [variants, setVariants] = useState<Record<string, unknown>[]>([]);
  const [prices, setPrices] = useState<Record<string, unknown>[]>([]);
  const [images, setImages] = useState<Array<{ url: string; alt_text?: string }>>(
    []
  );
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/shop/products/${encodeURIComponent(slug)}?ctx=${encodeURIComponent(ctx)}`
        );
        const json = (await res.json()) as {
          ok?: boolean;
          data?: {
            product?: Record<string, unknown>;
            variants?: Record<string, unknown>[];
            prices?: Record<string, unknown>[];
            images?: Array<{ url: string; alt_text?: string }>;
          };
        };
        if (!cancelled && json.ok && json.data) {
          setProduct(json.data.product ?? null);
          setVariants(json.data.variants ?? []);
          setPrices(json.data.prices ?? []);
          setImages(json.data.images ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, ctx]);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const price = prices[0]
    ? `₦${Math.round(Number(prices[0].amount_minor) / 100).toLocaleString("en-NG")}`
    : "—";

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
                <img
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
                  <img
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
            <p className="mt-3 text-[22px] font-black text-[#FF6B35]">{price}</p>
            {product.description ? (
              <p className={cn("mt-3 text-[13px] leading-relaxed", muted)}>
                {String(product.description)}
              </p>
            ) : null}
            {variants[0] ? (
              <p className={cn("mt-2 text-[11px] font-semibold", muted)}>
                SKU {String(variants[0].sku)}
                {variants[0].oem_number
                  ? ` · OEM ${String(variants[0].oem_number)}`
                  : ""}
              </p>
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
              disabled={adding || !variants[0]}
              onClick={async () => {
                if (!isAuthenticated) {
                  router.push("/login");
                  return;
                }
                const vid = String(variants[0]?.id || "");
                if (!vid) return;
                setAdding(true);
                setMsg(null);
                try {
                  await shopAddToCart({
                    variantId: vid,
                    qty: 1,
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
              Add to cart
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
