"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import type { CartView } from "@/lib/server/shop/cart";
import { shopCheckout, shopGetCart } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function formatNgn(minor: number): string {
  return `₦${Math.round(minor / 100).toLocaleString("en-NG")}`;
}

export default function ShopCheckoutPage() {
  const { theme, accountType, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const ctx =
    accountType === "professional" ? "professional" : "motorist";
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await shopGetCart(ctx);
      setCart(data.cart);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [ctx, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const deliveryFee = 1500_00;
  const total =
    (cart?.subtotalMinor ?? 0) + (cart && cart.items.length ? deliveryFee : 0);

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      const data = await shopCheckout({
        accountContext: ctx,
        notes: undefined,
      });
      if (data.payment.authorizationUrl) {
        window.location.href = data.payment.authorizationUrl;
        return;
      }
      // Mock provider may return empty URL — verify immediately with ref
      if (data.payment.provider === "mock" && data.payment.reference) {
        router.push(
          `/shop/checkout/callback?ref=${encodeURIComponent(
            data.payment.reference
          )}&order=${encodeURIComponent(data.orderId)}`
        );
        return;
      }
      setError("No payment URL returned. Check Flutterwave keys.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setPaying(false);
    }
  };

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white/90 text-slate-900" : "bg-[#1c1c1e] text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader title="Checkout" backHref="/shop/cart" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-2">
        {!isAuthenticated ? (
          <p className={cn("py-10 text-center text-[13px]", muted)}>
            Sign in to checkout.
          </p>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <p className={cn("py-10 text-center text-[13px]", muted)}>
            Cart is empty.
          </p>
        ) : (
          <>
            <div className={cn("rounded-xl p-3", card)}>
              <p className="text-[13px] font-black">Order summary</p>
              <ul className="mt-2 space-y-1.5">
                {cart.items.map((l) => (
                  <li
                    key={l.id}
                    className="flex justify-between text-[12px] font-medium"
                  >
                    <span className="min-w-0 flex-1 truncate pr-2">
                      {l.qty}× {l.productName}
                    </span>
                    <span>{formatNgn(l.lineTotalMinor)}</span>
                  </li>
                ))}
              </ul>
              <div className={cn("mt-3 space-y-1 border-t pt-2 text-[12px]", isLight ? "border-black/10" : "border-white/10")}>
                <div className="flex justify-between">
                  <span className={muted}>Subtotal</span>
                  <span>{formatNgn(cart.subtotalMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={muted}>Delivery (est.)</span>
                  <span>{formatNgn(deliveryFee)}</span>
                </div>
                <div className="flex justify-between text-[14px] font-black">
                  <span>Total</span>
                  <span className="text-[#FF6B35]">{formatNgn(total)}</span>
                </div>
              </div>
            </div>
            <p className={cn("mt-3 text-[11px] leading-relaxed", muted)}>
              Pay now to Ona Shop (retail). This is not job escrow — no Repair
              Pro hold/release. Stock is reserved after successful payment.
            </p>
            {error ? (
              <p className="mt-2 text-[12px] font-semibold text-red-500">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
      {cart && cart.items.length > 0 ? (
        <div className="absolute inset-x-0 bottom-0 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={paying}
            onClick={() => void pay()}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-0 bg-[#FF6B35] text-[14px] font-bold text-white"
          >
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Pay {formatNgn(total)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
