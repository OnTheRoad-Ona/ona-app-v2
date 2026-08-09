"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { shopGetOrder } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function ShopOrderDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const ctx =
    accountType === "professional" ? "professional" : "motorist";
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [delivery, setDelivery] = useState<Record<string, unknown> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await shopGetOrder(id, ctx);
        if (cancelled) return;
        setOrder(data.order);
        setItems(data.items);
        setDelivery(data.delivery);
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
              <p className="mt-1 text-[12px] font-bold capitalize text-[#FF6B35]">
                {String(order.status).replace(/_/g, " ")}
              </p>
              <p className={cn("mt-2 text-[13px]", muted)}>
                Total ₦
                {Math.round(Number(order.total_minor) / 100).toLocaleString(
                  "en-NG"
                )}
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
                  {Number(it.qty)}× {String(it.product_name)} · ₦
                  {Math.round(Number(it.line_total_minor) / 100).toLocaleString(
                    "en-NG"
                  )}
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
              <p className="font-bold capitalize text-[#FF6B35]">
                {String(delivery?.status || "pending").replace(/_/g, " ")}
              </p>
              <p className={cn("mt-1", muted)}>
                {delivery?.courier_name
                  ? `Courier: ${String(delivery.courier_name)}`
                  : "Awaiting courier assignment (admin)."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
