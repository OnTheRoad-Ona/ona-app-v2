"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  AuthPlate,
  authBackBtnClass,
  authFieldClass,
  authLabelClass,
} from "@/components/auth/auth-plate";
import { useAuthNavigate } from "@/components/auth/auth-transition";
import { PasswordField } from "@/components/auth/password-field";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Near-black for Forgot password / New here? Sign up (auth plate is always light gray) */
const AUTH_LINK_NEAR_BLACK = "#0a0a0a";

type Mode = "email" | "phone";

/**
 * Returning user log-in — email/password or phone OTP (SMS).
 */
export function SignInForm() {
  const router = useRouter();
  const t = useT();
  const { exiting, go } = useAuthNavigate();
  const { signInWithPassword, sendPhoneOtp, signInWithPhoneOtp } = useApp();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [preferType, setPreferType] = useState<AccountType | "">("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!preferType) {
      setError(t("auth.pickRole"));
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const err = await signInWithPassword(
        email.trim().toLowerCase(),
        password,
        preferType
      );
      if (err) {
        setError(err);
        unlockAudio();
        playAppSound("error");
        return;
      }
      unlockAudio();
      playAppSound("login_success");
      // Go to the role they selected
      const dest = preferType === "professional" ? "/dashboard" : "/";
      window.setTimeout(() => {
        router.replace(dest);
      }, 180);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Login failed. Check your connection."
      );
      playAppSound("error");
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const target = (forgotEmail || email).trim().toLowerCase();
    if (!target) {
      setError("Enter the email for your account.");
      return;
    }
    setForgotBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setError(json?.error?.message || "Could not send reset email.");
        return;
      }
      setInfo(
        json.data?.message ||
          "If an account exists, a password reset link was sent. Check inbox and spam."
      );
    } finally {
      setForgotBusy(false);
    }
  }

  async function onSendCode() {
    setError("");
    setInfo("");
    if (!preferType) {
      setError(t("auth.pickRole"));
      return;
    }
    if (!phone.trim()) {
      setError("Enter the phone number you used at signup.");
      return;
    }
    setBusy(true);
    try {
      const err = await sendPhoneOtp(phone.trim());
      if (err) {
        setError(err);
        return;
      }
      setOtpSent(true);
      setInfo("Code sent by SMS. Enter it below (valid 10 minutes).");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!preferType) {
      setError(t("auth.pickRole"));
      return;
    }
    if (!otpSent) {
      await onSendCode();
      return;
    }
    if (!otp.trim()) {
      setError("Enter the 6-digit code from SMS.");
      return;
    }
    setBusy(true);
    try {
      const err = await signInWithPhoneOtp(
        phone.trim(),
        otp.trim(),
        preferType
      );
      if (err) {
        setError(err);
        unlockAudio();
        playAppSound("error");
        return;
      }
      unlockAudio();
      playAppSound("login_success");
      window.setTimeout(() => {
        router.replace(
          preferType === "professional" ? "/dashboard" : "/"
        );
      }, 280);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPlate exiting={exiting}>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-5 pt-5">
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.removeItem("oga-mecho-entry-done");
            } catch {
              /* ignore */
            }
            go("/login");
          }}
          className={authBackBtnClass}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          {t("common.back")}
        </button>

        <h1 className="text-[22px] font-bold tracking-tight text-[#1e293b]">
          {t("auth.logIn")}
        </h1>

        {/* Mode tabs */}
        <div className="mt-4 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode("email");
              setError("");
              setInfo("");
            }}
            className={cn(
              "h-10 rounded-md border-0 text-[12px] font-bold",
              mode === "email"
                ? "bg-[#323231] text-white"
                : "bg-black/[0.06] text-[#1e293b]"
            )}
          >
            {t("auth.emailTab")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("phone");
              setError("");
              setInfo("");
            }}
            className={cn(
              "h-10 rounded-md border-0 text-[12px] font-bold",
              mode === "phone"
                ? "bg-[#323231] text-white"
                : "bg-black/[0.06] text-[#1e293b]"
            )}
          >
            {t("auth.phoneTab")}
          </button>
        </div>

        <form
          onSubmit={mode === "email" ? onEmailSubmit : onPhoneSubmit}
          className="mt-4 flex flex-1 flex-col gap-3.5"
        >
          <div>
            <span className={authLabelClass}>{t("auth.loginAs")}</span>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPreferType("motorist");
                  setError("");
                }}
                className={cn(
                  "h-10 rounded-md border-0 text-[12px] font-bold",
                  preferType === "motorist"
                    ? "bg-[#323231] text-white"
                    : "bg-black/[0.06] text-[#1e293b]"
                )}
              >
                {t("auth.motorist")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreferType("professional");
                  setError("");
                }}
                className={cn(
                  "h-10 rounded-md border-0 text-[12px] font-bold",
                  preferType === "professional"
                    ? "bg-[#323231] text-white"
                    : "bg-black/[0.06] text-[#1e293b]"
                )}
              >
                {t("auth.pro")}
              </button>
            </div>
          </div>

          {mode === "email" ? (
            <>
              <label className="block">
                <span className={authLabelClass}>{t("auth.email")}</span>
                <input
                  className={authFieldClass}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  required
                />
              </label>
              <label className="block">
                <span className={authLabelClass}>{t("auth.password")}</span>
                <PasswordField
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <span className={authLabelClass}>{t("auth.phone")}</span>
                <input
                  className={authFieldClass}
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setOtpSent(false);
                    setOtp("");
                  }}
                  placeholder="+234 801 234 5678"
                  required
                />
              </label>
              {otpSent ? (
                <label className="block">
                  <span className={authLabelClass}>SMS code</span>
                  <input
                    className={authFieldClass}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6-digit code"
                    required
                  />
                </label>
              ) : null}
              {otpSent ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSendCode()}
                  className="text-left text-[12px] font-semibold text-[#FF6B35]"
                >
                  {t("auth.resendCode")}
                </button>
              ) : null}
            </>
          )}

          {mode === "email" && !forgotOpen ? (
            <button
              type="button"
              className="border-0 bg-transparent p-0 text-left text-[12px] font-semibold"
              style={{ color: AUTH_LINK_NEAR_BLACK }}
              onClick={() => {
                setForgotOpen(true);
                setForgotEmail(email);
                setError("");
                setInfo("");
              }}
            >
              {t("auth.forgotPassword")}
            </button>
          ) : null}

          {forgotOpen && mode === "email" ? (
            <div className="rounded-lg bg-black/[0.04] p-3">
              <p className="text-[12px] font-semibold text-[#1e293b]">
                {t("auth.resetPassword")}
              </p>
              <p className="mt-1 text-[11px] text-[#64748b]">
                We&apos;ll email a link to set a new password. Use the same
                email as your Repair Pro or Motorist account.
              </p>
              <label className="mt-2 block">
                <span className={authLabelClass}>{t("auth.email")}</span>
                <input
                  className={authFieldClass}
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={forgotBusy}
                  onClick={(e) => void onForgotPassword(e as unknown as React.FormEvent)}
                  className="h-9 flex-1 rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white"
                >
                  {forgotBusy ? t("auth.sending") : t("auth.sendResetLink")}
                </button>
                <button
                  type="button"
                  className="h-9 rounded-md border-0 bg-black/10 px-3 text-[12px] font-semibold text-[#1e293b]"
                  onClick={() => {
                    setForgotOpen(false);
                    setError("");
                  }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : null}

          {info ? (
            <p className="text-[12px] font-medium text-emerald-700" role="status">
              {info}
            </p>
          ) : null}
          {error ? (
            <p className="text-[12px] font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || forgotOpen}
            className="om-cta-dark-gray mt-auto"
            style={{
              WebkitAppearance: "none",
              appearance: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: 44,
              border: "none",
              borderRadius: 6,
              background: "#323231",
              backgroundColor: "#323231",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy
              ? t("auth.pleaseWait")
              : mode === "email"
                ? t("auth.logIn")
                : otpSent
                  ? t("auth.verifyAndLogin")
                  : t("auth.sendSmsCode")}
          </button>

          <button
            type="button"
            className="border-0 bg-transparent p-0 text-[13px] font-semibold"
            style={{ color: AUTH_LINK_NEAR_BLACK }}
            onClick={() => go("/login/role")}
          >
            {t("auth.newHere")}
          </button>
        </form>
      </div>
    </AuthPlate>
  );
}
