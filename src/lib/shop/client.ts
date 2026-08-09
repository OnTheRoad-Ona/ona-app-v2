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

export async function shopGetCart(context: "motorist" | "professional" = "motorist") {
  const headers = await authHeadersGet();
  const res = await authFetch(
    `/api/shop/cart?context=${encodeURIComponent(context)}`,
    { headers }
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
  context: "motorist" | "professional" = "motorist"
) {
  const headers = await authHeadersGet();
  const res = await authFetch(
    `/api/shop/orders?ctx=${encodeURIComponent(context)}`,
    { headers }
  );
  return parseJson<{ orders: Array<Record<string, unknown>> }>(res);
}

export async function shopGetOrder(
  id: string,
  context: "motorist" | "professional" = "motorist"
) {
  const headers = await authHeadersGet();
  const res = await authFetch(
    `/api/shop/orders/${encodeURIComponent(id)}?ctx=${encodeURIComponent(context)}`,
    { headers }
  );
  return parseJson<{
    order: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
    delivery: Record<string, unknown> | null;
  }>(res);
}
