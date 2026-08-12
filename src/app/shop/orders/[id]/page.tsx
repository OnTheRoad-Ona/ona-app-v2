"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, MapPin, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { detectCurrency, formatMoney, fromMinorUnits } from "@/lib/pricing";
import { shopGetOrder } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Delivery = {
  status?: string | null;
  courier_name?: string | null;
  zone_name?: string | null;
  service_code?: string | null;
  eta_minutes?: number | null;
  tracking_code?: string | null;
  address_snapshot?: Record<string, unknown> | null;
};

type OrderEvent = {
  id: string;
  event_type: string;
  note?: string | null;
  created_at?: string;
};

function formatPrice(minor: number | null | undefined): string {
  if (minor == null) return "—";
  return formatMoney(fromMinorUnits(minor, "NGN"), detectCurrency());
}

function statusColor(status: string): string {
  if (status.includes("paid") || status.includes("delivered"))
    return "text-emerald-500";
  if (status.includes("refund") || status.includes("cancelled"))
    return "text-red-500";
  return "text-[#FF6B35]";
}

export default function ShopOrderDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const ctx = accountType === "professional" ? "professional" : "motorist";
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await shopGetOrder(id, ctx);
        if (cancelled) return;
        setOrder(data.order);
        setItems(data.items);
        setDelivery((data.delivery as Delivery | null) ?? null);
        setPayments(data.payments ?? []);
        setEvents(
          ((data.events ?? []) as OrderEvent[]).sort((a, b) =>
            String(a.created_at).localeCompare(String(b.created_at))
          )
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, ctx]);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white/90" : "bg-[#1c1c1e]";
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const border = isLight ? "border-black/10" : "border-white/10";
  const orderStatus = String(order?.status || "pending");

  const ship = (delivery?.address_snapshot ??
    order?.ship_to_snapshot ??
    {}) as Record<string, unknown>;

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader title="Order" backHref="/shop/orders" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
          </div>
        ) : error || !order ? (
          <p className="py-8 text-center text-[13px] text-red-500">
            {error || "Not found"}
          </p>
        ) : (
          <>
            <div
              className={cn(
                "rounded-xl p-3",
                card,
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              <p className="text-[15px] font-black">
                {String(order.order_number)}
              </p>
              <p
                className={cn(
                  "mt-1 text-[12px] font-bold capitalize",
                  statusColor(orderStatus)
                )}
              >
                {orderStatus.replace(/_/g, " ")}
              </p>
              <p className={cn("mt-2 text-[13px]", muted)}>
                Total {formatPrice(Number(order.total_minor))}
                {order.refunded_at ? (
                  <span className="ml-1 text-[11px] font-bold text-red-500">
                    (refunded)
                  </span>
                ) : null}
              </p>
            </div>

            <p className="mt-4 px-0.5 text-[12px] font-black">Items</p>
            <div className="mt-1 flex flex-col gap-1.5">
              {items.map((it) => (
                <div
                  key={String(it.id)}
                  className={cn(
                    "rounded-xl p-2.5 text-[12px]",
                    card,
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  <div className="flex justify-between">
                    <span>
                      {Number(it.qty)}× {String(it.product_name)}
                    </span>
                    <span className="font-bold">
                      {formatPrice(Number(it.line_total_minor))}
                    </span>
                  </div>
                  {it.sku ? (
                    <p className={cn("mt-0.5 text-[11px]", muted)}>
                      SKU {String(it.sku)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="mt-4 px-0.5 text-[12px] font-black">Delivery</p>
            <div
              className={cn(
                "mt-1 rounded-xl p-3 text-[12px]",
                card,
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              <div className="flex items-center justify-between">
                <p
                  className={cn(
                    "font-bold capitalize",
                    statusColor(String(delivery?.status || "pending"))
                  )}
                >
                  {String(delivery?.status || "pending").replace(/_/g, " ")}
                </p>
                {delivery?.eta_minutes != null ? (
                  <p className={cn("font-semibold", muted)}>
                    <Truck className="mr-1 inline h-3.5 w-3.5" />
                    ~{delivery.eta_minutes} min ETA
                  </p>
                ) : null}
              </div>
              {delivery?.zone_name ? (
                <p className={cn("mt-1.5", muted)}>
                  Zone: {String(delivery.zone_name)}
                  {delivery.service_code
                    ? ` · ${String(delivery.service_code).replace(/_/g, " ")}`
                    : ""}
                </p>
              ) : null}
              {ship.address ? (
                <p className={cn("mt-1 flex items-start gap-1", muted)}>
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {String(ship.label)} · {String(ship.address)}
                </p>
              ) : null}
              {delivery?.courier_name ? (
                <p className={cn("mt-1", muted)}>
                  Courier: {String(delivery.courier_name)}
                  {delivery.tracking_code
                    ? ` · ${String(delivery.tracking_code)}`
                    : ""}
                </p>
              ) : (
                <p className={cn("mt-1", muted)}>
                  Awaiting courier assignment (admin).
                </p>
              )}
            </div>

            {payments.length > 0 ? (
              <>
                <p className="mt-4 px-0.5 text-[12px] font-black">Payment</p>
                <div
                  className={cn(
                    "mt-1 rounded-xl p-3 text-[12px]",
                    card,
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  {payments.map((p, i) => (
                    <div
                      key={String(p.id)}
                      className={cn(i > 0 && "mt-1.5 border-t pt-1.5", border)}
                    >
                      <span className="font-bold capitalize">
                        {String(p.provider)}
                      </span>{" "}
                      · {formatPrice(Number(p.amount_minor))} ·{" "}
                      <span className={muted}>{String(p.reference)}</span>
                      {p.refunded_at ? (
                        <span className="ml-1 text-[11px] font-bold text-red-500">
                          (refunded)
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {events.length > 0 ? (
              <>
                <p className="mt-4 px-0.5 text-[12px] font-black">Timeline</p>
                <div className="mt-1 flex flex-col gap-2">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-start gap-2 px-0.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <div>
                        <p className="text-[12px] font-bold capitalize">
                          {String(e.event_type).replace(/_/g, " ")}
                        </p>
                        {e.note ? (
                          <p className={cn("text-[11px]", muted)}>{e.note}</p>
                        ) : null}
                        <p className={cn("text-[10px]", muted)}>
                          {e.created_at
                            ? new Date(e.created_at).toLocaleString()
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
