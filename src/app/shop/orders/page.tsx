"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { shopListOrders } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function ShopOrdersPage() {
  const { theme, isAuthenticated, accountType } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const ctx =
    accountType === "professional" ? "professional" : "motorist";

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await shopListOrders(ctx);
        if (!cancelled) setOrders(data.orders);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, ctx]);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white/90" : "bg-[#1c1c1e]";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader title="Shop orders" backHref="/shop" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
          </div>
        ) : orders.length === 0 ? (
          <p className={cn("py-10 text-center text-[13px]", muted)}>
            No shop orders yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {orders.map((o) => (
              <button
                key={String(o.id)}
                type="button"
                onClick={() => router.push(`/shop/orders/${o.id}`)}
                className={cn(
                  "rounded-xl border-0 p-3 text-left",
                  card,
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                <div className="flex justify-between gap-2">
                  <p className="text-[13px] font-black">
                    {String(o.order_number)}
                  </p>
                  <p className="text-[12px] font-bold capitalize text-[#FF6B35]">
                    {String(o.status).replace(/_/g, " ")}
                  </p>
                </div>
                <p className={cn("mt-1 text-[12px]", muted)}>
                  ₦
                  {Math.round(Number(o.total_minor) / 100).toLocaleString(
                    "en-NG"
                  )}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
