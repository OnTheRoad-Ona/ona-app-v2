"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { shopVerifyPayment } from "@/lib/shop/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function CallbackInner() {
  const sp = useSearchParams();
  const ref = sp.get("ref") || sp.get("tx_ref") || sp.get("reference") || "";
  const orderParam = sp.get("order") || "";
  const router = useRouter();
  const { theme } = useApp();
  const isLight = theme === "light";
  const [status, setStatus] = useState<"loading" | "ok" | "fail">("loading");
  const [orderId, setOrderId] = useState<string | null>(orderParam || null);
  const [message, setMessage] = useState("Confirming payment…");

  useEffect(() => {
    if (!ref) {
      setStatus("fail");
      setMessage("Missing payment reference.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await shopVerifyPayment(ref);
        if (cancelled) return;
        if (result.success) {
          setStatus("ok");
          setOrderId(result.orderId);
          setMessage(
            result.alreadyPaid
              ? "Payment already confirmed."
              : "Payment successful. Order is confirmed."
          );
        } else {
          setStatus("fail");
          setMessage("Payment was not successful.");
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("fail");
        setMessage(e instanceof Error ? e.message : "Verify failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ref]);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", bg)}>
      <PageHeader title="Payment" backHref="/shop" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {status === "loading" ? (
          <Loader2 className="h-10 w-10 animate-spin text-[#FF6B35]" />
        ) : status === "ok" ? (
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        ) : (
          <XCircle className="h-12 w-12 text-red-500" />
        )}
        <p className="mt-4 text-[15px] font-black">{message}</p>
        <p className={cn("mt-1 text-[12px]", muted)}>
          {ref ? `Ref ${ref.slice(0, 24)}…` : null}
        </p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
          {status === "ok" && orderId ? (
            <button
              type="button"
              onClick={() => router.replace(`/shop/orders/${orderId}`)}
              className="h-11 rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
            >
              View order
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.replace("/shop")}
            className={cn(
              "h-11 rounded-xl border-0 text-[13px] font-bold",
              isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
            )}
          >
            Back to Shop
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShopCheckoutCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
