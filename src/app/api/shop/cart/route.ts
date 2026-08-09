import { NextRequest } from "next/server";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  addToCart,
  getOrCreateCart,
  removeCartItem,
  updateCartItem,
} from "@/lib/server/shop/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const ctx =
      req.nextUrl.searchParams.get("context") === "professional"
        ? "professional"
        : "motorist";
    const cart = await getOrCreateCart(auth.userId, ctx);
    return apiOk({ cart });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cart failed";
    return apiFail(msg, 500, "SHOP_CART_ERROR");
  }
}

const postSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(99).optional(),
  accountContext: z.enum(["motorist", "professional"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");
    const cart = await addToCart({
      userId: auth.userId,
      variantId: parsed.data.variantId,
      qty: parsed.data.qty,
      accountContext: parsed.data.accountContext,
    });
    return apiOk({ cart });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Add failed";
    const status = /stock|available|price/i.test(msg) ? 400 : 500;
    return apiFail(msg, status, "SHOP_CART_ADD_ERROR");
  }
}

const patchSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().int().min(0).max(99),
});

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");
    const cart = await updateCartItem({
      userId: auth.userId,
      itemId: parsed.data.itemId,
      qty: parsed.data.qty,
    });
    return apiOk({ cart });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return apiFail(msg, /Forbidden|stock|available/i.test(msg) ? 400 : 500);
  }
}

const deleteSchema = z.object({
  itemId: z.string().uuid(),
});

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const parsed = deleteSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");
    const cart = await removeCartItem({
      userId: auth.userId,
      itemId: parsed.data.itemId,
    });
    return apiOk({ cart });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Remove failed";
    return apiFail(msg, 500);
  }
}
