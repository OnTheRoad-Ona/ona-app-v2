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
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Near-black for secondary links (auth plate is always light gray) */
const AUTH_LINK_NEAR_BLACK = "#0a0a0a";

/**
 * Phone-only login (email is signup-only).
 * Unfolds on one page: Role → phone + code.
 */
export function SignInForm() {
  const router = useRouter();
  const t = useT();
  const { exiting, go } = useAuthNavigate();
  const { sendLoginOtp, signInWithLoginOtp } = useApp();

  const [preferType, setPreferType] = useState<AccountType | "">("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const showPhone = Boolean(preferType);

  function clearFeedback() {
    setError("");
    setInfo("");
  }

  /** Never surface demo codes in the UI */
  function publicMessage(raw?: string, fallback = "Something went wrong.") {
    if (!raw) return fallback;
    let s = raw
      .replace(/\s*demo code\s*\d+/gi, "")
      .replace(/\s*or use demo\s*\d+/gi, "")
      .replace(/\b336699\b/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+\./g, ".")
      .trim();
    if (!s || /demo/i.test(s)) return fallback;
    return s;
  }

  function pickRole(type: AccountType) {
    setPreferType(type);
    setOtpSent(false);
    setOtp("");
    clearFeedback();
  }

  const pill = (active: boolean) =>
    cn(
      "h-10 rounded-md border-0 text-[12px] font-bold transition-colors",
      active
        ? "bg-[#323231] text-white"
        : "bg-black/[0.06] text-[#1e293b] hover:bg-black/[0.1]"
    );

  async function onSendCode() {
    clearFeedback();
    if (preferType !== "motorist" && preferType !== "professional") {
      setError(t("auth.pickRole"));
      return;
    }
    const target = phone.trim();
    if (!target) {
      setError("Enter the phone number you used at signup.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendLoginOtp("phone", target);
      if (res.error) {
        setError(publicMessage(res.error, "Could not send code."));
        return;
      }
      setOtpSent(true);
      const msg = res.message || "Code sent. Enter it below.";
      setInfo(publicMessage(msg, "Code sent. Enter it below."));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearFeedback();
    if (preferType !== "motorist" && preferType !== "professional") {
      setError(t("auth.pickRole"));
      return;
    }
    if (!otpSent) {
      await onSendCode();
      return;
    }
    if (!otp.trim()) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const err = await signInWithLoginOtp(
        "phone",
        phone.trim(),
        otp.trim(),
        preferType
      );
      if (err) {
        setError(publicMessage(err, "Incorrect code. Try again."));
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
              sessionStorage.removeItem("ona-entry-done");
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
        <p className="mt-1 text-[12px] font-medium text-[#64748b]">
          Use the exact phone number you registered at signup
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-4 flex flex-1 flex-col gap-4"
        >
          {/* 1) Role */}
          <div>
            <span className={authLabelClass}>{t("auth.loginAs")}</span>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => pickRole("motorist")}
                className={pill(preferType === "motorist")}
              >
                {t("auth.motorist")}
              </button>
              <button
                type="button"
                onClick={() => pickRole("professional")}
                className={pill(preferType === "professional")}
              >
                {t("auth.pro")}
              </button>
            </div>
          </div>

          {/* 2) Phone fields — unfold after role */}
          {showPhone ? (
            <div className="om-sheet-spring flex flex-1 flex-col gap-3.5">
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
                    clearFeedback();
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

              {info ? (
                <p
                  className="text-[12px] font-medium text-emerald-700"
                  role="status"
                >
                  {info}
                </p>
              ) : null}
              {error ? (
                <p
                  className="text-[12px] font-medium text-red-600"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
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
                  : otpSent
                    ? t("auth.verifyAndLogin")
                    : "Send code"}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            className={cn(
              "border-0 bg-transparent p-0 text-[13px] font-semibold",
              showPhone ? "" : "mt-auto"
            )}
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
