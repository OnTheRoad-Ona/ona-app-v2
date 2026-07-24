"use client";

import { Banknote, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsPaymentsSectionPage() {
  const { theme, accountType } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("settings.hub.payments")}
        subtitle={t("settings.hub.paymentsDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <SettingsRow
          first
          isLight={isLight}
          icon={isPro ? Banknote : Wallet}
          label={isPro ? "Bank payout (Nigeria)" : "Bank account (Nigeria)"}
          detail={
            isPro ? "Receive job earnings" : "Refund bank only · NUBAN"
          }
          href="/settings/payments"
        />
      </div>
    </div>
  );
}
