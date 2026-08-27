"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { detectCurrency, formatMoney, fromMinorUnits } from "@/lib/pricing";
import type { CartView } from "@/lib/server/shop/cart";
import {
  shopGetCart,
  shopRemoveCartItem,
  shopUpdateCartItem,
} from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function formatPrice(minor: number): string {
  return formatMoney(fromMinorUnits(minor, "NGN"), detectCurrency());
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CartSheet({ open, onClose }: Props) {
  const { theme, accountType, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const ctx = accountType === "professional" ? "professional" : "motorist";
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated || !open) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await shopGetCart(ctx);
      setCart(data.cart);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load cart");
    } finally {
      setLoading(false);
    }
  }, [ctx, isAuthenticated, open]);

  useEffect(() => {
    void load();
  }, [load]);

  const muted = isLight ? "text-slate-600" : "text-white/55";
  const card = isLight ? "bg-black/[0.02] text-slate-900" : "bg-white/[0.02] text-white";
  const stepBtn = isLight ? "bg-black/[0.06]" : "bg-white/[0.08]";
  const accentText = isLight ? "text-[#E85A28]" : "text-[#FF6B35]";

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={60} growToPercent={85}>
      <div className="flex flex-col gap-2 pb-4">
        <h2 className="text-[14px] font-black tracking-tight">Cart</h2>
        {!isAuthenticated ? (
          <p className={cn("py-6 text-center text-[13px]", muted)}>Sign in to view your cart.</p>
        ) : loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className={cn("h-6 w-6 animate-spin", accentText)} />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-[13px] text-red-500">{error}</p>
        ) : !cart || cart.items.length === 0 ? (
          <div className="py-8 text-center">
            <ShoppingCart className={cn("mx-auto h-8 w-8", accentText)} />
            <p className={cn("mt-2 text-[13px]", muted)}>Your cart is empty.</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/shop");
              }}
              className="mt-4 rounded-xl border-0 bg-[#FF6B35] px-4 py-2 text-[13px] font-bold text-white"
            >
              Browse Shop
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {cart.items.map((line) => (
                <div key={line.id} className={cn("rounded-xl p-3", card)}>
                  <p className="text-[13px] font-bold leading-snug">{line.productName}</p>
                  <p className={cn("text-[11px]", muted)}>{line.sku}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className={cn("text-[14px] font-black", accentText)}>{formatPrice(line.lineTotalMinor)}</p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className={cn("flex h-8 w-8 items-center justify-center rounded-lg border-0", stepBtn)}
                        onClick={() => {
                          if (line.qty <= 1) {
                            setCart((c) => (c ? { ...c, items: c.items.filter((x) => x.id !== line.id) } : c));
                            void shopRemoveCartItem(line.id).then((d) => setCart(d.cart)).catch(() => void load());
                            return;
                          }
                          setCart((c) => (c ? { ...c, items: c.items.map((x) => (x.id === line.id ? { ...x, qty: x.qty - 1 } : x)) } : c));
                          shopUpdateCartItem(line.id, line.qty - 1)
                            .then((d) => setCart(d.cart))
                            .catch(() => {
                              setError("Update failed");
                              void load();
                            });
                        }}
                      >
                        {line.qty <= 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                      </button>
                      <span className="w-6 text-center text-[13px] font-bold">{line.qty}</span>
                      <button
                        type="button"
                        disabled={!line.inStock}
                        className={cn("flex h-8 w-8 items-center justify-center rounded-lg border-0", stepBtn)}
                        onClick={() => {
                          setCart((c) => (c ? { ...c, items: c.items.map((x) => (x.id === line.id ? { ...x, qty: x.qty + 1 } : x)) } : c));
                          shopUpdateCartItem(line.id, line.qty + 1)
                            .then((d) => setCart(d.cart))
                            .catch(() => {
                              setError("Update failed");
                              void load();
                            });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {!line.inStock ? <p className="mt-1 text-[11px] font-semibold text-red-500">Stock issue reduce qty or remove</p> : null}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={cn("text-[12px] font-semibold", muted)}>Subtotal ({cart.itemCount} items)</span>
              <span className="text-[16px] font-black text-[#FF6B35]">{formatPrice(cart.subtotalMinor)}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push("/shop/checkout");
              }}
              className="h-12 w-full rounded-xl border-0 bg-[#FF6B35] text-[14px] font-bold text-white"
            >
              Checkout
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
