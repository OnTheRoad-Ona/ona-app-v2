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
import { useApp } from "@/lib/store";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "email" | "phone";

/**
 * Returning user log-in — email/password or phone OTP (SMS).
 */
export function SignInForm() {
  const router = useRouter();
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
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const err = await signInWithPassword(
        email.trim().toLowerCase(),
        password,
        preferType || undefined
      );
      if (err) {
        setError(err);
        unlockAudio();
        playAppSound("error");
        return;
      }
      unlockAudio();
      playAppSound("login_success");
      // Prefer real account type from session (not a wrong tab selection)
      let t =
        localStorage.getItem("oga-mecho-account-type") ||
        preferType ||
        "motorist";
      try {
        const raw = localStorage.getItem("oga-mecho-profile");
        if (raw) {
          const p = JSON.parse(raw) as { accountType?: string };
          if (p.accountType === "professional" || p.accountType === "motorist") {
            t = p.accountType;
          }
        }
      } catch {
        /* ignore */
      }
      // Short delay so login chime can start before hard navigation
      const dest = t === "professional" ? "/dashboard" : "/";
      window.setTimeout(() => {
        window.location.assign(dest);
      }, 280);
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
        preferType || undefined
      );
      if (err) {
        setError(err);
        unlockAudio();
        playAppSound("error");
        return;
      }
      unlockAudio();
      playAppSound("login_success");
      const t =
        preferType ||
        localStorage.getItem("oga-mecho-account-type") ||
        "motorist";
      window.setTimeout(() => {
        router.replace(t === "professional" ? "/dashboard" : "/");
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
          Back
        </button>

        <h1 className="text-[22px] font-bold tracking-tight text-[#1e293b]">
          Log In
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
            Email
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
            Phone code
          </button>
        </div>

        <form
          onSubmit={mode === "email" ? onEmailSubmit : onPhoneSubmit}
          className="mt-4 flex flex-1 flex-col gap-3.5"
        >
          <div>
            <span className={authLabelClass}>Log in as</span>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setPreferType((p) => (p === "motorist" ? "" : "motorist"))
                }
                className={cn(
                  "h-10 rounded-md border-0 text-[12px] font-bold",
                  preferType === "motorist"
                    ? "bg-[#323231] text-white"
                    : "bg-black/[0.06] text-[#1e293b]"
                )}
              >
                Motorist
              </button>
              <button
                type="button"
                onClick={() =>
                  setPreferType((p) =>
                    p === "professional" ? "" : "professional"
                  )
                }
                className={cn(
                  "h-10 rounded-md border-0 text-[12px] font-bold",
                  preferType === "professional"
                    ? "bg-[#323231] text-white"
                    : "bg-black/[0.06] text-[#1e293b]"
                )}
              >
                Repair Pro
              </button>
            </div>
          </div>

          {mode === "email" ? (
            <>
              <label className="block">
                <span className={authLabelClass}>Email</span>
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
                <span className={authLabelClass}>Password</span>
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
                <span className={authLabelClass}>Phone number</span>
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
                  className="text-left text-[12px] font-semibold text-[#e85a12]"
                >
                  Resend code
                </button>
              ) : null}
            </>
          )}

          {mode === "email" && !forgotOpen ? (
            <button
              type="button"
              className="text-left text-[12px] font-semibold text-[#e85a12]"
              onClick={() => {
                setForgotOpen(true);
                setForgotEmail(email);
                setError("");
                setInfo("");
              }}
            >
              Forgot password?
            </button>
          ) : null}

          {forgotOpen && mode === "email" ? (
            <div className="rounded-lg bg-black/[0.04] p-3">
              <p className="text-[12px] font-semibold text-[#1e293b]">
                Reset password
              </p>
              <p className="mt-1 text-[11px] text-[#64748b]">
                We&apos;ll email a link to set a new password. Use the same
                email as your Repair Pro or Motorist account.
              </p>
              <label className="mt-2 block">
                <span className={authLabelClass}>Email</span>
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
                  {forgotBusy ? "Sending…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  className="h-9 rounded-md border-0 bg-black/10 px-3 text-[12px] font-semibold text-[#1e293b]"
                  onClick={() => {
                    setForgotOpen(false);
                    setError("");
                  }}
                >
                  Cancel
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
              ? "Please wait…"
              : mode === "email"
                ? "Log In"
                : otpSent
                  ? "Verify code & log in"
                  : "Send SMS code"}
          </button>

          <button
            type="button"
            className="text-[13px] font-semibold text-[#e85a12]"
            onClick={() => go("/login/role")}
          >
            New here? Sign up
          </button>
        </form>
      </div>
    </AuthPlate>
  );
}
