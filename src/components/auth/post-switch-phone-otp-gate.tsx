"use client";

/**
 * After Tap to Switch: block until phone OTP is re-entered.
 * No demo-code copy in UI. Resend unlocks after 66s countdown (66→0).
 */

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { useOverlayGatesReady } from "@/lib/use-overlay-gates-ready";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN_SEC = 66;

export function PostSwitchPhoneOtpGate() {
  const {
    theme,
    isAuthenticated,
    postSwitchPhoneOtpRequired,
    userProfile,
    sendPostSwitchPhoneOtp,
    completePostSwitchPhoneOtp,
  } = useApp();
  const gatesReady = useOverlayGatesReady();
  const isLight = theme === "light";
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const open =
    gatesReady &&
    isAuthenticated &&
    postSwitchPhoneOtpRequired &&
    Boolean(userProfile?.phone);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startResendCountdown = () => {
    clearTimer();
    setResendIn(RESEND_COOLDOWN_SEC);
    timerRef.current = setInterval(() => {
      setResendIn((n) => {
        if (n <= 1) {
          clearTimer();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (!open) {
      setCode("");
      setSent(false);
      setErr(null);
      setInfo(null);
      setResendIn(0);
      clearTimer();
    }
    return () => clearTimer();
  }, [open]);

  if (!open) return null;

  const onSend = async () => {
    if (resendIn > 0 && sent) return;
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
    setInfo("Code sent to your registered phone.");
    startResendCountdown();
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
          "w-full max-w-[360px] rounded-xl p-4 shadow-xl",
          isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white",
        )}
      >
        <p className="text-[17px] font-bold tracking-tight">Confirm it’s you</p>
        <p
          className={cn(
            "mt-1 text-[13px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/60",
          )}
        >
          You switched roles. Enter the code sent to{" "}
          <span className="font-semibold">{userProfile?.phone}</span> to
          continue.
        </p>

        {!sent ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSend()}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl border-0 bg-[#323231] text-[15px] font-semibold text-white disabled:opacity-50"
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
                "h-12 w-full border-0 border-b bg-transparent px-0 text-center text-[20px] font-semibold tracking-widest outline-none",
                isLight
                  ? "border-black/15 text-slate-900"
                  : "border-white/20 text-white",
              )}
            />
            <button
              type="button"
              disabled={busy || code.length < 4}
              onClick={() => void onVerify()}
              className="flex h-12 w-full items-center justify-center rounded-xl border-0 bg-[#FF6B35] text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Checking…" : "Verify & continue"}
            </button>
            {resendIn > 0 ? (
              <p
                className={cn(
                  "py-1 text-center text-[12px] font-medium",
                  isLight ? "text-slate-500" : "text-white/45",
                )}
              >
                Resend verification code in {resendIn}s
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSend()}
                className={cn(
                  "w-full border-0 bg-transparent py-2 text-[13px] font-semibold",
                  isLight ? "text-[#FF6B35]" : "text-[#FF6B35]",
                )}
              >
                Resend verification code
              </button>
            )}
          </div>
        )}

        {info ? (
          <p
            className={cn(
              "mt-2 text-[11px] font-medium",
              isLight ? "text-emerald-800" : "text-emerald-300",
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
