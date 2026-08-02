"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { profileTheme } from "@/lib/profile-system";
import { SecurityField } from "./security-field";
import { backendSendOtp, backendProfileVerifyOtp } from "@/lib/supabase/app-api";

interface BankChangeFlowProps {
  isLight: boolean;
  currentBank?: {
    bankName?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankCode?: string | null;
  };
  userPhone: string;
  accessToken: string;
  onBankChanged: (bank: { bankName: string; bankAccountName: string; bankAccountNumber: string; bankCode: string }) => void;
}

type Step =
  | "idle"
  | "send_otp"
  | "verify_otp"
  | "form"
  | "confirming"
  | "done"
  | "error";

export function BankChangeFlow({
  isLight,
  currentBank,
  userPhone,
  accessToken,
  onBankChanged,
}: BankChangeFlowProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [bankName, setBankName] = useState(currentBank?.bankName || "");
  const [accName, setAccName] = useState(currentBank?.bankAccountName || "");
  const [accNumber, setAccNumber] = useState(currentBank?.bankAccountNumber || "");
  const [bankCode, setBankCode] = useState(currentBank?.bankCode || "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = profileTheme(isLight);

  const displayValue = currentBank?.bankName
    ? `${currentBank.bankName} · ••••${(currentBank.bankAccountNumber || "").slice(-4)}`
    : "Not set";

  if (!open) {
    return (
      <SecurityField
        isLight={isLight}
        label="Payout bank account"
        value={displayValue}
        onChangeClick={() => {
          setOpen(true);
          setStep("send_otp");
          setMsg(null);
          setErr(null);
        }}
      />
    );
  }

  const sendOtp = async () => {
    setBusy(true);
    setErr(null);
    const res = await backendSendOtp({ channel: "phone", target: userPhone });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setStep("verify_otp");
    setMsg("Code sent to your phone for security verification.");
  };

  const verifyOtp = async () => {
    if (code.length < 4) { setErr("Enter the code"); return; }
    setBusy(true);
    setErr(null);
    const res = await backendProfileVerifyOtp({ channel: "phone", target: userPhone, code });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setStep("form");
    setMsg("Identity verified. Enter new bank details.");
    setCode("");
  };

  const doChange = async () => {
    if (!bankName.trim()) { setErr("Bank name is required"); return; }
    if (!accName.trim()) { setErr("Account name is required"); return; }
    const num = accNumber.replace(/\D/g, "");
    if (num.length !== 10) { setErr("Account number must be 10 digits"); return; }
    if (!bankCode.trim()) { setErr("Bank code is required"); return; }

    setBusy(true);
    setErr(null);
    setStep("confirming");
    try {
      const res = await (await import("@/lib/api-auth-headers")).authFetch("/api/security/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_bank",
          accessToken,
          newValue: JSON.stringify({
            bankName: bankName.trim(),
            bankAccountName: accName.trim(),
            bankAccountNumber: num,
            bankCode: bankCode.trim(),
          }),
        }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
      if (!json?.ok) {
        setErr(json?.error?.message || "Bank update failed.");
        setStep("error");
        return;
      }
      setStep("done");
      setMsg("Bank account updated.");
      onBankChanged({
        bankName: bankName.trim(),
        bankAccountName: accName.trim(),
        bankAccountNumber: num,
        bankCode: bankCode.trim(),
      });
    } catch {
      setErr("Network error. Try again.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setOpen(false);
    setStep("idle");
    setCode("");
    setMsg(null);
    setErr(null);
  };

  const fieldClass = isLight
    ? "h-10 w-full border-0 border-b border-black/15 bg-transparent px-0 text-[13px] font-medium text-slate-900 outline-none"
    : "h-10 w-full rounded-xl border-0 bg-[#2c2c2e] px-3 text-[13px] font-medium text-white outline-none";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn("text-[11px] font-semibold", t.muted)}>Payout bank account</p>
          <p className={cn("truncate text-[13px] font-semibold", t.ink)}>
            {step === "done" ? `${bankName} · ••••${accNumber.slice(-4)}` : displayValue}
          </p>
        </div>
        {step === "done" ? (
          <button type="button" onClick={reset} className="shrink-0 rounded-lg border-0 px-3 py-1.5 text-[11px] font-bold text-brand">Done</button>
        ) : (
          <button type="button" onClick={reset} className="shrink-0 rounded-lg border-0 px-3 py-1.5 text-[11px] font-bold text-red-400">Cancel</button>
        )}
      </div>

      {(msg || err) && (
        <p className={cn("rounded-xl px-3 py-2 text-[12px] font-semibold", err ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-500")}>
          {err || msg}
        </p>
      )}

      {step === "send_otp" && (
        <div className="space-y-2">
          <p className={cn("text-[12px] font-medium", t.ink)}>
            Changing your bank account requires security verification.
          </p>
          <p className={cn("text-[12px]", t.muted)}>
            A code will be sent to your phone.
          </p>
          <button type="button" disabled={busy} onClick={sendOtp}
            className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send security code"}
          </button>
        </div>
      )}

      {step === "verify_otp" && (
        <div className="space-y-2">
          <p className={cn("text-[12px]", t.muted)}>Enter the 6-digit code sent to your phone.</p>
          <input className={fieldClass} placeholder="000000" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} />
          <button type="button" disabled={busy || code.length < 4} onClick={verifyOtp}
            className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Verifying…" : "Verify code"}
          </button>
        </div>
      )}

      {step === "form" && (
        <div className="space-y-2">
          <input className={fieldClass} placeholder="Bank name" value={bankName}
            onChange={(e) => setBankName(e.target.value)} />
          <input className={fieldClass} placeholder="Account name" value={accName}
            onChange={(e) => setAccName(e.target.value)} />
          <input className={fieldClass} placeholder="Account number (10 digits)" value={accNumber}
            onChange={(e) => setAccNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} maxLength={10} />
          <input className={fieldClass} placeholder="Bank code / sort code" value={bankCode}
            onChange={(e) => setBankCode(e.target.value)} />
          <p className={cn("text-[10px] leading-snug", t.muted)}>
            Your identity has been verified. Changing your bank account will be audited and you will be notified.
          </p>
          <button type="button" disabled={busy} onClick={doChange}
            className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Updating…" : "Update bank account"}
          </button>
        </div>
      )}

      {step === "confirming" && (
        <p className={cn("text-[12px]", t.muted)}>Updating your bank account…</p>
      )}

      {step === "done" && (
        <p className={cn("text-[12px] font-medium", t.soft)}>
          Bank account updated. A security notification has been sent.
        </p>
      )}
    </div>
  );
}
