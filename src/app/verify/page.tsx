"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ShieldCheck } from "lucide-react";
import {
  authFieldClass,
  authLabelClass,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
} from "@/components/auth/auth-plate";
import {
  isValidBvnFormat,
  isValidNinFormat,
} from "@/lib/account-registry";
import { verifyBvnApi, verifyNinApi } from "@/lib/ng-id-verify-client";
import { defaultBackHref, navigateBack } from "@/lib/navigation";
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
      const err = await completeIdentityVerification({ nin, bvn });
      if (err) {
        setError(err);
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

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
          You can book and accept jobs without limit.
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
          onClick={() =>
            navigateBack(router, defaultBackHref())
          }
          className={cn(
            "inline-flex h-8 items-center gap-0.5 rounded-lg border-0 bg-transparent px-1 text-[12px] font-semibold",
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
          Free try until job {VERIFY_WARN_FROM}. Verify your NIN and BVN before
          job {VERIFY_BLOCK_AT} so you can keep booking or accepting work.
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
                authLabelClass,
                "mb-1 flex items-center justify-between"
              )}
            >
              NIN (11 numbers)
              {ninOk && (
                <span className="text-[10px] font-bold text-emerald-600">
                  Verified
                </span>
              )}
            </span>
            <input
              className={authFieldClass}
              value={nin}
              onChange={(e) => {
                setNin(e.target.value.replace(/\D/g, "").slice(0, 11));
                setNinOk(false);
                setError("");
              }}
              inputMode="numeric"
              maxLength={11}
              placeholder="Your 11 digit NIN"
            />
          </label>

          <label className="block">
            <span
              className={cn(
                authLabelClass,
                "mb-1 flex items-center justify-between"
              )}
            >
              BVN (11 numbers)
              {bvnOk && (
                <span className="text-[10px] font-bold text-emerald-600">
                  Verified
                </span>
              )}
            </span>
            <input
              className={authFieldClass}
              value={bvn}
              onChange={(e) => {
                setBvn(e.target.value.replace(/\D/g, "").slice(0, 11));
                setBvnOk(false);
                setError("");
              }}
              inputMode="numeric"
              maxLength={11}
              placeholder="Your 11 digit BVN"
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
            {busy ? "Please wait…" : "Verify NIN and BVN"}
          </button>
        </div>
      </div>
    </div>
  );
}
