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
  getFirstServiceAt,
  isIdentityPending,
  isIdentityVerified,
  isPhoneVerified,
  remainingFreeActions,
  TIER1_TRIAL_DAYS,
} from "@/lib/verification-gate";
import { cn } from "@/lib/utils";

/**
 * Customer verification (customers only)
 * Tier 1 — Phone OTP (demo code 336699)
 * Tier 2 — Country ID type + number + photo → admin/care review + approval
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
  const daysLeft = remainingFreeActions(userProfile);
  const tier = customerTierLabel(userProfile);
  const trialStarted = Boolean(getFirstServiceAt(userProfile));

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
  // Soft grey cards (not pure white) — matches app shell
  const card = isLight ? "bg-[#d4d5d9]" : "bg-white/[0.06]";
  const shell = isLight ? "bg-[#c8c9cd]" : "bg-black";

  if (tier2Ok) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center px-5 text-center",
          shell
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className={cn("mt-4 text-[17px] font-bold", ink)}>
          Tier 2 approved
        </h2>
        <p className={cn("mt-2 max-w-[280px] text-[12px] leading-relaxed", muted)}>
          Your ID was submitted and approved by admin / customer care. You can
          book without the free-period limit.
        </p>
        <button
          type="button"
          className={cn(authPrimaryBtnClass, "mt-6")}
          style={authPrimaryBtnStyle}
          onClick={() => router.replace("/")}
        >
          Back home
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", shell)}>
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-1.5 pt-2.5">
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
          <h1 className={cn("text-[15px] font-bold leading-tight", ink)}>
            Verification
          </h1>
          <p className={cn("text-[10px] font-medium leading-snug", muted)}>
            {tier} · {pack.countryName}
            {phoneOk && daysLeft < Infinity
              ? trialStarted
                ? ` · ${daysLeft} free day${daysLeft === 1 ? "" : "s"} left`
                : ` · ${TIER1_TRIAL_DAYS}-day free period from first request`
              : ""}
          </p>
        </div>
        <ShieldCheck className="h-4 w-4 shrink-0 text-[#FF6B35]" />
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-3 scrollbar-hide">
        {error ? (
          <p className="rounded-lg bg-red-500/15 px-3 py-2 text-[11px] font-medium text-red-600">
            {error}
          </p>
        ) : null}

        {/* Tier 1 — Phone */}
        <section className={cn("rounded-xl px-3 py-3", card)}>
          <p className={cn("flex items-center gap-1.5 text-[12px] font-bold", ink)}>
            <Phone className="h-3.5 w-3.5 text-[#FF6B35]" />
            Tier 1 · Phone
          </p>
          <p className={cn("mt-1 text-[11px] leading-snug", muted)}>
            {phoneOk
              ? "Verified — free booking for 30 days from your first request."
              : "Confirm your phone with a one-time code."}
          </p>
          {phoneOk ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />{" "}
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
                className="mt-1.5 text-[11px] font-bold text-[#FF6B35]"
              >
                Send code
              </button>
              {otpMsg ? (
                <p className={cn("mt-1 text-[10px] leading-snug", muted)}>
                  {otpMsg}
                </p>
              ) : null}
              {/* gap: om-cta-dark-gray forces margin:0 */}
              <div className="mt-2.5 flex flex-col gap-2">
                <div>
                  <label className={cn(authLabelClass, "!mb-1 text-[11px]")}>
                    OTP code
                  </label>
                  <input
                    className={cn(authFieldClass, "h-9 text-[12px]")}
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder={CUSTOMER_PHONE_OTP}
                    inputMode="numeric"
                    maxLength={6}
                  />
                </div>
                <button
                  type="button"
                  disabled={otpBusy || otp.length < 4}
                  onClick={() => void confirmPhone()}
                  className={cn(
                    authPrimaryBtnClass,
                    "!h-10 text-[13px] disabled:opacity-50"
                  )}
                  style={authPrimaryBtnStyle}
                >
                  {otpBusy ? "Checking…" : "Verify phone"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* Tier 2 — Country ID */}
        <section className={cn("rounded-xl px-3 py-3", card)}>
          <p className={cn("flex items-center gap-1.5 text-[12px] font-bold", ink)}>
            <Upload className="h-3.5 w-3.5 text-[#FF6B35]" />
            Tier 2 · Government ID
          </p>
          <p className={cn("mt-1 text-[11px] leading-snug", muted)}>
            {submitted
              ? "Submitted — waiting for admin / customer care approval. Full access needs both: ID submitted and admin-approved."
              : "ID types for Nigeria. After your 30-day free period you need ID submitted and admin-approved to keep booking."}
          </p>

          {submitted ? (
            <p className="mt-2 text-[11px] font-semibold leading-snug text-amber-600">
              Under review · full booking unlocks when admin / customer care
              approves your ID
              {trialNote(userProfile)}
            </p>
          ) : (
            <div className="mt-2.5 flex flex-col gap-2.5">
              <div>
                <label className={cn(authLabelClass, "!mb-1 text-[11px]")}>
                  ID type
                </label>
                <select
                  className={cn(authFieldClass, "h-9 text-[12px]")}
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
              </div>

              <div>
                <label className={cn(authLabelClass, "!mb-1 text-[11px]")}>
                  {selectedDoc?.label || "ID"} number
                </label>
                <input
                  className={cn(authFieldClass, "h-9 text-[12px]")}
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
                  <p className={cn("mt-0.5 text-[10px] leading-snug", muted)}>
                    {selectedDoc.hint}
                  </p>
                ) : null}
              </div>

              {/* gap: om-cta-dark-gray forces margin:0 */}
              <div className="flex flex-col gap-2">
                <label
                  className={cn(
                    "flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 text-[12px] font-bold",
                    isLight
                      ? "bg-black/10 text-slate-800"
                      : "bg-[#2c2c2e] text-white",
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
                  className={cn(
                    authPrimaryBtnClass,
                    "!h-10 text-[13px] disabled:opacity-50"
                  )}
                  style={authPrimaryBtnStyle}
                >
                  {busy ? "Submitting…" : "Submit ID for review"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function trialNote(
  profile: {
    firstServiceAt?: string;
    serviceActionCount?: number;
  } | null | undefined
): string {
  if (!profile?.firstServiceAt) return ".";
  const days = remainingFreeActions(profile as never);
  if (!Number.isFinite(days) || days <= 0) return ".";
  return ` · ${days} free day${days === 1 ? "" : "s"} left.`;
}
