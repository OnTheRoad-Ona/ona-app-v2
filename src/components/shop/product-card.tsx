"use client";

import { useState } from "react";
import { Loader2, Plus, ShoppingBag } from "lucide-react";
import { ProductSheet } from "@/components/shop/product-sheet";
import { detectCurrency, formatMoney, fromMinorUnits } from "@/lib/pricing";
import { shopAddToCart } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export type ShopCardProduct = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  fromPriceMinor: number | null;
  inStock: boolean;
  primaryImageUrl?: string | null;
  defaultVariantId?: string | null;
  fitmentBadge?: string | null;
  fitmentStatus?: string | null;
  tradeKey?: string | null;
};

type Props = {
  product: ShopCardProduct;
  qty?: number;
  onAdded?: () => void;
  /** Question-flow 2% tint (bg-black/[0.02] / bg-white/[0.02]) instead of the white/gray card. */
  tint?: boolean;
};

function formatPrice(minor: number | null): string {
  if (minor == null) return "—";
  return formatMoney(fromMinorUnits(minor, "NGN"), detectCurrency());
}

function fitmentBadge(status?: string | null, badge?: string | null): string | null {
  if (badge) return badge;
  if (!status || status === "unknown") return null;
  if (status === "direct_fit") return "Fits your vehicle";
  if (status === "compatible") return "Compatible";
  if (status === "conditional") return "Check fit";
  return null;
}

/** Compact market-style row: image left, name/price, "+" add button at far right. */
export function ShopProductCard({ product, qty = 1, onAdded, tint = false }: Props) {
  const { theme, isAuthenticated, accountType } = useApp();
  const isLight = theme === "light";
  const [adding, setAdding] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const inStock = Boolean(product.inStock);
  const canAdd = inStock && Boolean(product.defaultVariantId);
  const badge = fitmentBadge(product.fitmentStatus, product.fitmentBadge);

  const card = tint
    ? isLight
      ? "bg-black/[0.02] text-slate-900"
      : "bg-white/[0.02] text-white"
    : isLight
      ? "bg-white/90 text-slate-900"
      : "bg-[#1c1c1e] text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  const addToCart = async () => {
    if (!isAuthenticated) {
      setSheetOpen(true);
      return;
    }
    if (!product.defaultVariantId || adding) return;
    setAdding(true);
    try {
      await shopAddToCart({
        variantId: product.defaultVariantId,
        qty,
        accountContext:
          accountType === "professional" ? "professional" : "motorist",
      });
      onAdded?.();
    } catch {
      /* keep card usable */
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSheetOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSheetOpen(true);
          }
        }}
        className={cn(
          "relative flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 p-2.5 text-left",
          card
        )}
      >
        {/* Image left */}
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg",
            isLight ? "bg-black/5" : "bg-white/5"
          )}
        >
          {product.primaryImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.primaryImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ShoppingBag className="h-6 w-6 text-[#FF6B35]/80" />
          )}
        </div>

        {/* Name + price */}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[13px] font-bold leading-snug">
            {product.name}
          </p>
          {product.subtitle ? (
            <p className={cn("mt-0.5 line-clamp-1 text-[11px]", muted)}>
              {product.subtitle}
            </p>
          ) : null}
          {badge ? (
            <p className="mt-0.5 text-[10px] font-semibold text-emerald-600">
              {badge}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <p className="text-[14px] font-black text-[#FF6B35]">
              {formatPrice(product.fromPriceMinor)}
            </p>
            <p className={cn("text-[10px] font-semibold", muted)}>
              {inStock ? "In stock" : "Check availability"}
            </p>
          </div>
        </div>

        {/* Tiny add-to-cart icon at far right */}
        <button
          type="button"
          aria-label={canAdd ? "Add to cart" : "Out of stock"}
          disabled={!canAdd || adding}
          onClick={(e) => {
            e.stopPropagation();
            void addToCart();
          }}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 shadow-sm",
            canAdd
              ? "bg-[#FF6B35] text-white"
              : cn(
                  isLight ? "bg-black/10 text-slate-500" : "bg-black/25 text-white/60",
                  "disabled:opacity-60"
                )
          )}
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2.6} />
          )}
        </button>
      </div>

      <ProductSheet
        slug={sheetOpen ? product.slug : null}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}