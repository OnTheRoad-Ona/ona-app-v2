"use client";

import { useEffect, useMemo, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { ConfirmCancelSheet } from "@/components/ui/confirm-cancel-sheet";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsField,
  SettingsSaveBar,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import { CUSTOMER_PHONE_OTP } from "@/lib/verification-gate";
import { passwordError, passwordRules } from "@/lib/signup-validation";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const TWO_FA_KEY = "ona-2fa-enabled-v1";
const TWO_FA_METHOD_KEY = "ona-2fa-method-v1";
const TWO_FA_SECRET_KEY = "ona-2fa-secret-v1";

type TwoFaMethod = "sms" | "authenticator" | null;
type SetupStep = "idle" | "pick" | "sms" | "authenticator";

function randomSecret(len = 16): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Simple demo TOTP-style code from secret + 30s window (not production crypto) */
function demoTotpCode(secret: string): string {
  const window = Math.floor(Date.now() / 30000);
  let h = 0;
  const s = `${secret}:${window}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(h % 1000000).padStart(6, "0");
}

function storageKey(base: string, email?: string) {
  return `${base}:${email || "guest"}`;
}

/** otpauth URI for authenticator apps (TOTP) */
function authenticatorOtpauth(secret: string, account: string): string {
  const label = encodeURIComponent(`Ona:${account || "user"}`);
  const issuer = encodeURIComponent("Ona");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/** QR image URL for scanning (setup only — one small load) */
function authenticatorQrUrl(secret: string, account: string): string {
  const data = encodeURIComponent(authenticatorOtpauth(secret, account));
  return `https://api.qrserver.com/v1/create-qr-code/?size=168x168&ecc=M&margin=8&data=${data}`;
}

export default function SettingsSecurityPage() {
  const { theme, userProfile, updateUserProfile, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const email = userProfile?.email || "guest";

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [twoFaOn, setTwoFaOn] = useState(false);
  const [method, setMethod] = useState<TwoFaMethod>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>("idle");
  const [secret, setSecret] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [setupErr, setSetupErr] = useState<string | null>(null);
  const [smsSent, setSmsSent] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    try {
      setTwoFaOn(localStorage.getItem(storageKey(TWO_FA_KEY, email)) === "1");
      const m = localStorage.getItem(storageKey(TWO_FA_METHOD_KEY, email));
      setMethod(m === "sms" || m === "authenticator" ? m : null);
      const sec = localStorage.getItem(storageKey(TWO_FA_SECRET_KEY, email));
      if (sec) setSecret(sec);
    } catch {
      /* */
    }
  }, [email]);

  const expectedTotp = useMemo(
    () => (secret ? demoTotpCode(secret) : ""),
    // recompute roughly every second while authenticator step open
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [secret, setupStep, authCode]
  );

  const persistEnabled = (on: boolean, m: TwoFaMethod) => {
    try {
      localStorage.setItem(storageKey(TWO_FA_KEY, email), on ? "1" : "0");
      if (m) {
        localStorage.setItem(storageKey(TWO_FA_METHOD_KEY, email), m);
      } else {
        localStorage.removeItem(storageKey(TWO_FA_METHOD_KEY, email));
      }
      if (secret) {
        localStorage.setItem(storageKey(TWO_FA_SECRET_KEY, email), secret);
      }
    } catch {
      /* */
    }
  };

  const cancelSetup = () => {
    setSetupStep("idle");
    setSetupErr(null);
    setSmsCode("");
    setAuthCode("");
    setSmsSent(false);
    if (!twoFaOn) {
      // already off
    } else if (!method) {
      setTwoFaOn(false);
      persistEnabled(false, null);
    }
  };

  const disableTwoFa = () => {
    setTwoFaOn(false);
    setMethod(null);
    setSetupStep("idle");
    setSetupErr(null);
    persistEnabled(false, null);
  };

  const onToggle = () => {
    if (twoFaOn && method) {
      // Turning off when fully enrolled
      disableTwoFa();
      return;
    }
    if (setupStep !== "idle") {
      // Cancel mid-setup → ensure OFF
      setTwoFaOn(false);
      setMethod(null);
      setSetupStep("idle");
      setSetupErr(null);
      persistEnabled(false, null);
      return;
    }
    // Turning ON → open setup immediately
    const sec = secret || randomSecret();
    setSecret(sec);
    try {
      localStorage.setItem(storageKey(TWO_FA_SECRET_KEY, email), sec);
    } catch {
      /* */
    }
    setTwoFaOn(false); // stays off until enrollment completes
    setSetupStep("pick");
    setSetupErr(null);
    setSmsCode("");
    setAuthCode("");
    setSmsSent(false);
  };

  const completeEnrollment = (m: "sms" | "authenticator") => {
    setTwoFaOn(true);
    setMethod(m);
    setSetupStep("idle");
    setSetupErr(null);
    persistEnabled(true, m);
  };

  const verifySms = () => {
    setSetupErr(null);
    if (smsCode.trim() !== CUSTOMER_PHONE_OTP) {
      setSetupErr(`Enter the 6-digit code sent to your phone (demo ${CUSTOMER_PHONE_OTP})`);
      return;
    }
    completeEnrollment("sms");
  };

  const verifyAuth = () => {
    setSetupErr(null);
    const code = authCode.replace(/\D/g, "");
    if (code.length !== 6) {
      setSetupErr("Enter the 6-digit code from your authenticator app");
      return;
    }
    // Accept current window code or demo OTP for reliability in demo builds
    if (code !== expectedTotp && code !== CUSTOMER_PHONE_OTP) {
      setSetupErr("Code does not match. Try the current code from your app");
      return;
    }
    completeEnrollment("authenticator");
  };

  const rules = passwordRules(next);

  const changePassword = () => {
    setErr(null);
    setMsg(null);
    if (!userProfile) {
      setErr("Sign in first");
      return;
    }
    if (!current) {
      setErr("Enter your current password");
      return;
    }
    if (userProfile.password && current !== userProfile.password) {
      setErr("Current password is incorrect");
      return;
    }
    const pe = passwordError(next);
    if (pe) {
      setErr(pe.replace(/\.$/, ""));
      return;
    }
    if (next !== confirm) {
      setErr("New passwords do not match");
      return;
    }
    setBusy(true);
    const e = updateUserProfile({ password: next });
    setBusy(false);
    if (e) setErr(e.replace(/\.$/, ""));
    else {
      setMsg("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  };

  const card = "bg-transparent";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Security"
        subtitle="Password & account protection"
        backHref="/settings"
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {/* Password */}
        <div className={cn("overflow-hidden rounded-md", card)}>
          <p className={cn("px-3 pt-3 text-[12px] font-bold", ink)}>
            Change password
          </p>
          <SettingsField label="Current password" isLight={isLight}>
            <PasswordInput
              className={settingsInputClass(isLight)}
              value={current}
              onChange={setCurrent}
              isLight={isLight}
              autoComplete="current-password"
            />
          </SettingsField>
          <SettingsField label="New password" isLight={isLight}>
            <PasswordInput
              className={settingsInputClass(isLight)}
              value={next}
              onChange={setNext}
              isLight={isLight}
              autoComplete="new-password"
            />
          </SettingsField>
          <ul className="space-y-0.5 px-3 pb-1 text-[10px] font-medium">
            {(
              [
                ["8+ characters", rules.length],
                ["A capital letter", rules.upper],
                ["A number", rules.digit],
              ] as const
            ).map(([label, ok]) => (
              <li
                key={label}
                className={
                  ok ? "text-emerald-600" : isLight ? "text-slate-500" : "text-white/40"
                }
              >
                {ok ? "✓" : "·"} {label}
              </li>
            ))}
          </ul>
          <SettingsField label="Confirm new password" isLight={isLight}>
            <PasswordInput
              className={settingsInputClass(isLight)}
              value={confirm}
              onChange={setConfirm}
              isLight={isLight}
              autoComplete="new-password"
            />
          </SettingsField>
          <SettingsSaveBar
            isLight={isLight}
            busy={busy}
            msg={msg}
            err={err}
            onSave={changePassword}
            label="Update password"
          />
        </div>

        {/* 2FA */}
        <div className={cn("rounded-md px-3 py-3", card)}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={cn("text-[13px] font-bold", ink)}>
                Two-factor authentication
              </p>
              <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                {twoFaOn && method
                  ? method === "sms"
                    ? "On · SMS"
                    : "On · Authenticator app"
                  : setupStep !== "idle"
                    ? "Complete setup to enable"
                    : isPro
                      ? "Off · recommended for pros"
                      : "Off · recommended"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={twoFaOn || setupStep !== "idle"}
              onClick={onToggle}
              className={cn(
                "h-7 w-12 shrink-0 rounded-full border-0 transition-colors",
                twoFaOn || setupStep !== "idle"
                  ? "bg-[#FF6B35]"
                  : isLight
                    ? "bg-black/20"
                    : "bg-white/20"
              )}
            >
              <span
                className={cn(
                  "block h-5 w-5 rounded-full bg-white transition-transform",
                  twoFaOn || setupStep !== "idle"
                    ? "translate-x-6"
                    : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* Immediate setup when toggle is engaged */}
          {setupStep === "pick" ? (
            <div className="mt-3 space-y-2">
              <p className={cn("text-[12px] font-semibold", ink)}>
                Choose a method
              </p>
              <button
                type="button"
                onClick={() => {
                  setSetupStep("sms");
                  setSmsSent(false);
                  setSetupErr(null);
                }}
                className={cn(
                  "flex w-full flex-col items-start rounded-md border-0 px-3 py-2.5 text-left",
                  isLight ? "bg-black/[0.06]" : "bg-white/[0.08]"
                )}
              >
                <span className={cn("text-[13px] font-bold", ink)}>SMS code</span>
                <span className={cn("text-[11px] font-medium", muted)}>
                  Codes sent to {userProfile?.phone || "your phone"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetupStep("authenticator");
                  setSetupErr(null);
                }}
                className={cn(
                  "flex w-full flex-col items-start rounded-md border-0 px-3 py-2.5 text-left",
                  isLight ? "bg-black/[0.06]" : "bg-white/[0.08]"
                )}
              >
                <span className={cn("text-[13px] font-bold", ink)}>
                  Authenticator app
                </span>
                <span className={cn("text-[11px] font-medium", muted)}>
                  Google Authenticator, Authy, or similar
                </span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className={cn(
                  "w-full border-0 bg-transparent py-2 text-[12px] font-semibold",
                  muted
                )}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {setupStep === "sms" ? (
            <div className="mt-3 space-y-2">
              <p className={cn("text-[12px] font-semibold", ink)}>
                Verify SMS
              </p>
              <p className={cn("text-[11px] font-medium", muted)}>
                We will text a 6-digit code to{" "}
                {userProfile?.phone || "your number"}
              </p>
              {!smsSent ? (
                <button
                  type="button"
                  onClick={() => setSmsSent(true)}
                  className="flex h-10 w-full items-center justify-center rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white"
                >
                  Send code
                </button>
              ) : (
                <>
                  <p className="text-[11px] font-medium text-emerald-600">
                    Code sent (demo {CUSTOMER_PHONE_OTP})
                  </p>
                  <input
                    className={settingsInputClass(isLight)}
                    inputMode="numeric"
                    maxLength={6}
                    value={smsCode}
                    onChange={(e) =>
                      setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="6-digit code"
                  />
                  {setupErr ? (
                    <p className="text-[11px] font-semibold text-red-500">
                      {setupErr}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={verifySms}
                    className="flex h-10 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[12px] font-bold text-white"
                  >
                    Enable SMS 2FA
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setSetupStep("pick");
                  setSetupErr(null);
                }}
                className={cn(
                  "w-full border-0 bg-transparent py-1.5 text-[12px] font-semibold",
                  muted
                )}
              >
                Back to methods
              </button>
            </div>
          ) : null}

          {setupStep === "authenticator" ? (
            <div className="mt-3 space-y-3">
              <p className={cn("text-[12px] font-semibold", ink)}>
                Authenticator setup
              </p>
              <p className={cn("text-[11px] font-medium leading-relaxed", muted)}>
                Open Google Authenticator, Authy, or similar and scan the QR —
                or enter the secret manually if you prefer.
              </p>
              {secret ? (
                <div className="flex flex-col items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={authenticatorQrUrl(secret, email)}
                    alt="Authenticator QR code. Scan with your app"
                    width={168}
                    height={168}
                    className="rounded-lg bg-white p-2"
                    loading="lazy"
                  />
                  <p className={cn("text-[10px] font-medium", muted)}>
                    Scan with your authenticator app
                  </p>
                </div>
              ) : null}
              <div
                className={cn(
                  "rounded-md px-3 py-2 font-mono text-[12px] font-bold tracking-wider break-all",
                  isLight
                    ? "bg-black/[0.08] text-slate-900"
                    : "bg-white/[0.1] text-white"
                )}
              >
                {secret || "Not set"}
              </div>
              <p className={cn("text-[10px] font-medium", muted)}>
                Secret · Account Ona · Time-based (30s)
              </p>
              <input
                className={settingsInputClass(isLight)}
                inputMode="numeric"
                maxLength={6}
                value={authCode}
                onChange={(e) =>
                  setAuthCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="6-digit code from app"
              />
              {setupErr ? (
                <p className="text-[11px] font-semibold text-red-500">
                  {setupErr}
                </p>
              ) : null}
              <button
                type="button"
                onClick={verifyAuth}
                className="flex h-10 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[12px] font-bold text-white"
              >
                Enable authenticator 2FA
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetupStep("pick");
                  setSetupErr(null);
                }}
                className={cn(
                  "w-full border-0 bg-transparent py-1.5 text-[12px] font-semibold",
                  muted
                )}
              >
                Back to methods
              </button>
            </div>
          ) : null}

          {twoFaOn && method && setupStep === "idle" ? (
            <button
              type="button"
              onClick={() => {
                setSetupStep("pick");
                setTwoFaOn(false);
                persistEnabled(false, null);
              }}
              className={cn(
                "mt-2 w-full border-0 bg-transparent py-1 text-left text-[11px] font-semibold",
                muted
              )}
            >
              Change 2FA method
            </button>
          ) : null}
        </div>

      </div>
      <ConfirmCancelSheet
        open={confirmCancel}
        isLight={isLight}
        title="Cancel setup?"
        message="Your security setup will not be saved."
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          cancelSetup();
        }}
      />
    </div>
  );
}
