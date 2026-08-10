"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import type { CartView } from "@/lib/server/shop/cart";
import {
  shopCheckout,
  shopCreateAddress,
  shopEstimateDelivery,
  shopGetCart,
  shopListAddresses,
  type DeliveryEstimateView,
  type SavedAddress,
} from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function formatNgn(minor: number): string {
  return `₦${Math.round(minor / 100).toLocaleString("en-NG")}`;
}

export default function ShopCheckoutPage() {
  const { theme, accountType, isAuthenticated, backendUserId } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const ctx = accountType === "professional" ? "professional" : "motorist";
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [zoneCode, setZoneCode] = useState<string>("default");
  const [zones, setZones] = useState<Array<{ code: string; name: string }>>([]);
  const [estimate, setEstimate] = useState<DeliveryEstimateView["estimate"] | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddressText, setNewAddressText] = useState("");

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await shopGetCart(ctx);
      setCart(data.cart);
      if (backendUserId) {
        const addr = await shopListAddresses(backendUserId);
        setAddresses(addr);
        if (addr.length > 0) {
          setAddressId(addr.find((a) => a.is_default)?.id ?? addr[0].id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [ctx, isAuthenticated, backendUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const subtotalMinor = cart?.subtotalMinor ?? 0;
  const itemsCount = cart?.items.length ?? 0;

  const fetchEstimate = useCallback(
    async (aid: string | null, zone: string, subtotal: number) => {
      if (!aid) {
        setEstimate(null);
        return;
      }
      setEstimating(true);
      try {
        const view = await shopEstimateDelivery({
          addressId: aid,
          subtotalMinor: subtotal,
          zoneCode: zone,
        });
        setZones(view.zones);
        setEstimate(view.estimate);
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!addressId || !cart) return;
    void fetchEstimate(addressId, zoneCode, subtotalMinor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, zoneCode, cart, isAuthenticated]);

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === addressId) ?? null,
    [addresses, addressId]
  );

  const deliveryFeeMinor = estimate?.freeDelivery ? 0 : estimate?.deliveryFeeMinor ?? 0;
  const total = subtotalMinor + (itemsCount ? deliveryFeeMinor : 0);

  const createAddress = async () => {
    if (!backendUserId || !newAddressText.trim()) {
      setError("Enter an address to continue.");
      return;
    }
    setError(null);
    try {
      const created = await shopCreateAddress({
        userId: backendUserId,
        label: "Home",
        addressText: newAddressText.trim(),
        isDefault: addresses.length === 0,
      });
      const next = [created, ...addresses];
      setAddresses(next);
      setAddressId(created.id);
      setShowNewAddress(false);
      setNewAddressText("");
      setZoneCode("default");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save address");
    }
  };

  const pay = async () => {
    if (!addressId) {
      setError("Select or add a delivery address.");
      return;
    }
    if (!estimate) {
      setError("Computing delivery… try again.");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const data = await shopCheckout({
        accountContext: ctx,
        addressId,
        zoneCode,
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
  const border = isLight ? "border-black/10" : "border-white/10";

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
            {/* Delivery address */}
            <div className={cn("rounded-xl p-3", card)}>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-black">Delivery address</p>
                {!showNewAddress ? (
                  <button
                    type="button"
                    onClick={() => setShowNewAddress(true)}
                    className="inline-flex items-center gap-1 text-[12px] font-bold text-[#FF6B35]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add new
                  </button>
                ) : null}
              </div>

              {showNewAddress ? (
                <div className={cn("mt-2 space-y-2 border-t pt-2", border)}>
                  <input
                    value={newAddressText}
                    onChange={(e) => setNewAddressText(e.target.value)}
                    placeholder="Address text (e.g. 12 Admiralty Way, Lekki)"
                    className={cn(
                      "h-10 w-full rounded-lg border-0 px-3 text-[13px] outline-none",
                      isLight
                        ? "bg-black/5 text-slate-900"
                        : "bg-white/10 text-white"
                    )}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void createAddress()}
                      className="h-10 flex-1 rounded-lg border-0 bg-[#FF6B35] text-[12px] font-bold text-white"
                    >
                      Save address
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewAddress(false)}
                      className={cn(
                        "h-10 flex-1 rounded-lg border-0 text-[12px] font-bold",
                        isLight
                          ? "bg-black/10 text-slate-900"
                          : "bg-white/10 text-white"
                      )}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-2 space-y-1.5">
                {addresses.length === 0 ? (
                  <p className={cn("text-[12px]", muted)}>
                    No saved addresses yet.
                  </p>
                ) : (
                  addresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAddressId(a.id)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left",
                        addressId === a.id
                          ? "border-[#FF6B35] bg-[#FF6B35]/10"
                          : border
                      )}
                    >
                      <MapPin
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          addressId === a.id ? "text-[#FF6B35]" : muted
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-[12px] font-bold">
                          {a.label}
                          {a.is_default ? (
                            <span className={cn("ml-1 text-[10px] font-semibold", muted)}>
                              · Default
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "block truncate text-[11px] font-medium",
                            muted
                          )}
                        >
                          {a.address_text}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>

              {selectedAddress && zones.length > 0 ? (
                <div className={cn("mt-2 border-t pt-2", border)}>
                  <p className="text-[12px] font-bold">Delivery zone</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {zones.map((z) => (
                      <button
                        key={z.code}
                        type="button"
                        onClick={() => setZoneCode(z.code)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-bold",
                          zoneCode === z.code
                            ? "border-[#FF6B35] bg-[#FF6B35]/15 text-[#FF6B35]"
                            : border
                        )}
                      >
                        {z.name}
                      </button>
                    ))}
                  </div>
                  {estimating ? (
                    <p className={cn("mt-1.5 text-[11px]", muted)}>
                      Computing delivery…
                    </p>
                  ) : estimate ? (
                    <p className={cn("mt-1.5 text-[11px]", muted)}>
                      {estimate.freeDelivery
                        ? "Free delivery on this order."
                        : `Delivery fee ${formatNgn(estimate.deliveryFeeMinor)} · ${estimate.etaMinutesMin}–${estimate.etaMinutesMax} min via ${estimate.serviceName}.`}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Order summary */}
            <div className={cn("mt-2 rounded-xl p-3", card)}>
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
              <div
                className={cn(
                  "mt-3 space-y-1 border-t pt-2 text-[12px]",
                  border
                )}
              >
                <div className="flex justify-between">
                  <span className={muted}>Subtotal</span>
                  <span>{formatNgn(subtotalMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={muted}>Delivery</span>
                  <span>
                    {estimating ? (
                      "…"
                    ) : estimate?.freeDelivery ? (
                      "Free"
                    ) : (
                      formatNgn(deliveryFeeMinor)
                    )}
                  </span>
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
            disabled={paying || !addressId}
            onClick={() => void pay()}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-0 bg-[#FF6B35] text-[14px] font-bold text-white disabled:opacity-40"
          >
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {addressId
              ? `Pay ${formatNgn(total)}`
              : "Select a delivery address"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
