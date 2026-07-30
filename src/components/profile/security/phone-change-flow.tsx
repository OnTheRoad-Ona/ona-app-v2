"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { profileTheme } from "@/lib/profile-system";
import { SecurityField } from "./security-field";
import { backendSendOtp, backendProfileVerifyOtp } from "@/lib/supabase/app-api";
import { PasswordInput } from "@/components/ui/password-input";

interface PhoneChangeFlowProps {
  isLight: boolean;
  currentPhone: string;
  currentEmail: string;
  isPhoneVerified: boolean;
  guarantorName?: string;
  accessToken: string;
  onPhoneChanged: (newPhone: string) => void;
}

type Step =
  | "idle"
  | "verify_identity"
  | "enter_new"
  | "send_new_otp"
  | "verify_new"
  | "confirming"
  | "done"
  | "error";

export function PhoneChangeFlow({
  isLight,
  currentPhone,
  currentEmail,
  isPhoneVerified,
  guarantorName,
  accessToken,
  onPhoneChanged,
}: PhoneChangeFlowProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [newPhone, setNewPhone] = useState("");
  const [newCode, setNewCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = profileTheme(isLight);

  // Identity verification fields
  const [password, setPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [gName, setGName] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);

  if (!open) {
    return (
      <SecurityField
        isLight={isLight}
        label="Phone number"
        value={currentPhone}
        badge={isPhoneVerified ? "verified" : undefined}
        onChangeClick={() => {
          setOpen(true);
          setStep("verify_identity");
          setMsg(null);
          setErr(null);
          setPassword("");
          setEmailCode("");
          setGName("");
          setEmailCodeSent(false);
        }}
      />
    );
  }

  const sendEmailOtp = async () => {
    setBusy(true);
    setErr(null);
    const res = await backendSendOtp({ channel: "email", target: currentEmail });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setEmailCodeSent(true);
    setMsg("Code sent to your email.");
  };

  const hasGuarantor = !!guarantorName;

  const verifyIdentity = async () => {
    if (!password) { setErr("Enter your current password."); return; }
    if (!emailCode) { setErr("Enter the code sent to your email."); return; }
    if (hasGuarantor && !gName.trim()) { setErr("Enter your guarantor's full name."); return; }

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/security/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          password,
          emailCode,
          ...(hasGuarantor && { guarantorName: gName.trim() }),
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: { message?: string } };
      if (!json?.ok) {
        setErr(json?.error?.message || "Identity verification failed.");
        return;
      }
      setStep("enter_new");
      setMsg("Identity verified. Enter your new phone number.");
      setPassword("");
      setEmailCode("");
      setGName("");
    } catch {
      setErr("Network error during verification.");
    } finally {
      setBusy(false);
    }
  };

  const sendNewOtp = async () => {
    const cleaned = newPhone.replace(/\D/g, "");
    if (cleaned.length < 10) { setErr("Enter a valid phone number"); return; }
    setBusy(true);
    setErr(null);
    const res = await backendSendOtp({ channel: "phone", target: newPhone });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setStep("verify_new");
    setMsg("Code sent to your new phone.");
  };

  const verifyNew = async () => {
    if (newCode.length < 4) { setErr("Enter the code"); return; }
    setBusy(true);
    setErr(null);
    const res = await backendProfileVerifyOtp({ channel: "phone", target: newPhone, code: newCode });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setStep("confirming");
    await doChange();
  };

  const doChange = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/security/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_phone", accessToken, newValue: newPhone }),
      });
      const json = await res.json() as { ok?: boolean; error?: { message?: string } };
      if (!json?.ok) {
        setErr(json?.error?.message || "Phone update failed.");
        setStep("error");
        return;
      }
      setStep("done");
      setMsg("Phone number updated.");
      onPhoneChanged(newPhone);
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
    setNewPhone("");
    setNewCode("");
    setPassword("");
    setEmailCode("");
    setGName("");
    setEmailCodeSent(false);
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
          <p className={cn("text-[11px] font-semibold", t.muted)}>Phone number</p>
          <p className={cn("truncate text-[13px] font-semibold", t.ink)}>
            {step === "done" ? newPhone : currentPhone}
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

      {step === "verify_identity" && (
        <div className="space-y-3">
          <p className={cn("text-[13px] font-bold", t.ink)}>Verify your identity</p>
          <p className={cn("text-[12px]", t.muted)}>
            {hasGuarantor ? "All three are required" : "Two-factor authentication required"} to change your phone number.
          </p>

          <div>
            <p className={cn("mb-1 text-[11px] font-semibold", t.muted)}>1. Current password</p>
            <PasswordInput className={fieldClass} placeholder="Enter your password" value={password}
              onChange={setPassword} isLight={isLight} />
          </div>

          <div>
            <p className={cn("mb-1 text-[11px] font-semibold", t.muted)}>2. Email verification code</p>
            {!emailCodeSent ? (
              <button type="button" disabled={busy} onClick={sendEmailOtp}
                className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
                {busy ? "Sending…" : "Send code to email"}
              </button>
            ) : (
              <input className={fieldClass} placeholder="000000" value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} />
            )}
          </div>

          {hasGuarantor && (
            <div>
              <p className={cn("mb-1 text-[11px] font-semibold", t.muted)}>3. Guarantor name</p>
              <input className={fieldClass} placeholder="Enter your guarantor's full name" value={gName}
                onChange={(e) => setGName(e.target.value)} />
            </div>
          )}

          <button type="button" disabled={busy} onClick={verifyIdentity}
            className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Verifying…" : "Verify identity"}
          </button>
        </div>
      )}

      {step === "enter_new" && (
        <div className="space-y-2">
          <p className={cn("text-[12px]", t.muted)}>Enter your new phone number.</p>
          <input className={fieldClass} placeholder="+234 801 234 5678" value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)} />
          <button type="button" disabled={busy || newPhone.replace(/\D/g, "").length < 10} onClick={sendNewOtp}
            className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send code to new number"}
          </button>
        </div>
      )}

      {step === "verify_new" && (
        <div className="space-y-2">
          <p className={cn("text-[12px]", t.muted)}>Enter the 6-digit code sent to your new number.</p>
          <input className={fieldClass} placeholder="000000" value={newCode}
            onChange={(e) => setNewCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} />
          <button type="button" disabled={busy || newCode.length < 4} onClick={verifyNew}
            className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Verifying…" : "Verify code"}
          </button>
        </div>
      )}

      {step === "confirming" && <p className={cn("text-[12px]", t.muted)}>Updating your phone number…</p>}

      {step === "done" && (
        <p className={cn("text-[12px] font-medium", t.soft)}>Your phone number has been updated.</p>
      )}
    </div>
  );
}
