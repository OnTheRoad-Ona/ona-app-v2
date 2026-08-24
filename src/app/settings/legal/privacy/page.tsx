"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function PrivacyPolicyPage() {
  const { theme } = useApp();
  const isLight = theme === "light";
  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader title="Privacy Policy" backHref="/settings/legal" />
      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 pb-8 text-[12px] font-medium leading-relaxed scrollbar-hide",
          isLight ? "text-slate-700" : "text-white/75",
        )}
      >
        <p className="mb-3 font-bold">Ona Privacy Policy (summary)</p>
        <p className="mb-2">
          We collect account details (name, email, phone), location for
          matching, job and chat data, and verification documents for safety.
        </p>
        <p className="mb-2">
          Customer profiles stay private by default until needed for a booking.
          Bank details are for refunds (customers) or payouts (pros) in Nigeria
          only and are not shared with the other party as marketing data.
        </p>
        <p className="mb-2">
          You may request export or deletion of your account from Settings.
          Questions:{" "}
          <a href="mailto:witcowavers@gmail.com" className="text-[#FF6B35]">
            witcowavers@gmail.com
          </a>
          .
        </p>
        <p className="text-[10px] opacity-70">Last updated · 2026</p>
      </div>
    </div>
  );
}
