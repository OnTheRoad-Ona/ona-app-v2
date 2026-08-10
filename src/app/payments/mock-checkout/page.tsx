"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/lib/store";
import { formatMoneyMinor, type AppCurrency } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Dev/mock checkout when Paystack/Flutterwave keys are not configured.
 * Simulates successful capture into escrow.
 */
function MockInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { theme } = useApp();
  const isLight = theme === "light";
  const ref = params.get("ref") || "";
  const amount = Number(params.get("amount") || 0);
  const currency = (params.get("currency") || "NGN") as AppCurrency;
  const jobId = params.get("jobId") || params.get("job") || "";
  const isShop = params.get("kind") === "ona_shop" || Boolean(params.get("orderId"));
  const orderId = params.get("orderId") || "";
  const [cancelOpen, setCancelOpen] = useState(false);

  const pay = async () => {
    // Works in-app (iframe) or full page — promote to Ona shell after verify
    if (isShop) {
      await fetch("/api/shop/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      });
    } else {
      await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref, provider: "mock" }),
      });
    }
    const dest = isShop
      ? `/shop/checkout/callback?ref=${encodeURIComponent(ref)}${
          orderId ? `&order=${encodeURIComponent(orderId)}` : ""
        }`
      : `/payments/callback?ref=${encodeURIComponent(ref)}${
          jobId ? `&jobId=${encodeURIComponent(jobId)}` : ""
        }`;
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.replace(dest);
        return;
      }
    } catch {
      /* */
    }
    router.replace(dest);
  };

  return (
    <div
      className={cn(
        "relative flex h-full flex-col justify-center gap-4 px-5",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <h1
        className={cn(
          "text-[18px] font-black",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        Mock secure checkout
      </h1>
      <p
        className={cn(
          "text-[12px]",
          isLight ? "text-slate-600" : "text-white/60"
        )}
      >
        {isShop
          ? "Bank transfer only (simulated). Spare parts purchase — funds paid to Ona on order confirm."
          : "Bank transfer only (simulated). Labour fee only — no spare parts. Funds held in escrow."}
      </p>
      <p className="text-[22px] font-black text-brand">
        {formatMoneyMinor(amount, currency)}
      </p>
      <p className="text-[11px] text-brand">Ref · {ref}</p>
      <button
        type="button"
        onClick={() => void pay()}
        className="rounded-xl border-0 bg-brand py-3.5 text-[14px] font-bold text-white"
      >
        {isShop ? "Pay for order" : "Pay & hold in escrow"}
      </button>
      <button
        type="button"
        onClick={() => setCancelOpen(true)}
        className={cn(
          "rounded-xl border-0 py-3 text-[13px] font-bold",
          isLight ? "bg-black/10 text-slate-900" : "bg-white/10 text-white"
        )}
      >
        Cancel
      </button>

      {cancelOpen ? (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50 p-3">
          <div
            className={cn(
              "w-full max-w-md overflow-hidden rounded-2xl",
              isLight ? "bg-white" : "bg-[#1c1c1e]"
            )}
          >
            <p
              className={cn(
                "px-4 pt-4 text-center text-[15px] font-black",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Cancel
            </p>
            <button
              type="button"
              onClick={() =>
                router.push(jobId ? `/jobs/${jobId}` : "/jobs")
              }
              className={cn(
                "mt-2 flex h-12 w-full items-center justify-center border-0 border-t text-[14px] font-bold",
                isLight
                  ? "border-black/10 text-slate-900"
                  : "border-white/10 text-white"
              )}
            >
              Cancel payment
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(jobId ? `/jobs/${jobId}` : "/jobs")
              }
              className={cn(
                "flex h-12 w-full items-center justify-center border-0 border-t text-[14px] font-bold text-red-500",
                isLight ? "border-black/10" : "border-white/10"
              )}
            >
              Cancel request
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              className={cn(
                "flex h-11 w-full items-center justify-center border-0 border-t text-[13px] font-semibold",
                isLight
                  ? "border-black/10 text-slate-500"
                  : "border-white/10 text-white/50"
              )}
            >
              Keep paying
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <MockInner />
    </Suspense>
  );
}
