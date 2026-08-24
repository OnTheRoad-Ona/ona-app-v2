/**
 * Server-authoritative shop cart. Never trust client totals.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import type { ShopAccountContext } from "@/lib/server/shop/types";

export type CartLine = {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantTitle: string;
  sku: string;
  qty: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  inStock: boolean;
  availableQty: number;
};

export type CartView = {
  id: string;
  userId: string;
  accountContext: ShopAccountContext;
  currency: string;
  items: CartLine[];
  subtotalMinor: number;
  itemCount: number;
};

async function activePriceMinor(
  sb: ReturnType<typeof createServiceSupabase>,
  variantId: string,
): Promise<number> {
  const { data } = await sb
    .from("shop_prices")
    .select("amount_minor")
    .eq("variant_id", variantId)
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.amount_minor ?? 0);
}

async function availableQty(
  sb: ReturnType<typeof createServiceSupabase>,
  variantId: string,
): Promise<number> {
  const { data } = await sb
    .from("shop_inventory")
    .select("qty_on_hand, qty_reserved")
    .eq("variant_id", variantId);
  let total = 0;
  for (const row of data ?? []) {
    total += Number(row.qty_on_hand ?? 0) - Number(row.qty_reserved ?? 0);
  }
  return Math.max(0, total);
}

export async function getOrCreateCart(
  userId: string,
  accountContext: ShopAccountContext = "motorist",
): Promise<CartView> {
  const sb = createServiceSupabase();
  const { data: existing } = await sb
    .from("shop_carts")
    .select("id, user_id, account_context, currency, status")
    .eq("user_id", userId)
    .eq("account_context", accountContext)
    .eq("status", "open")
    .maybeSingle();

  let cartId = existing?.id as string | undefined;
  if (!cartId) {
    const { data: created, error } = await sb
      .from("shop_carts")
      .insert({
        user_id: userId,
        account_context: accountContext,
        currency: "NGN",
        status: "open",
      })
      .select("id, user_id, account_context, currency")
      .single();
    if (error) throw new Error(error.message);
    cartId = String(created.id);
  }

  return loadCart(String(cartId));
}

export async function loadCart(cartId: string): Promise<CartView> {
  const sb = createServiceSupabase();
  const { data: cart, error } = await sb
    .from("shop_carts")
    .select("*")
    .eq("id", cartId)
    .single();
  if (error || !cart) throw new Error(error?.message || "Cart not found");

  const { data: items } = await sb
    .from("shop_cart_items")
    .select("*")
    .eq("cart_id", cartId);

  const lines: CartLine[] = [];
  for (const it of items ?? []) {
    const variantId = String(it.variant_id);
    const { data: variant } = await sb
      .from("shop_product_variants")
      .select("id, product_id, sku, title")
      .eq("id", variantId)
      .maybeSingle();
    if (!variant) continue;
    const { data: product } = await sb
      .from("shop_products")
      .select("id, name, slug")
      .eq("id", variant.product_id)
      .maybeSingle();

    const unit = await activePriceMinor(sb, variantId);
    const qty = Number(it.qty);
    const avail = await availableQty(sb, variantId);
    lines.push({
      id: String(it.id),
      variantId,
      productId: String(variant.product_id),
      productName: String(product?.name ?? "Product"),
      productSlug: String(product?.slug ?? ""),
      variantTitle: String(variant.title ?? ""),
      sku: String(variant.sku ?? ""),
      qty,
      unitPriceMinor: unit,
      lineTotalMinor: unit * qty,
      inStock: avail >= qty,
      availableQty: avail,
    });
  }

  const subtotalMinor = lines.reduce((s, l) => s + l.lineTotalMinor, 0);
  return {
    id: String(cart.id),
    userId: String(cart.user_id),
    accountContext: cart.account_context as ShopAccountContext,
    currency: String(cart.currency || "NGN"),
    items: lines,
    subtotalMinor,
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
  };
}

export async function addToCart(opts: {
  userId: string;
  accountContext?: ShopAccountContext;
  variantId: string;
  qty?: number;
}): Promise<CartView> {
  const qty = Math.max(1, Math.min(opts.qty ?? 1, 99));
  const sb = createServiceSupabase();
  const cart = await getOrCreateCart(
    opts.userId,
    opts.accountContext ?? "motorist",
  );

  const avail = await availableQty(sb, opts.variantId);
  if (avail < qty) {
    throw new Error(
      avail <= 0 ? "This item is out of stock" : `Only ${avail} available`,
    );
  }

  const unit = await activePriceMinor(sb, opts.variantId);
  if (unit <= 0) throw new Error("Product has no active price");

  const { data: existing } = await sb
    .from("shop_cart_items")
    .select("id, qty")
    .eq("cart_id", cart.id)
    .eq("variant_id", opts.variantId)
    .maybeSingle();

  if (existing) {
    const nextQty = Number(existing.qty) + qty;
    if (nextQty > avail) {
      throw new Error(`Only ${avail} available`);
    }
    const { error } = await sb
      .from("shop_cart_items")
      .update({
        qty: nextQty,
        unit_price_minor: unit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from("shop_cart_items").insert({
      cart_id: cart.id,
      variant_id: opts.variantId,
      qty,
      unit_price_minor: unit,
    });
    if (error) throw new Error(error.message);
  }

  await sb
    .from("shop_carts")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", cart.id);

  return loadCart(cart.id);
}

export async function updateCartItem(opts: {
  userId: string;
  itemId: string;
  qty: number;
}): Promise<CartView> {
  const sb = createServiceSupabase();
  const { data: item } = await sb
    .from("shop_cart_items")
    .select("id, cart_id, variant_id, qty")
    .eq("id", opts.itemId)
    .maybeSingle();
  if (!item) throw new Error("Cart item not found");

  const cart = await loadCart(String(item.cart_id));
  if (cart.userId !== opts.userId) throw new Error("Forbidden");

  if (opts.qty <= 0) {
    await sb.from("shop_cart_items").delete().eq("id", opts.itemId);
    return loadCart(cart.id);
  }

  const avail = await availableQty(sb, String(item.variant_id));
  if (opts.qty > avail) throw new Error(`Only ${avail} available`);

  const unit = await activePriceMinor(sb, String(item.variant_id));
  const { error } = await sb
    .from("shop_cart_items")
    .update({
      qty: opts.qty,
      unit_price_minor: unit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.itemId);
  if (error) throw new Error(error.message);

  return loadCart(cart.id);
}

export async function removeCartItem(opts: {
  userId: string;
  itemId: string;
}): Promise<CartView> {
  return updateCartItem({ ...opts, qty: 0 });
}

export async function clearCart(cartId: string, userId: string): Promise<void> {
  const cart = await loadCart(cartId);
  if (cart.userId !== userId) throw new Error("Forbidden");
  const sb = createServiceSupabase();
  await sb.from("shop_cart_items").delete().eq("cart_id", cartId);
}

export function validateCartForCheckout(cart: CartView): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (cart.items.length === 0) errors.push("Cart is empty");
  for (const line of cart.items) {
    if (!line.inStock) {
      errors.push(`${line.productName} is out of stock`);
    }
    if (line.unitPriceMinor <= 0) {
      errors.push(`${line.productName} has no price`);
    }
  }
  return { ok: errors.length === 0, errors };
}
