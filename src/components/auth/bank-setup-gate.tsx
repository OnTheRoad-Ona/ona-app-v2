"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import {
  BankDetailsFields,
  type BankDetailsValue,
} from "@/components/auth/bank-details-fields";
import {
  checkBankAccountAvailable,
  validateBankDetailsInput,
} from "@/lib/bank-details";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function BankSetupGate() {
  const router = useRouter();
  const {
    theme,
    accountType,
    userProfile,
    updateUserProfile,
    logout,
  } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  const [details, setDetails] = useState<BankDetailsValue>({
    bankCode: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
  });
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

  const onSave = async () => {
    setErr(null);
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
    const msg = updateUserProfile({
      bankCode: code,
      bankName: details.bankName.trim(),
      bankAccountName: details.bankAccountName.trim(),
      bankAccountNumber: num,
    });
    setBusy(false);
    if (msg) {
      setErr(msg);
      return;
    }
    router.replace(isPro ? "/dashboard" : "/");
  };

  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]",
        stage
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF6B35]">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className={cn("text-[18px] font-black leading-tight", ink)}>
              Add bank account
            </h1>
            <p className={cn("text-[12px] font-medium", muted)}>
              Account name loads after you enter the number
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border-0 px-2 py-1.5 text-[11px] font-bold",
            isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
          )}
          aria-label="Log out"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </button>
      </div>

      <p className={cn("mt-4 text-[13px] font-medium leading-snug", muted)}>
        {isPro
          ? "Payouts use this account after escrow release."
          : "Refunds use this account if a job is cancelled."}
      </p>

      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide">
        <BankDetailsFields
          isLight={isLight}
          initial={details}
          onChange={setDetails}
          signupFullName={userProfile?.fullName}
        />
        {err ? (
          <p className="mt-3 text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void onSave()}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-lg border-0 bg-[#FF6B35] text-[15px] font-black text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save and continue"}
      </button>
    </div>
  );
}
