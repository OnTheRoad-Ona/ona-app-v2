"use client";

/**
 * Payments hub:
 * - Overview
 * - Bank account details
 * - Activity
 *
 * Pro: side menu → Payments & Payouts
 * Customer: Settings → Payments & Refunds
 */

import { Building2, Clock3, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-ui";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function PaymentsHubPage() {
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  const title = isPro ? "Payments & Payouts" : "Payments & Refunds";
  const backHref = isPro ? "/dashboard" : "/settings";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title={title} backHref={backHref} />

      <div className="flex-1 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <SettingsSection title="Money" isLight={isLight}>
          <SettingsRow
            first
            isLight={isLight}
            icon={Wallet}
            label={isPro ? "Payout overview" : "Payment overview"}
            detail={isPro ? "Money held and paid out" : "Money held and released"}
            href="/settings/payments/overview"
          />
          <SettingsRow
            isLight={isLight}
            icon={Building2}
            label="Bank account details"
            detail={isPro ? "Where you get paid" : "Where refunds go"}
            href="/settings/payments/bank"
          />
          <SettingsRow
            isLight={isLight}
            icon={Clock3}
            label="Activity"
            detail="Past money moves"
            href="/settings/payments/activity"
          />
        </SettingsSection>
      </div>
    </div>
  );
}
