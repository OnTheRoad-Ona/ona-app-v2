"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  Phone,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  authFieldClass,
  authLabelClass,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
} from "@/components/auth/auth-plate";
import {
  filterIdInput,
  getCountryIdPack,
  type CountryIdDoc,
  validateIdFormat,
} from "@/lib/country-id-rules";
import { defaultBackHref, navigateBack } from "@/lib/navigation";
import { splitStoredPhone } from "@/lib/phone-codes";
import { useApp } from "@/lib/store";
import {
  CUSTOMER_PHONE_OTP,
  customerTierLabel,
  isIdentityPending,
  isIdentityVerified,
  isPhoneVerified,
  remainingFreeActions,
  VERIFY_FREE_ACTIONS,
} from "@/lib/verification-gate";
import { cn } from "@/lib/utils";

/**
 * Customer verification
 * Tier 1 — Phone OTP (demo code 336699)
 * Tier 2 — Country ID type + number + photo → admin/care review
 */
export default function VerifyIdentityPage() {
  const router = useRouter();
  const {
    theme,
    isAuthenticated,
    userProfile,
    accountType,
    completeIdentityVerification,
    verifyCustomerPhoneOtp,
  } = useApp();
  const isLight = theme === "light";

  const countryIso = useMemo(() => {
    if (userProfile?.identityCountryIso) {
      return userProfile.identityCountryIso.toUpperCase();
    }
    if (userProfile?.phone) {
      return splitStoredPhone(userProfile.phone).iso.toUpperCase();
    }
    return "NG";
  }, [userProfile?.identityCountryIso, userProfile?.phone]);

  const pack = useMemo(() => getCountryIdPack(countryIso), [countryIso]);
  /** Primary ID types for this country (exclude bank-only as standalone pick) */
  const idTypes = useMemo(
    () =>
      pack.docs.filter(
        (d) => d.kind !== "bank_id" && (d.requiredForVerify || d.needsFront)
      ),
    [pack]
  );

  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idFront, setIdFront] = useState("");
  const [idFrontName, setIdFrontName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const phoneOk = isPhoneVerified(userProfile);
  const tier2Ok = isIdentityVerified(userProfile);
  const pending = isIdentityPending(userProfile);
  const freeLeft = remainingFreeActions(userProfile);
  const tier = customerTierLabel(userProfile);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (accountType === "professional") {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, accountType, router]);

  useEffect(() => {
    setSubmitted(pending || tier2Ok);
    if (userProfile?.idNumber) setIdNumber(userProfile.idNumber);
    if (userProfile?.govIdKind) setIdType(userProfile.govIdKind);
    if (userProfile?.govIdFrontUrl) setIdFront(userProfile.govIdFrontUrl);
  }, [userProfile, pending, tier2Ok]);

  const selectedDoc: CountryIdDoc | undefined = useMemo(
    () => idTypes.find((d) => d.kind === idType) || idTypes[0],
    [idTypes, idType]
  );

  useEffect(() => {
    if (!idType && idTypes[0]) setIdType(idTypes[0].kind);
  }, [idTypes, idType]);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("read_failed"));
      r.readAsDataURL(file);
    });

  const sendDemoOtp = () => {
    setOtpMsg(
      `Code sent. For now enter ${CUSTOMER_PHONE_OTP} (demo OTP).`
    );
    setError("");
  };

  const confirmPhone = async () => {
    setOtpBusy(true);
    setError("");
    try {
      const err = await verifyCustomerPhoneOtp(otp);
      if (err) {
        setError(err);
        return;
      }
      setOtpMsg("Phone verified · Tier 1 complete.");
      setOtp("");
    } finally {
      setOtpBusy(false);
    }
  };

  const submitId = async () => {
    if (busy) return;
    setError("");
    if (!phoneOk) {
      setError("Complete phone verification (Tier 1) first.");
      return;
    }
    const doc = selectedDoc;
    if (!doc) {
      setError("Pick an ID type for your country.");
      return;
    }
    const val = filterIdInput(idNumber, doc);
    const fmt = validateIdFormat(val, doc);
    if (!fmt.ok) {
      setError(fmt.message);
      return;
    }
    if (!idFront) {
      setError(`Upload a clear photo of your ${doc.label}.`);
      return;
    }
    setBusy(true);
    try {
      const err = await completeIdentityVerification({
        primaryId: val,
        nin: doc.api === "nin" ? val : undefined,
        countryIso,
        govIdKind: doc.kind,
        govIdFrontUrl: idFront,
        mode: "submit",
      });
      if (err) {
        setError(err);
        return;
      }
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  };

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";
  const card = isLight ? "bg-black/[0.05]" : "bg-white/[0.06]";

  if (tier2Ok) {
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
        <h2 className={cn("mt-3 text-[17px] font-bold", ink)}>
          Tier 2 approved
        </h2>
        <p className={cn("mt-1.5 max-w-[280px] text-[12px]", muted)}>
          Your ID was approved by admin / customer care. You can book without
          the free-request limit.
        </p>
        <button
          type="button"
          className={cn(authPrimaryBtnClass, "mt-4")}
          style={authPrimaryBtnStyle}
          onClick={() => router.replace("/")}
        >
          Back home
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={() => navigateBack(router, defaultBackHref(accountType))}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent",
            ink
          )}
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className={cn("text-[16px] font-bold", ink)}>Verification</h1>
          <p className={cn("text-[11px] font-medium", muted)}>
            {tier} · {pack.countryName}
            {phoneOk && freeLeft < Infinity
              ? ` · ${freeLeft} free request${freeLeft === 1 ? "" : "s"} left`
              : ""}
          </p>
        </div>
        <ShieldCheck className="h-5 w-5 shrink-0 text-[#FF6B35]" />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {error ? (
          <p className="rounded-md bg-red-500/15 px-3 py-2 text-[12px] font-medium text-red-600">
            {error}
          </p>
        ) : null}

        {/* Tier 1 — Phone */}
        <section className={cn("rounded-xl px-3 py-3", card)}>
          <p className={cn("flex items-center gap-2 text-[13px] font-bold", ink)}>
            <Phone className="h-4 w-4 text-[#FF6B35]" />
            Tier 1 · Phone
          </p>
          <p className={cn("mt-1 text-[11px]", muted)}>
            {phoneOk
              ? "Verified"
              : "Confirm your phone with a one-time code."}
          </p>
          {phoneOk ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />{" "}
              {userProfile?.phone || "Phone verified"}
            </p>
          ) : (
            <>
              <p className={cn("mt-2 text-[11px] font-medium", muted)}>
                {userProfile?.phone || "No phone on account"}
              </p>
              <button
                type="button"
                onClick={sendDemoOtp}
                className="mt-2 text-[11px] font-bold text-[#FF6B35]"
              >
                Send code
              </button>
              {otpMsg ? (
                <p className={cn("mt-1 text-[11px]", muted)}>{otpMsg}</p>
              ) : null}
              <label className={cn(authLabelClass, "mt-2")}>OTP code</label>
              <input
                className={authFieldClass}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={CUSTOMER_PHONE_OTP}
                inputMode="numeric"
                maxLength={6}
              />
              <button
                type="button"
                disabled={otpBusy || otp.length < 4}
                onClick={() => void confirmPhone()}
                className={cn(authPrimaryBtnClass, "mt-2 h-10 disabled:opacity-50")}
                style={authPrimaryBtnStyle}
              >
                {otpBusy ? "Checking…" : "Verify phone"}
              </button>
            </>
          )}
        </section>

        {/* Tier 2 — Country ID */}
        <section className={cn("rounded-xl px-3 py-3", card)}>
          <p className={cn("flex items-center gap-2 text-[13px] font-bold", ink)}>
            <Upload className="h-4 w-4 text-[#FF6B35]" />
            Tier 2 · Government ID
          </p>
          <p className={cn("mt-1 text-[11px]", muted)}>
            {submitted
              ? "Submitted — waiting for admin / customer care approval."
              : `ID types for ${pack.countryName}. After ${VERIFY_FREE_ACTIONS} free requests you must upload ID to keep booking.`}
          </p>

          {submitted ? (
            <p className="mt-3 text-[12px] font-semibold text-amber-600">
              Under review · you cannot create new requests until approved
              {getServiceCountNote(userProfile)}
            </p>
          ) : (
            <>
              <label className={cn(authLabelClass, "mt-3")}>ID type</label>
              <select
                className={authFieldClass}
                value={idType}
                onChange={(e) => {
                  setIdType(e.target.value);
                  setIdNumber("");
                  setIdFront("");
                  setIdFrontName("");
                }}
                disabled={!phoneOk}
              >
                {idTypes.map((d) => (
                  <option key={d.kind} value={d.kind}>
                    {d.label}
                  </option>
                ))}
              </select>

              <label className={cn(authLabelClass, "mt-2")}>
                {selectedDoc?.label || "ID"} number
              </label>
              <input
                className={authFieldClass}
                value={idNumber}
                onChange={(e) =>
                  setIdNumber(
                    selectedDoc
                      ? filterIdInput(e.target.value, selectedDoc)
                      : e.target.value
                  )
                }
                placeholder={selectedDoc?.placeholder || "ID number"}
                disabled={!phoneOk}
              />
              {selectedDoc?.hint ? (
                <p className={cn("mt-0.5 text-[10px]", muted)}>
                  {selectedDoc.hint}
                </p>
              ) : null}

              <label
                className={cn(
                  "mt-3 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-0 text-[12px] font-bold",
                  isLight ? "bg-black/10 text-slate-800" : "bg-[#2c2c2e] text-white",
                  !phoneOk && "pointer-events-none opacity-50"
                )}
              >
                <Upload className="h-3.5 w-3.5" />
                {idFrontName || idFront
                  ? `Photo: ${idFrontName || "uploaded"}`
                  : "Upload ID photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!phoneOk}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setIdFront(await readFile(f));
                      setIdFrontName(f.name);
                      setError("");
                    } catch {
                      setError("Could not read photo.");
                    }
                  }}
                />
              </label>

              <button
                type="button"
                disabled={busy || !phoneOk}
                onClick={() => void submitId()}
                className={cn(authPrimaryBtnClass, "mt-3 h-10 disabled:opacity-50")}
                style={authPrimaryBtnStyle}
              >
                {busy ? "Submitting…" : "Submit ID for review"}
              </button>
            </>
          )}
        </section>

        <p className={cn("px-1 text-center text-[10px] leading-snug", muted)}>
          Tier 1 alone allows {VERIFY_FREE_ACTIONS} requests. Then booking is
          suspended until Tier 2 ID is approved by admin / customer care.
        </p>
      </div>
    </div>
  );
}

function getServiceCountNote(
  profile: { serviceActionCount?: number } | null | undefined
): string {
  const n = profile?.serviceActionCount ?? 0;
  if (n >= VERIFY_FREE_ACTIONS) return ".";
  return ` · ${n}/${VERIFY_FREE_ACTIONS} free used.`;
}
