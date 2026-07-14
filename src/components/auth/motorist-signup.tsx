"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Mail,
  User,
} from "lucide-react";
import {
  AuthPlate,
  authFieldClass as fieldClass,
  authFieldIconClass as fieldIconClass,
  authSecondaryBtnClass,
  authSelectClass as selectClass,
} from "@/components/auth/auth-plate";
import { RegistrationComplete } from "@/components/auth/registration-complete";
import {
  LocationPickerMap,
  type PickedLocation,
} from "@/components/map/location-picker-map";
import {
  checkIdentityAvailable,
  IDENTITY_RULE_COPY,
} from "@/lib/account-registry";
import {
  DEFAULT_PHONE_DIAL,
  DEFAULT_PHONE_ISO,
  formatInternationalPhone,
  getPhoneCodeOptions,
  splitStoredPhone,
} from "@/lib/phone-codes";
import { getVaultProfile } from "@/lib/profiles-vault";
import { verifySignupIds } from "@/lib/ng-id-verify-client";
import {
  bvnError,
  emailError,
  fullNameError,
  isValidEmail,
  isValidFullName,
  isValidPassword,
  ninError,
  confirmPasswordError,
  passwordError,
  passwordRules,
  phoneNationalError,
} from "@/lib/signup-validation";
import { useApp } from "@/lib/store";
import type { UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;
/**
 * Full Motorist signup — polished account step + reduced corner radius.
 */
export function MotoristSignup() {
  const router = useRouter();
  const { completeSignup, setManualLocation } = useApp();
  const phoneCodes = useMemo(() => getPhoneCodeOptions(), []);
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  /** Per-field errors shown on blur when leaving a field */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState("");
  const [phoneIso, setPhoneIso] = useState(DEFAULT_PHONE_ISO);
  const [phoneDial, setPhoneDial] = useState(DEFAULT_PHONE_DIAL);
  const [phoneNational, setPhoneNational] = useState("");
  const [email, setEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bvn, setBvn] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [city, setCity] = useState("Lagos");
  const [area, setArea] = useState("");
  const [pickedLoc, setPickedLoc] = useState<PickedLocation | null>(null);
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  /** Identity locked from existing Repair Pro account on this device */
  const [identityLocked, setIdentityLocked] = useState(false);

  const fullPhone = formatInternationalPhone(phoneDial, phoneNational);

  useEffect(() => {
    const pro = getVaultProfile("professional");
    if (!pro) return;
    setIdentityLocked(true);
    setFullName(pro.fullName || "");
    setEmail(pro.email || "");
    setIdNumber(pro.idNumber || "");
    setBvn(pro.bvn || "");
    setPassword(pro.password || "");
    setConfirmPassword(pro.password || "");
    const split = splitStoredPhone(pro.phone || "");
    setPhoneIso(split.iso);
    setPhoneDial(split.dial);
    setPhoneNational(split.national);
  }, []);

  const onLocationPicked = (loc: PickedLocation) => {
    setPickedLoc(loc);
    setCity(loc.city || loc.label);
    setArea(loc.area || loc.label);
  };

  const setFieldError = (key: string, msg: string | null) => {
    setFieldErrors((prev) => {
      if (!msg) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: msg };
    });
  };

  const step1Ok = identityLocked
    ? isValidFullName(fullName) &&
      !phoneNationalError(phoneNational) &&
      isValidEmail(email) &&
      password.length > 0 &&
      !ninError(idNumber) &&
      !bvnError(bvn)
    : isValidFullName(fullName) &&
      !phoneNationalError(phoneNational) &&
      isValidEmail(email) &&
      isValidPassword(password) &&
      confirmPassword === password &&
      confirmPassword.length > 0 &&
      !ninError(idNumber) &&
      !bvnError(bvn);
  const step2Ok = city.trim().length >= 2 && area.trim().length >= 2;

  const validateStep1 = (): string | null => {
    if (identityLocked) {
      return (
        fullNameError(fullName) ||
        phoneNationalError(phoneNational) ||
        emailError(email) ||
        ninError(idNumber) ||
        bvnError(bvn)
      );
    }
    return (
      fullNameError(fullName) ||
      phoneNationalError(phoneNational) ||
      emailError(email) ||
      ninError(idNumber) ||
      bvnError(bvn) ||
      passwordError(password) ||
      confirmPasswordError(password, confirmPassword)
    );
  };

  const guardIdentity = (): string | null => {
    const check = checkIdentityAvailable({
      phone: fullPhone,
      email: email.trim(),
      nin: idNumber.trim() || undefined,
      bvn: bvn.trim() || undefined,
      accountType: "motorist",
    });
    return check.ok ? null : check.message;
  };

  const finish = async () => {
    if (busy) return;
    const v = validateStep1();
    if (v) {
      setFormError(v);
      setStep(1);
      return;
    }
    setBusy(true);
    setFormError("");

    const identityErr = guardIdentity();
    if (identityErr) {
      setFormError(identityErr);
      setBusy(false);
      setStep(1);
      return;
    }

    const verified = await verifySignupIds({
      nin: idNumber.trim() || undefined,
      bvn: bvn.trim() || undefined,
      requireBoth: false,
    });
    if (!verified.ok) {
      setFormError(verified.message);
      setBusy(false);
      setStep(1);
      return;
    }

    const profile: UserProfile = {
      accountType: "motorist",
      fullName: fullName.trim(),
      phone: fullPhone,
      email: email.trim(),
      password,
      city: city.trim(),
      area: area.trim(),
      idNumber: idNumber.trim() || undefined,
      bvn: bvn.trim() || undefined,
      vehicleMake: vehicleMake.trim() || undefined,
      vehicleModel: vehicleModel.trim() || undefined,
      vehicleYear: vehicleYear.trim() || undefined,
      registeredAt: new Date().toISOString(),
    };

    // Apply live map pin (GPS / Places) to the home map session
    if (pickedLoc) {
      setManualLocation(pickedLoc.label || `${pickedLoc.area}, ${pickedLoc.city}`, {
        lat: pickedLoc.lat,
        lng: pickedLoc.lng,
      });
    }
    const err = completeSignup(profile);
    if (err) {
      setFormError(err);
      setBusy(false);
      setStep(1);
      return;
    }
    setDone(true);
    setBusy(false);
  };

  const titles: Record<Step, string> = {
    1: "Your account",
    2: "Where are you?",
    3: "Your vehicle",
  };
  const subtitles: Record<Step, string> = {
    1: "Create your car owner profile so you can ask for help nearby",
    2: "We use this to find repair people close to you",
    3: "Not required. It helps the repair person prepare for your car",
  };

  return (
    <AuthPlate>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top bar — full width for chrome */}
        <div className="mx-auto flex w-[80%] shrink-0 items-center pb-0.5 pt-2.5">
          <button
            type="button"
            onClick={() =>
              step === 1
                ? router.push("/login/role")
                : setStep((s) => (s - 1) as Step)
            }
            className="inline-flex h-8 items-center gap-0.5 rounded-md border-0 bg-transparent px-0 text-[12px] font-semibold text-[#1e293b] transition-opacity active:opacity-70"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            Back
          </button>
        </div>

        {/* Header */}
        <div className="mx-auto w-[80%] shrink-0 pt-1 text-center">
          <h1 className="text-[18px] font-bold leading-tight tracking-tight text-[#0f172a]">
            {titles[step]}
          </h1>
          <p className="mx-auto mt-0.5 text-[11px] leading-snug text-[#475569]">
            {subtitles[step]}
          </p>
        </div>

        {/* Progress bar only (no page numbers) */}
        <div className="mx-auto mt-2 flex w-[80%] shrink-0 gap-1">
          {([1, 2, 3] as Step[]).map((n) => (
            <span
              key={n}
              className={cn(
                "h-0.5 flex-1 rounded-sm transition-colors",
                n <= step ? "bg-[#e85a12]" : "bg-black/10"
              )}
            />
          ))}
        </div>

        {/* Body — 80% width, stacked fields */}
        <div
          className={cn(
            "mx-auto mt-2 flex min-h-0 w-[80%] flex-1 flex-col pb-1",
            step === 1 ? "overflow-hidden" : "overflow-y-auto scrollbar-hide"
          )}
        >
          {step === 1 && (
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1">
              <div className="flex flex-col gap-1.5 overflow-y-auto scrollbar-hide">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                  Your details
                </p>

                {identityLocked && (
                  <p className="rounded-md bg-[#e8e9ed] px-2.5 py-2 text-[11px] leading-snug text-[#334155]">
                    We filled your name, phone, email, NIN and BVN from your
                    Repair Pro account. Those cannot be changed here. No new
                    password needed.
                  </p>
                )}

                <Field label="Full name" required>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                    <input
                      className={fieldIconClass}
                      value={fullName}
                      readOnly={identityLocked}
                      onChange={(e) => {
                        if (identityLocked) return;
                        setFullName(e.target.value);
                        setFieldError("fullName", null);
                      }}
                      onBlur={() =>
                        setFieldError("fullName", fullNameError(fullName))
                      }
                      placeholder="e.g. Ada Okafor"
                      autoComplete="name"
                    />
                  </div>
                  <FieldHint message={fieldErrors.fullName} />
                </Field>

                <Field label="Phone" required>
                  <div className="flex gap-1.5">
                    <select
                      className={cn(selectClass, "max-w-[42%]")}
                      value={phoneIso}
                      aria-label="Country code"
                      disabled={identityLocked}
                      onChange={(e) => {
                        if (identityLocked) return;
                        const iso = e.target.value;
                        setPhoneIso(iso);
                        const opt = phoneCodes.find((c) => c.iso === iso);
                        if (opt) setPhoneDial(opt.dial);
                      }}
                    >
                      {phoneCodes.map((c) => (
                        <option key={`${c.iso}-${c.dial}`} value={c.iso}>
                          {c.label} {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className={cn(fieldClass, "min-w-0 flex-1")}
                      value={phoneNational}
                      readOnly={identityLocked}
                      onChange={(e) => {
                        if (identityLocked) return;
                        setPhoneNational(
                          e.target.value.replace(/\D/g, "").slice(0, 15)
                        );
                        setFieldError("phone", null);
                      }}
                      onBlur={() =>
                        setFieldError(
                          "phone",
                          phoneNationalError(phoneNational)
                        )
                      }
                      placeholder="8012345678"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                    />
                  </div>
                  <FieldHint message={fieldErrors.phone} />
                </Field>

                <Field label="Email" required>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                    <input
                      className={fieldIconClass}
                      value={email}
                      readOnly={identityLocked}
                      onChange={(e) => {
                        if (identityLocked) return;
                        setEmail(e.target.value);
                        setFieldError("email", null);
                      }}
                      onBlur={() => setFieldError("email", emailError(email))}
                      placeholder="you@email.com"
                      type="email"
                      autoComplete="email"
                    />
                  </div>
                  <FieldHint message={fieldErrors.email} />
                </Field>

                <Field label="NIN (11 numbers)">
                  <input
                    className={fieldClass}
                    value={idNumber}
                    readOnly={identityLocked}
                    onChange={(e) => {
                      if (identityLocked) return;
                      setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11));
                      setFieldError("nin", null);
                    }}
                    onBlur={() => setFieldError("nin", ninError(idNumber))}
                    placeholder="11 numbers only"
                    inputMode="numeric"
                    maxLength={11}
                  />
                  <FieldHint message={fieldErrors.nin} />
                </Field>

                <Field label="BVN (11 numbers)">
                  <input
                    className={fieldClass}
                    value={bvn}
                    readOnly={identityLocked}
                    onChange={(e) => {
                      if (identityLocked) return;
                      setBvn(e.target.value.replace(/\D/g, "").slice(0, 11));
                      setFieldError("bvn", null);
                    }}
                    onBlur={() => setFieldError("bvn", bvnError(bvn))}
                    placeholder="11 numbers only"
                    inputMode="numeric"
                    maxLength={11}
                  />
                  <FieldHint message={fieldErrors.bvn} />
                </Field>

                {!identityLocked && (
                  <>
                    <Field label="Password" required>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                        <input
                          className={fieldIconClass}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setFieldError("password", null);
                            if (confirmPassword) {
                              setFieldError(
                                "confirm",
                                confirmPasswordError(
                                  e.target.value,
                                  confirmPassword
                                )
                              );
                            }
                          }}
                          onBlur={() =>
                            setFieldError("password", passwordError(password))
                          }
                          placeholder="At least 8 characters"
                          type="password"
                          autoComplete="new-password"
                        />
                      </div>
                      <PasswordRules password={password} />
                      <FieldHint message={fieldErrors.password} />
                    </Field>

                    <Field label="Confirm password" required>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                        <input
                          className={fieldIconClass}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setFieldError(
                              "confirm",
                              e.target.value
                                ? confirmPasswordError(password, e.target.value)
                                : null
                            );
                          }}
                          onBlur={() =>
                            setFieldError(
                              "confirm",
                              confirmPasswordError(password, confirmPassword)
                            )
                          }
                          placeholder="Re-enter password"
                          type="password"
                          autoComplete="new-password"
                        />
                      </div>
                      <FieldHint message={fieldErrors.confirm} />
                    </Field>
                  </>
                )}

                {formError && (
                  <p
                    className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-medium leading-snug text-red-700"
                    role="alert"
                  >
                    {formError}
                  </p>
                )}
              </div>

              <p className="shrink-0 text-center text-[10px] leading-snug text-[#64748b]">
                {identityLocked
                  ? "Your shared details stay the same as your Repair Pro account."
                  : IDENTITY_RULE_COPY}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                Your location on the map
              </p>
              <p className="text-[11px] leading-snug text-[#475569]">
                Use live location or search. You can also tap the map or drag
                the pin to fix the place.
              </p>
              <LocationPickerMap
                value={pickedLoc}
                onChange={onLocationPicked}
              />
              {(city || area) && (
                <div className="rounded-md border border-[#9A9EA6]/70 bg-white/50 px-2.5 py-2 text-[11px] leading-snug text-[#334155]">
                  <span className="font-semibold text-[#0f172a]">Selected: </span>
                  {[area, city].filter(Boolean).join(", ") || pickedLoc?.label}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                Vehicle (optional)
              </p>
              <Field label="Make">
                <input
                  className={fieldClass}
                  value={vehicleMake}
                  onChange={(e) => setVehicleMake(e.target.value)}
                  placeholder="Toyota"
                />
              </Field>
              <Field label="Model">
                <input
                  className={fieldClass}
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="Corolla"
                />
              </Field>
              <Field label="Year">
                <input
                  className={fieldClass}
                  value={vehicleYear}
                  onChange={(e) => setVehicleYear(e.target.value)}
                  placeholder="2018"
                  inputMode="numeric"
                />
              </Field>
            </div>
          )}
        </div>

        {/* Footer — dark gray #323231 matching "Continue to sign up" */}
        <div className="mx-auto flex w-[80%] shrink-0 flex-col gap-2 pb-4 pt-2">
          {step < 3 ? (
            <button
              type="button"
              className="om-cta-dark-gray"
              /* Full inline lock — same dark gray as previous page Continue CTA */
              style={{
                WebkitAppearance: "none",
                appearance: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                height: 44,
                margin: 0,
                padding: "0 16px",
                border: "none",
                borderRadius: 6,
                background: "#323231",
                backgroundColor: "#323231",
                backgroundImage: "none",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1,
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                cursor:
                  (step === 1 ? step1Ok : step2Ok) ? "pointer" : "not-allowed",
                opacity: 1,
                filter: "none",
              }}
              data-cta="next"
              onClick={() => {
                if (step === 1) {
                  const err = validateStep1();
                  if (err) {
                    setFormError(err);
                    return;
                  }
                  const identityErr = guardIdentity();
                  if (identityErr) {
                    setFormError(identityErr);
                    return;
                  }
                } else if (!step2Ok) {
                  return;
                }
                setFormError("");
                setStep((s) => (s + 1) as Step);
              }}
            >
              Next
              <ChevronRight
                className="h-4 w-4 shrink-0"
                color="#ffffff"
                strokeWidth={2.4}
              />
            </button>
          ) : (
            <button
              type="button"
              className="om-cta-dark-gray"
              style={{
                WebkitAppearance: "none",
                appearance: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: 44,
                margin: 0,
                border: "none",
                borderRadius: 6,
                background: "#323231",
                backgroundColor: "#323231",
                backgroundImage: "none",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                cursor: busy ? "wait" : "pointer",
                opacity: 1,
              }}
              onClick={finish}
            >
              {busy ? "Please wait…" : "Create my account"}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className={authSecondaryBtnClass}
              onClick={finish}
              disabled={busy || !step1Ok || !step2Ok}
            >
              Skip vehicle. Finish
            </button>
          )}
        </div>
      </div>

      <RegistrationComplete
        open={done}
        accountLabel="Motorist"
        onContinue={() => router.replace("/")}
      />
    </AuthPlate>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-semibold text-[#475569]">
        {label}
        {required && (
          <span className="ml-0.5 font-bold text-red-600" aria-label="required">
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function FieldHint({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-0.5 text-[10px] font-medium leading-snug text-red-600" role="alert">
      {message}
    </p>
  );
}

function PasswordRules({ password }: { password: string }) {
  const r = passwordRules(password);
  const rows: { ok: boolean; text: string }[] = [
    { ok: r.length, text: "At least 8 characters" },
    { ok: r.upper, text: "At least 1 capital letter" },
    { ok: r.digit, text: "At least 1 number" },
    { ok: true, text: "You can add symbols if you want" },
  ];
  return (
    <ul className="mt-1 space-y-0.5">
      {rows.map((row) => (
        <li
          key={row.text}
          className={cn(
            "text-[9px] font-medium",
            password.length === 0
              ? "text-[#64748b]"
              : row.ok
                ? "text-emerald-600"
                : "text-red-600"
          )}
        >
          {row.ok && password.length > 0 ? "✓ " : "· "}
          {row.text}
        </li>
      ))}
    </ul>
  );
}
