"use client";

import { authFetch, authHeaders, authHeadersGet } from "@/lib/api-auth-headers";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { message: string; code?: string } };

async function parseJson<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ApiOk<T> | ApiErr;
  if (!json || typeof json !== "object") {
    throw new Error("Invalid response");
  }
  if ("ok" in json && json.ok === false) {
    throw new Error(json.error?.message || "Request failed");
  }
  if ("ok" in json && json.ok === true) {
    return json.data;
  }
  throw new Error("Unexpected response");
}

export async function shopGetCart(
  context: "motorist" | "professional" = "motorist",
) {
  const headers = await authHeadersGet();
  const res = await authFetch(
    `/api/shop/cart?context=${encodeURIComponent(context)}`,
    { headers },
  );
  return parseJson<{ cart: import("@/lib/server/shop/cart").CartView }>(res);
}

export async function shopAddToCart(opts: {
  variantId: string;
  qty?: number;
  accountContext?: "motorist" | "professional";
}) {
  const headers = await authHeaders();
  const res = await authFetch("/api/shop/cart", {
    method: "POST",
    headers,
    body: JSON.stringify(opts),
  });
  return parseJson<{ cart: import("@/lib/server/shop/cart").CartView }>(res);
}


export async function shopRemoveCartItem(itemId: string) {
  const headers = await authHeaders();
  const res = await authFetch("/api/shop/cart", {
    method: "DELETE",
    headers,
    body: JSON.stringify({ itemId }),
  });
  return parseJson<{ cart: import("@/lib/server/shop/cart").CartView }>(res);
}

export async function shopUpdateCartItem(itemId: string, qty: number) {
  const headers = await authHeaders();
  const res = await authFetch("/api/shop/cart", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ itemId, qty }),
  });
  return parseJson<{ cart: import("@/lib/server/shop/cart").CartView }>(res);
}

export async function shopCheckout(opts: {
  accountContext?: "motorist" | "professional";
  addressId?: string | null;
  zoneCode?: string | null;
  notes?: string;
}) {
  const headers = await authHeaders();
  const res = await authFetch("/api/shop/checkout", {
    method: "POST",
    headers,
    body: JSON.stringify(opts),
  });
  return parseJson<{
    orderId: string;
    orderNumber: string;
    totalMinor: number;
    payment: {
      paymentId: string;
      reference: string;
      authorizationUrl: string;
      provider: string;
      amountMinor: number;
    };
    deliveryFeeMinor: number;
    subtotalMinor: number;
  }>(res);
}

export async function shopVerifyPayment(reference: string) {
  const headers = await authHeaders();
  const res = await authFetch("/api/shop/payments/verify", {
    method: "POST",
    headers,
    body: JSON.stringify({ reference }),
  });
  return parseJson<{
    success: boolean;
    orderId: string | null;
    alreadyPaid?: boolean;
  }>(res);
}

export async function shopListOrders(
  context: "motorist" | "professional" = "motorist",
) {
  const headers = await authHeadersGet();
  const res = await authFetch(
    `/api/shop/orders?ctx=${encodeURIComponent(context)}`,
    { headers },
  );
  return parseJson<{ orders: Array<Record<string, unknown>> }>(res);
}

export async function shopGetOrder(
  id: string,
  context: "motorist" | "professional" = "motorist",
) {
  const headers = await authHeadersGet();
  const res = await authFetch(
    `/api/shop/orders/${encodeURIComponent(id)}?ctx=${encodeURIComponent(context)}`,
    { headers },
  );
  return parseJson<{
    order: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
    delivery: Record<string, unknown> | null;
    payments: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
  }>(res);
}

export type SavedAddress = {
  id: string;
  label: string;
  address_text: string;
  delivery_zone_code: string | null;
  is_default: boolean;
};

export async function shopListAddresses(
  userId: string,
): Promise<SavedAddress[]> {
  const headers = await authHeadersGet();
  const res = await authFetch(
    `/api/addresses?userId=${encodeURIComponent(userId)}`,
    { headers },
  );
  const data = await parseJson<{ addresses: SavedAddress[] }>(res);
  return data.addresses;
}

export async function shopCreateAddress(opts: {
  userId: string;
  label: string;
  addressText: string;
  isDefault?: boolean;
}): Promise<SavedAddress> {
  const headers = await authHeaders();
  const res = await authFetch("/api/addresses", {
    method: "POST",
    headers,
    body: JSON.stringify(opts),
  });
  const data = await parseJson<{ address: SavedAddress }>(res);
  return data.address;
}

export type DeliveryEstimateView = {
  estimate: {
    deliveryFeeMinor: number;
    zoneCode: string;
    zoneName: string;
    serviceCode: string;
    serviceName: string;
    etaMinutesMin: number;
    etaMinutesMax: number;
    freeDelivery: boolean;
  };
  zones: Array<{ code: string; name: string }>;
};

export async function shopEstimateDelivery(opts: {
  addressId: string;
  subtotalMinor: number;
  zoneCode?: string | null;
}): Promise<DeliveryEstimateView> {
  const headers = await authHeadersGet();
  const params = new URLSearchParams({
    addressId: opts.addressId,
    subtotalMinor: String(opts.subtotalMinor),
  });
  if (opts.zoneCode) params.set("zoneCode", opts.zoneCode);
  const res = await authFetch(
    `/api/shop/delivery/estimate?${params.toString()}`,
    { headers },
  );
  return parseJson<DeliveryEstimateView>(res);
}
