"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ShieldCheck } from "lucide-react";
import {
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
} from "@/components/auth/auth-plate";
import {
  isValidBvnFormat,
  isValidNinFormat,
} from "@/lib/account-registry";
import { verifyBvnApi, verifyNinApi } from "@/lib/ng-id-verify-client";
import { useApp } from "@/lib/store";
import {
  isIdentityVerified,
  VERIFY_BLOCK_AT,
  VERIFY_WARN_FROM,
} from "@/lib/verification-gate";
import { cn } from "@/lib/utils";

/**
 * In-app identity verification (after signup).
 * Single-screen layout. Unlocks unlimited book / accept once NIN + BVN pass.
 */
export default function VerifyIdentityPage() {
  const router = useRouter();
  const {
    theme,
    isAuthenticated,
    userProfile,
    accountType,
    completeIdentityVerification,
  } = useApp();
  const isLight = theme === "light";

  const [nin, setNin] = useState(userProfile?.idNumber?.replace(/\D/g, "") ?? "");
  const [bvn, setBvn] = useState(userProfile?.bvn?.replace(/\D/g, "") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ninOk, setNinOk] = useState(Boolean(userProfile?.ninVerified));
  const [bvnOk, setBvnOk] = useState(Boolean(userProfile?.bvnVerified));
  const [done, setDone] = useState(isIdentityVerified(userProfile));

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (userProfile?.idNumber) setNin(userProfile.idNumber.replace(/\D/g, ""));
    if (userProfile?.bvn) setBvn(userProfile.bvn.replace(/\D/g, ""));
    setNinOk(Boolean(userProfile?.ninVerified));
    setBvnOk(Boolean(userProfile?.bvnVerified));
    setDone(isIdentityVerified(userProfile));
  }, [userProfile]);

  const submit = async () => {
    if (busy) return;
    setError("");
    if (!isValidNinFormat(nin)) {
      setError("NIN must be exactly 11 digits.");
      return;
    }
    if (!isValidBvnFormat(bvn)) {
      setError("BVN must be exactly 11 digits.");
      return;
    }
    setBusy(true);
    try {
      const [ninRes, bvnRes] = await Promise.all([
        verifyNinApi(nin),
        verifyBvnApi(bvn),
      ]);
      if (!ninRes.ok) {
        setNinOk(false);
        setError(ninRes.message || "NIN verification failed.");
        return;
      }
      setNinOk(true);
      if (!bvnRes.ok) {
        setBvnOk(false);
        setError(bvnRes.message || "BVN verification failed.");
        return;
      }
      setBvnOk(true);
      const err = completeIdentityVerification({ nin, bvn });
      if (err) {
        setError(err);
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = cn(
    "h-10 w-full rounded-lg border-0 px-3 text-[13px] font-medium outline-none",
    isLight
      ? "bg-slate-100 text-slate-900 placeholder:text-slate-400"
      : "bg-white/10 text-white placeholder:text-white/40"
  );

  if (done) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center px-5 text-center",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h2
          className={cn(
            "mt-3 text-[17px] font-bold",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          You&apos;re verified
        </h2>
        <p className="mt-1.5 max-w-[260px] text-[12px] text-muted">
          Book and accept without limits.
        </p>
        <button
          type="button"
          className={cn(authPrimaryBtnClass, "mt-5 h-10 max-w-[260px]")}
          style={authPrimaryBtnStyle}
          onClick={() =>
            router.push(accountType === "professional" ? "/dashboard" : "/")
          }
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <div className="flex shrink-0 items-center gap-1 px-3 pt-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className={cn(
            "inline-flex h-8 items-center gap-0.5 rounded-lg px-1 text-[12px] font-semibold",
            isLight ? "text-slate-800" : "text-white"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <div className="mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15">
          <ShieldCheck className="h-5 w-5 text-brand" />
        </div>
        <h1
          className={cn(
            "mt-2 shrink-0 text-center text-[17px] font-bold",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          Verify your identity
        </h1>
        <p className="mx-auto mt-1 max-w-[300px] shrink-0 text-center text-[11px] leading-snug text-muted">
          Free until request #{VERIFY_WARN_FROM}. Verify NIN and BVN before
          request #{VERIFY_BLOCK_AT} to keep booking or accepting.
        </p>

        <div
          className={cn(
            "mt-3 flex min-h-0 flex-1 flex-col gap-2 rounded-xl p-3",
            isLight ? "bg-slate-50" : "bg-white/5"
          )}
        >
          <label className="block">
            <span
              className={cn(
                "mb-1 flex items-center justify-between text-[11px] font-semibold",
                isLight ? "text-slate-600" : "text-white/70"
              )}
            >
              NIN (11 digits)
              {ninOk && (
                <span className="text-[10px] font-bold text-emerald-600">
                  Verified
                </span>
              )}
            </span>
            <input
              className={fieldClass}
              value={nin}
              onChange={(e) => {
                setNin(e.target.value.replace(/\D/g, "").slice(0, 11));
                setNinOk(false);
                setError("");
              }}
              inputMode="numeric"
              maxLength={11}
              placeholder="National Identification Number"
            />
          </label>

          <label className="block">
            <span
              className={cn(
                "mb-1 flex items-center justify-between text-[11px] font-semibold",
                isLight ? "text-slate-600" : "text-white/70"
              )}
            >
              BVN (11 digits)
              {bvnOk && (
                <span className="text-[10px] font-bold text-emerald-600">
                  Verified
                </span>
              )}
            </span>
            <input
              className={fieldClass}
              value={bvn}
              onChange={(e) => {
                setBvn(e.target.value.replace(/\D/g, "").slice(0, 11));
                setBvnOk(false);
                setError("");
              }}
              inputMode="numeric"
              maxLength={11}
              placeholder="Bank Verification Number"
            />
          </label>

          {error && (
            <p
              className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-red-700"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy || nin.length !== 11 || bvn.length !== 11}
            className={cn(authPrimaryBtnClass, "mt-auto h-10 shrink-0")}
            style={authPrimaryBtnStyle}
            onClick={submit}
          >
            {busy ? "Verifying…" : "Verify NIN & BVN"}
          </button>
        </div>
      </div>
    </div>
  );
}
