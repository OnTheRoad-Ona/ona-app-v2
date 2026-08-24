"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2, Plus, ShoppingBag } from "lucide-react";
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
  vehicleTags?: string[];
  priceOnRequest?: boolean;
  stockLabel?: string;
  /** Exact sellable quantity from the backend */
  stockQty?: number;
};

type Props = {
  product: ShopCardProduct;
  qty?: number;
  onAdded?: () => void;
  /** Live quantity of this product already in the cart (drives the pill) */
  cartQty?: number;
  /** Fire immediately on tap for instant UI (server sync happens outside) */
  onOptimisticAdd?: () => void;
  /** Called if the background add fails so the optimistic UI can revert */
  onOptimisticRevert?: () => void;
  /** Question-flow 2% tint (bg-black/[0.02] / bg-white/[0.02]) instead of the white/gray card. */
  tint?: boolean;
};

function formatPrice(minor: number | null, priceOnRequest?: boolean): string {
  if (priceOnRequest) return "Contact for price";
  if (minor == null) return "";
  return formatMoney(fromMinorUnits(minor, "NGN"), detectCurrency());
}

function fitmentBadge(
  status?: string | null,
  badge?: string | null,
): string | null {
  if (badge) return badge;
  if (!status || status === "unknown") return null;
  if (status === "direct_fit") return "Fits your vehicle";
  if (status === "compatible") return "Compatible";
  if (status === "conditional") return "Check fit";
  return null;
}

/** Compact market-style row: image left, name/price, "+" add button at far right. */
export function ShopProductCard({
  product,
  qty = 1,
  onAdded,
  cartQty,
  onOptimisticAdd,
  onOptimisticRevert,
  tint = false,
}: Props) {
  const { theme, isAuthenticated, accountType } = useApp();
  const isLight = theme === "light";
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [addFailed, setAddFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const inStock = Boolean(product.inStock);
  const canAdd =
    inStock && Boolean(product.defaultVariantId) && !product.priceOnRequest;
  const stockLabel =
    product.stockLabel || (inStock ? "In Stock" : "Out of Stock");
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
    setAddFailed(false);
    onOptimisticAdd?.();
    try {
      const res = await shopAddToCart({
        variantId: product.defaultVariantId,
        qty,
        accountContext:
          accountType === "professional" ? "professional" : "motorist",
      });
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1500);
      onAdded?.();
      void res;
    } catch {
      onOptimisticRevert?.();
      setAddFailed(true);
      window.setTimeout(() => setAddFailed(false), 2000);
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
          card,
        )}
      >
        {/* Image left */}
        <div
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg",
            isLight ? "bg-black/5" : "bg-white/5",
          )}
        >
          {product.primaryImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
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
            {typeof cartQty === "number" && cartQty > 0 ? (
              <span
                className="mr-1.5"
                style={{ color: isLight ? "#475569" : "rgba(255,255,255,0.75)" }}
              >
                x{cartQty}
              </span>
            ) : null}
            {product.name}
          </p>
          {product.subtitle && product.subtitle !== "Fits most vehicles" ? (
            <p className={cn("mt-0.5 line-clamp-1 text-[11px]", muted)}>
              {product.subtitle}
            </p>
          ) : null}
          {product.vehicleTags && product.vehicleTags.length > 0 ? (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {product.vehicleTags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "rounded-full px-1.5 py-px text-[9px] font-semibold",
                    isLight
                      ? "bg-black/8 text-slate-700"
                      : "bg-white/10 text-white/80",
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {badge ? (
            <p className="mt-0.5 text-[10px] font-semibold text-emerald-600">
              {badge}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <p className="text-[14px] font-black text-[#FF6B35]">
              {formatPrice(product.fromPriceMinor, product.priceOnRequest)}
            </p>
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[9px] font-bold",
                inStock
                  ? "bg-emerald-500/15 text-emerald-700"
                  : isLight
                    ? "bg-black/10 text-slate-500"
                    : "bg-white/10 text-white/55",
              )}
            >
              {stockLabel}
            </span>
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
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-transparent transition-colors active:bg-black/[0.06]",
            justAdded
              ? "text-emerald-500"
              : addFailed
                ? "text-red-500"
                : canAdd
                  ? isLight
                    ? "text-[#E85A28]"
                    : "text-[#FF6B35]"
                  : cn(
                      isLight ? "text-slate-300" : "text-white/30",
                      "disabled:opacity-60",
                    ),
          )}
          title={
            justAdded
              ? "Added to cart"
              : addFailed
                ? "Could not add, tap again or reload"
                : canAdd
                  ? "Add to cart"
                  : "Out of stock"
          }
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin [animation-duration:0.6s]" />
          ) : justAdded ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : addFailed ? (
            <AlertCircle className="h-4 w-4" strokeWidth={2.6} />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2.6} />
          )}
        </button>
      </div>

      {justAdded ? (
        <div
          style={{
            position: "fixed",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            background: "#1f2937",
            color: "#fff",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />
          Added to cart
        </div>
      ) : null}
      <ProductSheet
        slug={sheetOpen ? product.slug : null}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
