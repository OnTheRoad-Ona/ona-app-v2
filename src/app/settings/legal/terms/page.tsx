"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function TermsPage() {
  const { theme } = useApp();
  const isLight = theme === "light";
  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title="Terms of Service" backHref="/settings/legal" />
      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 pb-8 text-[12px] font-medium leading-relaxed scrollbar-hide",
          isLight ? "text-slate-700" : "text-white/75"
        )}
      >
        <p className="mb-3 font-bold">Ona Terms of Service (summary)</p>
        <p className="mb-2">
          By using Ona you agree to book and provide services in good faith,
          provide accurate identity when required, and follow Nigerian law where
          applicable.
        </p>
        <p className="mb-2">
          Customers request help; Repair Pros may accept jobs when Live and
          verified. Escrow holds agreed labour until work is confirmed. Spare
          parts are never part of Ona labour prices.
        </p>
        <p className="mb-2">
          We may suspend accounts that fail verification, abuse the marketplace,
          or violate safety rules. Contact{" "}
          <a href="mailto:witcowavers@gmail.com" className="text-[#FF6B35]">
            witcowavers@gmail.com
          </a>{" "}
          for full legal copies or disputes.
        </p>
        <p className="text-[10px] opacity-70">Last updated · 2026</p>
      </div>
    </div>
  );
}
