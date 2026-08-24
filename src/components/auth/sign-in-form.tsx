"use client";

import { useEffect, useRef, useState } from "react";
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

/** Live countdown only after 4 failed OTP attempts */
const FAIL_THRESHOLD = 4;
const COOLDOWN_SEC = 45;

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
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const ambiguousSendRef = useRef(false);

  const showPhone = Boolean(preferType);
  const inCooldown = cooldownLeft > 0;

  // Live countdown tick
  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) setCooldownUntil(0);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function clearFeedback() {
    setError("");
    setInfo("");
  }

  /** Never surface demo codes or SMS-config internals in the UI */
  function publicMessage(raw?: string, fallback = "Something went wrong.") {
    if (!raw) return fallback;
    const s = raw
      .replace(/SMS not configured[^.]*\.?/gi, "")
      .replace(/SMS not sent[^.]*\.?/gi, "")
      .replace(/\s*demo code\s*\d+/gi, "")
      .replace(/\s*or use demo\s*\d+/gi, "")
      .replace(/\b336699\b/g, "")
      .replace(/Use demo code[^.]*\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+\./g, ".")
      .trim();
    if (!s || /demo/i.test(s) || /not configured/i.test(s)) return fallback;
    return s;
  }

  function startCooldown(sec = COOLDOWN_SEC) {
    setCooldownUntil(Date.now() + sec * 1000);
    setCooldownLeft(sec);
  }

  function pickRole(type: AccountType) {
    setPreferType(type);
    ambiguousSendRef.current = false;
    setOtpSent(false);
    setOtp("");
    setFailedAttempts(0);
    setCooldownUntil(0);
    clearFeedback();
  }

  const pill = (active: boolean) =>
    cn(
      "h-10 rounded-md border-0 text-[12px] font-bold transition-colors",
      active
        ? "bg-[#323231] text-white"
        : "bg-black/[0.06] text-[#1e293b] hover:bg-black/[0.1]",
    );

  async function onSendCode() {
    clearFeedback();
    if (preferType !== "motorist" && preferType !== "professional") {
      setError(t("auth.pickRole"));
      return;
    }
    // Cooldown message only after 4 failed attempts live countdown
    if (failedAttempts >= FAIL_THRESHOLD && inCooldown) {
      setError(`Please wait ${cooldownLeft}s before requesting another code.`);
      return;
    }
    const target = phone.trim();
    if (!target) {
      setError("Enter the phone number you used at signup.");
      return;
    }
    setBusy(true);
    try {
      // After a maybe-sent result the next tap is a deliberate resend, so the
      // idempotency key is cleared and a fresh code genuinely goes out.
      const res = await sendLoginOtp("phone", target, {
        forceResend: ambiguousSendRef.current,
      });
      if (res.error) {
        // Parse server wait if present (after 4 fails)
        const waitMatch = res.error.match(/wait\s+(\d+)\s*s/i);
        if (waitMatch) {
          const sec = Number(waitMatch[1]) || COOLDOWN_SEC;
          startCooldown(sec);
          setError(`Please wait ${sec}s before requesting another code.`);
          return;
        }
        setError(publicMessage(res.error, "Could not send code."));
        return;
      }
      if (res.maybeSent) {
        // Outcome unproven (response lost) stay neutral, never block.
        ambiguousSendRef.current = true;
        setInfo(
          "Code request may not have gone through. If nothing arrives, tap send again.",
        );
        return;
      }
      ambiguousSendRef.current = false;
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
        preferType,
      );
      if (err) {
        const nextFails = failedAttempts + 1;
        setFailedAttempts(nextFails);
        // After 4 failed attempts → start live resend cooldown
        if (nextFails >= FAIL_THRESHOLD) {
          startCooldown(COOLDOWN_SEC);
          setError(
            `Please wait ${COOLDOWN_SEC}s before requesting another code.`,
          );
        } else {
          setError(publicMessage(err, "Incorrect code. Try again."));
        }
        unlockAudio();
        playAppSound("error");
        return;
      }
      setFailedAttempts(0);
      setCooldownUntil(0);
      unlockAudio();
      playAppSound("login_success");
      window.setTimeout(() => {
        router.replace(preferType === "professional" ? "/dashboard" : "/");
      }, 280);
    } finally {
      setBusy(false);
    }
  }

  // Keep error line live while counting down
  const displayError =
    failedAttempts >= FAIL_THRESHOLD && inCooldown
      ? `Please wait ${cooldownLeft}s before requesting another code.`
      : error;

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

        <form onSubmit={onSubmit} className="mt-4 flex flex-1 flex-col gap-4">
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
                    ambiguousSendRef.current = false;
                    setOtpSent(false);
                    setOtp("");
                    setFailedAttempts(0);
                    setCooldownUntil(0);
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
                  disabled={
                    busy || (failedAttempts >= FAIL_THRESHOLD && inCooldown)
                  }
                  onClick={() => void onSendCode()}
                  className="text-left text-[12px] font-semibold text-[#FF6B35] disabled:opacity-50"
                >
                  {failedAttempts >= FAIL_THRESHOLD && inCooldown
                    ? `Please wait ${cooldownLeft}s before requesting another code.`
                    : t("auth.resendCode")}
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
              {displayError ? (
                <p
                  className="text-[12px] font-medium text-red-600 tabular-nums"
                  role="alert"
                >
                  {displayError}
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
              showPhone ? "" : "mt-auto",
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
