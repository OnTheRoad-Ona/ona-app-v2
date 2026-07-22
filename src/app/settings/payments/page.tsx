"use client";

/**
 * Settings → bank — same fields & validation as BankForcePanel
 * (bank list, auto code, NUBAN resolve, name match, uniqueness).
 */

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  BankDetailsFields,
  type BankDetailsValue,
} from "@/components/auth/bank-details-fields";
import {
  checkBankAccountAvailable,
  hasCompleteBankDetails,
  validateBankDetailsInput,
} from "@/lib/bank-details";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsPaymentsPage() {
  const { theme, userProfile, updateUserProfile, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  const [details, setDetails] = useState<BankDetailsValue>({
    bankCode: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    setDetails({
      bankCode: userProfile.bankCode || "",
      bankName: userProfile.bankName || "",
      bankAccountName: userProfile.bankAccountName || "",
      bankAccountNumber: userProfile.bankAccountNumber || "",
    });
  }, [userProfile]);

  const save = async () => {
    setErr(null);
    setMsg(null);
    const num = details.bankAccountNumber.replace(/\D/g, "").slice(0, 10);
    const code = details.bankCode.trim();
    const validation = validateBankDetailsInput(
      { ...details, bankAccountNumber: num, bankCode: code },
      undefined,
      userProfile?.fullName
    );
    if (validation) {
      setErr(validation);
      return;
    }
    setBusy(true);
    const uniq = await checkBankAccountAvailable({
      bankCode: code,
      accountNumber: num,
    });
    if (!uniq.ok) {
      setBusy(false);
      setErr(uniq.error);
      return;
    }
    const e = updateUserProfile({
      bankCode: code,
      bankName: details.bankName.trim(),
      bankAccountName: details.bankAccountName.trim(),
      bankAccountNumber: num,
    });
    setBusy(false);
    if (e) setErr(e);
    else setMsg(isPro ? "Payout bank saved." : "Refund bank saved.");
  };

  const complete = hasCompleteBankDetails({
    ...userProfile!,
    bankCode: details.bankCode,
    bankName: details.bankName,
    bankAccountName: details.bankAccountName,
    bankAccountNumber: details.bankAccountNumber,
  } as NonNullable<typeof userProfile>);

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const card = isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]";

  return (
    <div className={cn("flex h-full flex-col", sheet)}>
      <PageHeader
        title={isPro ? "Payments & payouts" : "Payments & refunds"}
        subtitle="Same bank form as the home bank panel"
        backHref="/settings"
      />
      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <div className={cn("rounded-2xl border-0 p-4 shadow-sm", card)}>
          <div className="mb-3 flex items-start gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FF6B35]">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className={cn("text-[15px] font-black", ink)}>
                Bank account details
              </p>
              <p className={cn("mt-0.5 text-[12px] font-medium leading-snug", muted)}>
                {isPro
                  ? "Pick bank + enter account number — name fills like a bank app. Ona pays you here after escrow release (95%)."
                  : "Pick bank + enter account number — name fills like a bank app. Used for refunds if a job is cancelled."}
              </p>
              {complete ? (
                <p className="mt-1 text-[11px] font-bold text-emerald-600">
                  Bank on file · ready
                </p>
              ) : (
                <p className="mt-1 text-[11px] font-bold text-[#FF6B35]">
                  Required to finish setup
                </p>
              )}
            </div>
          </div>

          <BankDetailsFields
            isLight={isLight}
            initial={details}
            onChange={setDetails}
            signupFullName={userProfile?.fullName}
          />

          {err ? (
            <p className="mt-2 text-center text-[12px] font-semibold text-red-500">
              {err}
            </p>
          ) : null}
          {msg ? (
            <p className="mt-2 text-center text-[12px] font-semibold text-emerald-600">
              {msg}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-lg border-0 bg-[#FF6B35] text-[14px] font-black text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save bank details"}
          </button>
        </div>
      </div>
    </div>
  );
}
