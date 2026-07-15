"use client";

import { Suspense } from "react";
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

  const pay = async () => {
    await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: ref, provider: "mock" }),
    });
    router.replace(`/payments/callback?ref=${encodeURIComponent(ref)}`);
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col justify-center gap-4 px-5",
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
        Card · Bank transfer · USSD (simulated). Labour fee only — no spare
        parts. Funds held in escrow.
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
        Pay & hold in escrow
      </button>
      <button
        type="button"
        onClick={() => router.back()}
        className={cn(
          "text-[12px] font-bold",
          isLight ? "text-slate-700" : "text-white/70"
        )}
      >
        Cancel
      </button>
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
