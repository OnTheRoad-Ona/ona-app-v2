import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  cancelUnpaidOrder,
  refundShopOrder,
} from "@/lib/server/shop/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["cancel", "refund"]),
  reason: z.string().max(300).optional().nullable(),
});

/** Admin order actions: cancel an unpaid order or refund a paid one. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");

    const sb = createServiceSupabase();
    const { data: order } = await sb
      .from("shop_orders")
      .select("id, user_id, status")
      .eq("id", id)
      .maybeSingle();
    if (!order) return apiFail("Order not found", 404, "not_found");

    const actorId = session?.userId || null;

    if (parsed.data.action === "cancel") {
      if (order.status !== "pending_payment") {
        return apiFail(
          `Only unpaid orders can be cancelled (status: ${order.status})`,
          400,
          "invalid_status"
        );
      }
      await cancelUnpaidOrder({
        orderId: id,
        userId: String(order.user_id),
      });
      return apiOk({ ok: true, action: "cancel" });
    }

    // refund
    if (order.status !== "paid" && order.status !== "fulfilling") {
      return apiFail(
        `Only paid orders can be refunded (status: ${order.status})`,
        400,
        "invalid_status"
      );
    }
    await refundShopOrder({
      orderId: id,
      actorId,
      reason: parsed.data.reason || "admin_refund",
    });
    return apiOk({ ok: true, action: "refund" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Order action failed";
    return apiFail(msg, 400, "SHOP_ADMIN_ORDER_ACTION_ERROR");
  }
}
