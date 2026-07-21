"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ShieldCheck, Upload } from "lucide-react";
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
import { verifyBvnApi, verifyNinApi } from "@/lib/ng-id-verify-client";
import { defaultBackHref, navigateBack } from "@/lib/navigation";
import { splitStoredPhone } from "@/lib/phone-codes";
import { useApp } from "@/lib/store";
import {
  isIdentityVerified,
  VERIFY_BLOCK_AT,
  VERIFY_WARN_FROM,
} from "@/lib/verification-gate";
import { cn } from "@/lib/utils";

/**
 * Motorist identity verification — documents match phone country only.
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
  const required = useMemo(
    () => pack.docs.filter((d) => d.requiredForVerify),
    [pack]
  );
  const optional = useMemo(
    () => pack.docs.filter((d) => !d.requiredForVerify),
    [pack]
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [front, setFront] = useState<Record<string, string>>({});
  const [back, setBack] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(isIdentityVerified(userProfile));

  // Motorist only
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (accountType === "professional") {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, accountType, router]);

  // Prefill + reset when country changes
  useEffect(() => {
    setDone(isIdentityVerified(userProfile));
    const next: Record<string, string> = {};
    for (const d of pack.docs) {
      if (d.kind === "national_id" || d.api === "nin") {
        next[d.kind] = userProfile?.idNumber || "";
      } else if (d.kind === "bank_id" || d.api === "bvn") {
        next[d.kind] = userProfile?.bvn || "";
      } else if (d.kind === userProfile?.govIdKind) {
        next[d.kind] = userProfile?.idNumber || "";
      } else {
        next[d.kind] = "";
      }
    }
    // If profile country doesn't match phone country, clear (force re-verify)
    if (
      userProfile?.identityCountryIso &&
      userProfile.identityCountryIso.toUpperCase() !== countryIso
    ) {
      for (const k of Object.keys(next)) next[k] = "";
      setVerified({});
      setFront({});
      setBack({});
      setDone(false);
    } else {
      setVerified({
        national_id: Boolean(userProfile?.ninVerified || userProfile?.govIdVerified),
        bank_id: Boolean(userProfile?.bvnVerified),
      });
      if (userProfile?.govIdFrontUrl) {
        setFront({ [userProfile.govIdKind || "national_id"]: userProfile.govIdFrontUrl });
      }
      if (userProfile?.govIdBackUrl) {
        setBack({ [userProfile.govIdKind || "national_id"]: userProfile.govIdBackUrl });
      }
    }
    setValues(next);
    setError("");
  }, [countryIso, pack, userProfile]);

  const setVal = (doc: CountryIdDoc, raw: string) => {
    setValues((prev) => ({
      ...prev,
      [doc.kind]: filterIdInput(raw, doc),
    }));
    setVerified((prev) => ({ ...prev, [doc.kind]: false }));
    setError("");
  };

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("read_failed"));
      r.readAsDataURL(file);
    });

  const checkOne = async (doc: CountryIdDoc): Promise<boolean> => {
    const val = (values[doc.kind] || "").trim();
    const fmt = validateIdFormat(val, doc);
    if (!fmt.ok) {
      setError(fmt.message);
      return false;
    }
    if (doc.needsFront && !front[doc.kind]) {
      setError(`Add a clear photo of the front of your ${doc.label}.`);
      return false;
    }
    if (doc.needsBack && !back[doc.kind]) {
      setError(`Add a clear photo of the back of your ${doc.label}.`);
      return false;
    }
    if (doc.api === "nin") {
      const res = await verifyNinApi(val);
      if (!res.ok) {
        setError(res.message || "We could not confirm this NIN. Check the number.");
        setVerified((p) => ({ ...p, [doc.kind]: false }));
        return false;
      }
    } else if (doc.api === "bvn") {
      const res = await verifyBvnApi(val);
      if (!res.ok) {
        setError(res.message || "We could not confirm this BVN. Check the number.");
        setVerified((p) => ({ ...p, [doc.kind]: false }));
        return false;
      }
    }
    setVerified((p) => ({ ...p, [doc.kind]: true }));
    return true;
  };

  const submit = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      // Primary path: all required docs must pass
      for (const doc of required) {
        const ok = await checkOne(doc);
        if (!ok) return;
      }

      // If no required docs (edge), require first doc in pack that has a value
      if (required.length === 0) {
        const first = pack.docs[0];
        if (!first || !(await checkOne(first))) return;
      }

      const primaryDoc =
        required.find((d) => d.kind === "national_id") ||
        required.find((d) => d.kind === "drivers_licence") ||
        required[0] ||
        pack.docs[0];
      const bankDoc = required.find((d) => d.kind === "bank_id");

      const primaryId = primaryDoc
        ? values[primaryDoc.kind] || ""
        : values.national_id || values.drivers_licence || "";
      const bankId = bankDoc ? values[bankDoc.kind] || "" : values.bank_id || "";

      const err = await completeIdentityVerification({
        primaryId,
        bankId: bankId || undefined,
        nin: primaryDoc?.api === "nin" ? primaryId : undefined,
        bvn: bankDoc?.api === "bvn" ? bankId : undefined,
        countryIso,
        govIdKind: primaryDoc?.kind,
        govIdFrontUrl: primaryDoc
          ? front[primaryDoc.kind]
          : undefined,
        govIdBackUrl: primaryDoc ? back[primaryDoc.kind] : undefined,
        govIdVerified: true,
        bankIdVerified: bankDoc ? true : true,
      });
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
          You can book help without limits.
        </p>
        <button
          type="button"
          className={cn(authPrimaryBtnClass, "mt-5 h-10 max-w-[260px]")}
          style={authPrimaryBtnStyle}
          onClick={() => router.push("/")}
        >
          Continue
        </button>
      </div>
    );
  }

  const canSubmit = required.every((d) => {
    const v = (values[d.kind] || "").trim();
    if (v.length < d.minLen) return false;
    if (d.needsFront && !front[d.kind]) return false;
    if (d.needsBack && !back[d.kind]) return false;
    return true;
  });

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
            navigateBack(router, defaultBackHref(accountType), accountType)
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

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 scrollbar-hide">
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
          Free try until job {VERIFY_WARN_FROM}. Finish this before job{" "}
          {VERIFY_BLOCK_AT} so you can keep booking.
        </p>

        <div
          className={cn(
            "mt-3 rounded-xl px-3 py-2.5 text-[11px] font-medium leading-snug",
            isLight ? "bg-[#fff7ed] text-[#9a3412]" : "bg-[#3a2010] text-[#fdba74]"
          )}
        >
          <p className="font-bold">How verification works</p>
          <p className="mt-1 text-[10px] font-semibold opacity-90">
            Country: {pack.countryName} (from your phone number)
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            {pack.howItWorks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>

        <div
          className={cn(
            "mt-3 flex flex-col gap-3 rounded-xl p-3",
            isLight ? "bg-slate-50" : "bg-white/5"
          )}
        >
          <p
            className={cn(
              "text-[12px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Required for {pack.countryName}
          </p>
          {required.map((doc) => (
            <DocBlock
              key={doc.kind}
              doc={doc}
              value={values[doc.kind] || ""}
              front={front[doc.kind]}
              back={back[doc.kind]}
              ok={Boolean(verified[doc.kind])}
              isLight={isLight}
              onChange={(v) => setVal(doc, v)}
              onFront={async (f) => {
                if (!f) return;
                const url = await readFile(f);
                setFront((p) => ({ ...p, [doc.kind]: url }));
                setVerified((p) => ({ ...p, [doc.kind]: false }));
              }}
              onBack={async (f) => {
                if (!f) return;
                const url = await readFile(f);
                setBack((p) => ({ ...p, [doc.kind]: url }));
                setVerified((p) => ({ ...p, [doc.kind]: false }));
              }}
            />
          ))}

          {optional.length > 0 ? (
            <>
              <p
                className={cn(
                  "mt-1 text-[12px] font-bold",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                Optional
              </p>
              {optional.map((doc) => (
                <DocBlock
                  key={doc.kind}
                  doc={doc}
                  value={values[doc.kind] || ""}
                  front={front[doc.kind]}
                  back={back[doc.kind]}
                  ok={Boolean(verified[doc.kind])}
                  isLight={isLight}
                  onChange={(v) => setVal(doc, v)}
                  onFront={async (f) => {
                    if (!f) return;
                    const url = await readFile(f);
                    setFront((p) => ({ ...p, [doc.kind]: url }));
                  }}
                  onBack={async (f) => {
                    if (!f) return;
                    const url = await readFile(f);
                    setBack((p) => ({ ...p, [doc.kind]: url }));
                  }}
                />
              ))}
            </>
          ) : null}

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
            disabled={busy || !canSubmit}
            className={cn(authPrimaryBtnClass, "mt-1 h-10 shrink-0")}
            style={authPrimaryBtnStyle}
            onClick={() => void submit()}
          >
            {busy ? "Checking…" : "Finish verification"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocBlock({
  doc,
  value,
  front,
  back,
  ok,
  isLight,
  onChange,
  onFront,
  onBack,
}: {
  doc: CountryIdDoc;
  value: string;
  front?: string;
  back?: string;
  ok: boolean;
  isLight: boolean;
  onChange: (v: string) => void;
  onFront: (f: File | null) => void | Promise<void>;
  onBack: (f: File | null) => void | Promise<void>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block">
        <span
          className={cn(
            authLabelClass,
            "mb-1 flex items-center justify-between"
          )}
        >
          {doc.label}
          {doc.requiredForVerify ? (
            <span className="text-[10px] font-bold text-red-600">Required</span>
          ) : null}
          {ok ? (
            <span className="text-[10px] font-bold text-emerald-600">
              Checked
            </span>
          ) : null}
        </span>
        <input
          className={authFieldClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={doc.charset === "digits" ? "numeric" : "text"}
          maxLength={doc.maxLen}
          placeholder={doc.placeholder}
        />
        <p className="mt-0.5 text-[10px] font-medium text-muted">{doc.hint}</p>
      </label>
      {(doc.needsFront || doc.needsBack) && (
        <div className="flex gap-2">
          {doc.needsFront ? (
            <PhotoSlot
              label={front ? "Front ✓" : "Front photo"}
              filled={Boolean(front)}
              isLight={isLight}
              onFile={onFront}
            />
          ) : null}
          {doc.needsBack ? (
            <PhotoSlot
              label={back ? "Back ✓" : "Back photo"}
              filled={Boolean(back)}
              isLight={isLight}
              onFile={onBack}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function PhotoSlot({
  label,
  filled,
  isLight,
  onFile,
}: {
  label: string;
  filled: boolean;
  isLight: boolean;
  onFile: (f: File | null) => void | Promise<void>;
}) {
  return (
    <label
      className={cn(
        "flex h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-[11px] font-bold",
        filled
          ? isLight
            ? "bg-emerald-100 text-emerald-800"
            : "bg-emerald-900/40 text-emerald-300"
          : isLight
            ? "bg-[#E2E3E7] text-slate-700"
            : "bg-[#2c2c2e] text-white"
      )}
    >
      <Upload className="h-3.5 w-3.5" />
      {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0] || null)}
      />
    </label>
  );
}
