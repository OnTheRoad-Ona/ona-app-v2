"use client";

/**
 * Lower panel — forced bank setup (Customer + Repair Pro).
 * Same fields as Settings → Payments (bank list, code, resolve name, unique).
 */

import { useEffect, useState } from "react";
import { Building2, ChevronUp } from "lucide-react";
import {
  BankDetailsFields,
  type BankDetailsValue,
} from "@/components/auth/bank-details-fields";
import {
  checkBankAccountAvailable,
  requiresBankSetup,
  validateBankDetailsInput,
} from "@/lib/bank-details";
import { useApp } from "@/lib/store";
import { useOverlayGatesReady } from "@/lib/use-overlay-gates-ready";
import { cn } from "@/lib/utils";

export function BankForcePanel({
  surface = "auto",
}: {
  surface?: "dashboard" | "home" | "auto";
}) {
  const {
    isAuthenticated,
    authReady,
    userProfile,
    accountType,
    theme,
    updateUserProfile,
  } = useApp();
  const gatesReady = useOverlayGatesReady();
  const isLight = theme === "light";
  const isPro =
    surface === "dashboard" || accountType === "professional";

  // Both Customer and Repair Pro need bank (refunds vs payouts)
  // Wait for full page settle so reload never flashes bank over half-loaded UI
  const need =
    Boolean(gatesReady && authReady && isAuthenticated && userProfile) &&
    requiresBankSetup(userProfile);

  const [open, setOpen] = useState(true);
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

  // If this role is missing bank but the same login already has one on the
  // other role (or vault), apply it once so Pro does not re-ask for bank.
  useEffect(() => {
    if (!need || !userProfile || !isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getVaultProfile } = await import("@/lib/profiles-vault");
        const { hasCompleteBankDetails } = await import("@/lib/bank-details");
        if (hasCompleteBankDetails(userProfile)) return;
        const vaultMot = getVaultProfile("motorist");
        const vaultPro = getVaultProfile("professional");
        const donor =
          (vaultMot && hasCompleteBankDetails(vaultMot) && vaultMot) ||
          (vaultPro && hasCompleteBankDetails(vaultPro) && vaultPro) ||
          null;
        if (!donor || cancelled) return;
        const msg = updateUserProfile({
          bankCode: donor.bankCode,
          bankName: donor.bankName,
          bankAccountName: donor.bankAccountName,
          bankAccountNumber: donor.bankAccountNumber,
        });
        if (!msg && !cancelled) {
          setDetails({
            bankCode: donor.bankCode || "",
            bankName: donor.bankName || "",
            bankAccountName: donor.bankAccountName || "",
            bankAccountNumber: donor.bankAccountNumber || "",
          });
        }
      } catch {
        /* keep panel open for manual entry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [need, userProfile, isAuthenticated, updateUserProfile, accountType]);

  useEffect(() => {
    if (need) setOpen(true);
  }, [need, userProfile?.identityId, accountType]);

  if (!need) return null;

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
    if (msg) setErr(msg);
  };

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[400]"
      data-bank-force={isPro ? "pro" : "customer"}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "pointer-events-auto mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-xl border-0 px-4 py-3 shadow-lg",
            sheet
          )}
        >
          <span
            className={cn("flex items-center gap-2 text-[13px] font-bold", ink)}
          >
            <Building2 className="h-4 w-4 text-[#FF6B35]" />
            {isPro ? "Add your bank to get paid" : "Add your bank for refunds"}
          </span>
          <ChevronUp className={cn("h-4 w-4", muted)} />
        </button>
      ) : (
        <div
          className={cn(
            "pointer-events-auto mx-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.28)]",
            sheet
          )}
          role="dialog"
          aria-label="Bank account required"
          aria-modal="true"
        >
          <div className="mb-2 flex justify-center">
            <span
              className={cn(
                "h-1.5 w-10 rounded-full",
                isLight ? "bg-black/20" : "bg-white/25"
              )}
            />
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-black", ink)}>
                Add your bank
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[12px] font-medium leading-snug",
                  muted
                )}
              >
                {isPro
                  ? "We need this to send your pay."
                  : "We need this to send refunds."}
              </p>
            </div>
            <button
              type="button"
              aria-label="Minimize (you can reopen)"
              onClick={() => setOpen(false)}
              className={cn(
                "shrink-0 rounded-md border-0 px-2 py-1.5 text-[11px] font-bold",
                isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
              )}
            >
              Later
            </button>
          </div>

          <div className="mt-3">
            <BankDetailsFields
              isLight={isLight}
              initial={details}
              onChange={setDetails}
              signupFullName={userProfile?.fullName}
              countryIso={userProfile?.identityCountryIso || "NG"}
            />
          </div>

          {err ? (
            <p className="mt-2 text-center text-[12px] font-semibold text-red-500">
              {err}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-lg border-0 bg-[#FF6B35] text-[14px] font-black text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save bank details"}
          </button>
        </div>
      )}
    </div>
  );
}
