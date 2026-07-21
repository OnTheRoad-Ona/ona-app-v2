"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsField,
  SettingsSaveBar,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Nigeria bank account only:
 * · Customer — refunds
 * · Repair Pro — payouts / earnings
 */
export default function SettingsPaymentsPage() {
  const { theme, userProfile, updateUserProfile, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    setBankName(userProfile.bankName || "");
    setBankAccountName(userProfile.bankAccountName || "");
    setBankAccountNumber(userProfile.bankAccountNumber || "");
  }, [userProfile]);

  const save = () => {
    setErr(null);
    setMsg(null);
    const num = bankAccountNumber.replace(/\D/g, "");
    if (bankName.trim() && num && (num.length < 10 || num.length > 10)) {
      setErr("Nigerian account numbers are 10 digits.");
      return;
    }
    if (num && !bankAccountName.trim()) {
      setErr("Account name is required.");
      return;
    }
    setBusy(true);
    const e = updateUserProfile({
      bankName: bankName.trim() || undefined,
      bankAccountName: bankAccountName.trim() || undefined,
      bankAccountNumber: num || undefined,
    });
    setBusy(false);
    if (e) setErr(e);
    else
      setMsg(
        isPro
          ? "Payout bank saved. Kept private and used only for earnings."
          : "Refund bank saved. Used only if we need to return money to you."
      );
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={isPro ? "Payments & payouts" : "Payments"}
        subtitle="Nigeria bank accounts only for now"
        backHref="/settings"
      />
      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <p
          className={cn(
            "mb-3 text-[12px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/65"
          )}
        >
          {isPro
            ? "Where Ona sends your job earnings after escrow release."
            : "Optional. Stored for refunds only — not shown to other users."}
        </p>
        <div
          className={cn(
            "overflow-hidden rounded-md",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
        >
          <SettingsField label="Bank name" isLight={isLight}>
            <input
              className={settingsInputClass(isLight)}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Access Bank, GTBank"
            />
          </SettingsField>
          <SettingsField label="Account name" isLight={isLight}>
            <input
              className={settingsInputClass(isLight)}
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              placeholder="Name on the account"
            />
          </SettingsField>
          <SettingsField
            label="Account number (10 digits)"
            isLight={isLight}
            hint="NUBAN only · encrypted at rest where server supports it"
          >
            <input
              className={settingsInputClass(isLight)}
              value={bankAccountNumber}
              onChange={(e) =>
                setBankAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              inputMode="numeric"
              placeholder="0123456789"
            />
          </SettingsField>
          <SettingsSaveBar
            isLight={isLight}
            busy={busy}
            msg={msg}
            err={err}
            onSave={save}
            label="Save bank details"
          />
        </div>
        {isPro ? (
          <p
            className={cn(
              "mt-3 text-[11px] font-medium",
              isLight ? "text-slate-500" : "text-white/45"
            )}
          >
            Payout history & earnings summary — coming soon in this section.
          </p>
        ) : (
          <p
            className={cn(
              "mt-3 text-[11px] font-medium",
              isLight ? "text-slate-500" : "text-white/45"
            )}
          >
            Job payments use in-app escrow. Cards from other countries are not
            supported yet. Promotions & credits — coming soon.
          </p>
        )}
      </div>
    </div>
  );
}
