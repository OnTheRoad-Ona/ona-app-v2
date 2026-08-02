"use client";

/**
 * After Tap to Switch: block the app until the user re-enters phone OTP
 * (demo 336699 when OTP demo mode is on). Does not create a new session.
 */

import { useEffect, useState } from "react";
import { DEMO_OTP_CODE, isDemoOtpAllowed } from "@/lib/auth/demo-otp";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function PostSwitchPhoneOtpGate() {
  const {
    theme,
    isAuthenticated,
    postSwitchPhoneOtpRequired,
    userProfile,
    sendPostSwitchPhoneOtp,
    completePostSwitchPhoneOtp,
  } = useApp();
  const isLight = theme === "light";
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const open =
    isAuthenticated && postSwitchPhoneOtpRequired && Boolean(userProfile?.phone);

  useEffect(() => {
    if (!open) {
      setCode("");
      setSent(false);
      setErr(null);
      setInfo(null);
    }
  }, [open]);

  if (!open) return null;

  const demoHint = isDemoOtpAllowed()
    ? ` Demo code: ${DEMO_OTP_CODE}.`
    : "";

  const onSend = async () => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    const e = await sendPostSwitchPhoneOtp();
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    setSent(true);
    setInfo(`Code sent to your registered phone.${demoHint}`);
  };

  const onVerify = async () => {
    setBusy(true);
    setErr(null);
    const e = await completePostSwitchPhoneOtp(code);
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
  };

  return (
    <div
      className="absolute inset-0 z-[200] flex items-end justify-center bg-black/50 px-3 pb-8 pt-12"
      role="dialog"
      aria-modal
      aria-label="Confirm phone after switch"
      data-no-theme-toggle
    >
      <div
        className={cn(
          "w-full max-w-[360px] rounded-md p-4 shadow-xl",
          isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-[#1c1c1e] text-white"
        )}
      >
        <p className="text-[15px] font-black">Confirm it’s you</p>
        <p
          className={cn(
            "mt-1 text-[12px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/65"
          )}
        >
          You switched roles. Enter the code sent to{" "}
          <span className="font-bold">{userProfile?.phone}</span> to continue.
          {demoHint}
        </p>

        {!sent ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSend()}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              className={cn(
                "h-11 w-full rounded-md border-0 px-3 text-center text-[16px] font-bold tracking-widest outline-none",
                isLight
                  ? "bg-black/[0.06] text-slate-900"
                  : "bg-white/[0.08] text-white"
              )}
            />
            <button
              type="button"
              disabled={busy || code.length < 4}
              onClick={() => void onVerify()}
              className="flex h-11 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[13px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "Checking…" : "Verify & continue"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSend()}
              className={cn(
                "w-full border-0 bg-transparent py-1 text-[12px] font-semibold",
                isLight ? "text-slate-700" : "text-white/70"
              )}
            >
              Resend code
            </button>
          </div>
        )}

        {info ? (
          <p
            className={cn(
              "mt-2 text-[11px] font-medium",
              isLight ? "text-emerald-800" : "text-emerald-300"
            )}
          >
            {info}
          </p>
        ) : null}
        {err ? (
          <p className="mt-2 text-[11px] font-semibold text-red-500">{err}</p>
        ) : null}
      </div>
    </div>
  );
}
