import { z } from "zod";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderId: z.string().uuid(),
  status: z
    .enum([
      "pending",
      "assigned",
      "picked_up",
      "in_transit",
      "delivered",
      "failed",
      "cancelled",
    ])
    .optional(),
  courierName: z.string().max(120).optional().nullable(),
  courierPhone: z.string().max(40).optional().nullable(),
  trackingCode: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

/** Assign courier / update shop delivery status. */
export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");

    const sb = createServiceSupabase();
    const b = parsed.data;

    const { data: existing } = await sb
      .from("shop_deliveries")
      .select("*")
      .eq("order_id", b.orderId)
      .maybeSingle();

    const nextStatus = b.status || existing?.status || "pending";
    const prevEvents = Array.isArray(existing?.events)
      ? (existing.events as unknown[])
      : [];
    const events = [
      ...prevEvents,
      {
        at: new Date().toISOString(),
        status: nextStatus,
        note: b.notes || null,
        by: session?.email || session?.userId || "admin",
      },
    ];

    const patch: Record<string, unknown> = {
      status: nextStatus,
      events,
      updated_at: new Date().toISOString(),
    };
    if (b.courierName !== undefined) patch.courier_name = b.courierName;
    if (b.courierPhone !== undefined) patch.courier_phone = b.courierPhone;
    if (b.trackingCode !== undefined) patch.tracking_code = b.trackingCode;
    if (b.notes !== undefined) patch.notes = b.notes;
    if (nextStatus === "assigned") {
      patch.assigned_admin_id = session?.userId || null;
    }
    if (nextStatus === "delivered") {
      patch.delivered_at = new Date().toISOString();
    }

    let delivery;
    if (existing) {
      const { data, error } = await sb
        .from("shop_deliveries")
        .update(patch)
        .eq("order_id", b.orderId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      delivery = data;
    } else {
      const { data, error } = await sb
        .from("shop_deliveries")
        .insert({
          order_id: b.orderId,
          ...patch,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      delivery = data;
    }

    // Mirror order status for terminal delivery states
    if (nextStatus === "out_for_delivery" || nextStatus === "in_transit") {
      await sb
        .from("shop_orders")
        .update({
          status: "out_for_delivery",
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.orderId)
        .in("status", ["paid", "fulfilling", "out_for_delivery"]);
    }
    if (nextStatus === "delivered") {
      await sb
        .from("shop_orders")
        .update({
          status: "delivered",
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.orderId);
    }
    if (nextStatus === "assigned" || nextStatus === "picked_up") {
      await sb
        .from("shop_orders")
        .update({
          status: "fulfilling",
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.orderId)
        .eq("status", "paid");
    }

    await sb.from("shop_order_events").insert({
      order_id: b.orderId,
      event_type: "delivery_update",
      payload: {
        status: nextStatus,
        courierName: b.courierName,
        trackingCode: b.trackingCode,
      },
      actor_id: session?.userId || null,
    });

    await sb.from("shop_audit_logs").insert({
      actor_id: session?.userId || null,
      action: "delivery_update",
      entity_type: "shop_delivery",
      entity_id: delivery?.id || null,
      payload: { orderId: b.orderId, status: nextStatus },
    });

    return apiOk({ delivery });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Failed";
    return apiFail(msg, 500);
  }
}
