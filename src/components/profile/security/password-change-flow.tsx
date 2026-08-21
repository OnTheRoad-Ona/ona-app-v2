"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { profileTheme } from "@/lib/profile-system";
import { SecurityField } from "./security-field";
import { PasswordInput } from "@/components/ui/password-input";
import { ConfirmCancelSheet } from "@/components/ui/confirm-cancel-sheet";

interface PasswordChangeFlowProps {
  isLight: boolean;
  accessToken: string;
}

type Step = "idle" | "form" | "confirming" | "done" | "error";

export function PasswordChangeFlow({ isLight, accessToken }: PasswordChangeFlowProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const t = profileTheme(isLight);

  if (!open) {
    return (
      <SecurityField
        isLight={isLight}
        label="Password"
        value="••••••••"
        badge="last changed recently"
        onChangeClick={() => {
          setOpen(true);
          setStep("form");
          setMsg(null);
          setErr(null);
        }}
      />
    );
  }

  const doChange = async () => {
    if (newPwd.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (!/[A-Z]/.test(newPwd)) { setErr("Include an uppercase letter."); return; }
    if (!/[a-z]/.test(newPwd)) { setErr("Include a lowercase letter."); return; }
    if (!/[0-9]/.test(newPwd)) { setErr("Include a number."); return; }
    if (!/[^A-Za-z0-9]/.test(newPwd)) { setErr("Include a special character."); return; }
    if (newPwd !== confirmPwd) { setErr("Passwords do not match."); return; }
    if (!currentPwd) { setErr("Enter your current password."); return; }

    setBusy(true);
    setErr(null);
    setStep("confirming");
    try {
      const res = await (await import("@/lib/api-auth-headers")).authFetch("/api/security/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          accessToken,
          newValue: newPwd,
          confirmValue: confirmPwd,
          currentPassword: currentPwd,
        }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
      if (!json?.ok) {
        setErr(json?.error?.message || "Password update failed.");
        setStep("error");
        return;
      }
      setStep("done");
      setMsg("Password updated.");
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
    setCurrentPwd("");
    setNewPwd("");
    setConfirmPwd("");
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
          <p className={cn("text-[11px] font-semibold", t.muted)}>Password</p>
          <p className={cn("text-[13px] font-semibold", t.ink)}>
            {step === "done" ? "Updated" : "••••••••"}
          </p>
        </div>
        {step === "done" ? (
          <button type="button" onClick={reset} className="shrink-0 rounded-lg border-0 px-3 py-1.5 text-[11px] font-bold text-brand">Done</button>
        ) : (
          <button type="button" onClick={() => setConfirmCancel(true)} className="shrink-0 rounded-lg border-0 px-3 py-1.5 text-[11px] font-bold text-red-400">Cancel</button>
        )}
      </div>

      {(msg || err) && (
        <p className={cn("rounded-xl px-3 py-2 text-[12px] font-semibold", err ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-500")}>
          {err || msg}
        </p>
      )}

      {step === "form" && (
        <div className="space-y-2">
          <PasswordInput className={fieldClass} placeholder="Current password" value={currentPwd}
            onChange={setCurrentPwd} isLight={isLight} />
          <PasswordInput className={fieldClass} placeholder="New password" value={newPwd}
            onChange={setNewPwd} isLight={isLight} />
          <PasswordInput className={fieldClass} placeholder="Confirm new password" value={confirmPwd}
            onChange={setConfirmPwd} isLight={isLight} />
          <p className={cn("text-[10px] leading-snug", t.muted)}>
            Minimum 8 characters with upper, lower, number, and special character.
          </p>
          <button type="button" disabled={busy} onClick={doChange}
            className="h-10 w-full rounded-xl border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      )}

      {step === "confirming" && (
        <p className={cn("text-[12px]", t.muted)}>Updating your password…</p>
      )}

      {step === "done" && (
        <p className={cn("text-[12px] font-medium", t.soft)}>
          Password changed. Use your new password next time you sign in.
        </p>
      )}
      <ConfirmCancelSheet
        open={confirmCancel}
        isLight={isLight}
        title="Discard changes?"
        message="Any changes you've made will be lost."
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          reset();
        }}
      />
    </div>
  );
}
