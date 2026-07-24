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
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    setDetails({
      bankCode: userProfile.bankCode || "",
      bankName: userProfile.bankName || "",
      bankAccountName: userProfile.bankAccountName || "",
      bankAccountNumber: userProfile.bankAccountNumber || "",
    });
  }, [userProfile]);

  const complete = hasCompleteBankDetails({
    ...userProfile!,
    bankCode: details.bankCode,
    bankName: details.bankName,
    bankAccountName: details.bankAccountName,
    bankAccountNumber: details.bankAccountNumber,
  } as NonNullable<typeof userProfile>);

  // Open form when nothing on file yet
  useEffect(() => {
    if (!complete) setEditing(true);
  }, [complete]);

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
    else {
      setMsg("Bank details saved");
      setEditing(false);
    }
  };

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const card = "bg-transparent";

  return (
    <div className={cn("flex h-full flex-col", sheet)}>
      <PageHeader
        title={isPro ? "Payments & payouts" : "Payments & refunds"}
        backHref="/settings"
      />
      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <div className={cn("border-0 p-4", card)}>
          <div className="mb-3 flex items-start gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FF6B35]">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-black", ink)}>
                Bank account details
              </p>
              {complete && !editing ? (
                <p className="mt-1 text-[12px] font-semibold text-emerald-600">
                  Bank verified
                </p>
              ) : (
                <p className={cn("mt-1 text-[11px] font-bold text-[#FF6B35]")}>
                  Required to finish setup
                </p>
              )}
            </div>
            {complete && !editing ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setMsg(null);
                  setErr(null);
                }}
                className="shrink-0 rounded-md border-0 bg-[#FF6B35] px-3 py-1.5 text-[12px] font-bold text-white"
              >
                Edit
              </button>
            ) : null}
          </div>

          {complete && !editing ? (
            <div className={cn("space-y-2 text-[13px] font-semibold", ink)}>
              <p>
                <span className={cn("text-[11px] font-bold uppercase", muted)}>
                  Bank
                </span>
                <br />
                {details.bankName || "—"}
              </p>
              <p>
                <span className={cn("text-[11px] font-bold uppercase", muted)}>
                  Account number
                </span>
                <br />
                {details.bankAccountNumber
                  ? `••••${details.bankAccountNumber.slice(-4)}`
                  : "—"}
              </p>
              <p>
                <span className={cn("text-[11px] font-bold uppercase", muted)}>
                  Account name
                </span>
                <br />
                {details.bankAccountName || "—"}
              </p>
            </div>
          ) : (
            <>
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

              <div className="mt-3 flex gap-2">
                {complete ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setErr(null);
                      setMsg(null);
                      if (userProfile) {
                        setDetails({
                          bankCode: userProfile.bankCode || "",
                          bankName: userProfile.bankName || "",
                          bankAccountName: userProfile.bankAccountName || "",
                          bankAccountNumber:
                            userProfile.bankAccountNumber || "",
                        });
                      }
                    }}
                    className={cn(
                      "inline-flex h-12 flex-1 items-center justify-center rounded-lg border-0 text-[14px] font-black",
                      isLight
                        ? "bg-black/10 text-slate-900"
                        : "bg-white/10 text-white"
                    )}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border-0 bg-[#FF6B35] text-[14px] font-black text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save bank details"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
