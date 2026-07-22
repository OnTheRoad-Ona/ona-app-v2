"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
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
  authLockedFieldClass,
  authLockedFieldStyle,
  authSecondaryBtnClass,
  authSelectClass as selectClass,
} from "@/components/auth/auth-plate";
import { useAuthNavigate } from "@/components/auth/auth-transition";
import { PasswordField } from "@/components/auth/password-field";
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
import {
  filterIdInput,
  getCountryIdPack,
  validateIdFormat,
} from "@/lib/country-id-rules";
import { getVaultProfile } from "@/lib/profiles-vault";
import { verifySignupIds } from "@/lib/ng-id-verify-client";
import {
  emailError,
  fullNameError,
  isValidEmail,
  isValidFullName,
  isValidPassword,
  confirmPasswordError,
  passwordError,
  passwordRules,
  phoneNationalError,
  genderError,
  dobError,
  dobInputMax,
  dobInputMin,
  normalizeDobIso,
  SIGNUP_GENDER_OPTIONS,
  type SignupGender,
} from "@/lib/signup-validation";
import {
  filterOptions,
  getAllMakes,
  getModelsForMake,
  getYearsForMakeModel,
} from "@/lib/vehicle-catalog";
import { VEHICLE_TYPES } from "@/lib/vehicle-focus";
import { useApp } from "@/lib/store";
import type { MotoristVehicle, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

type VehiclePickerKey = "vehicleType" | "make" | "model" | "year";

type Step = 1 | 2 | 3;
/**
 * Full Customer signup — polished account step + reduced corner radius.
 * Menu dual-signup: locks identity from Repair Pro, lands on Motorist home.
 */
export function MotoristSignup() {
  const router = useRouter();
  const { exiting, go } = useAuthNavigate();
  const searchParams = useSearchParams();
  const { completeSignup, setManualLocation, userProfile, isAuthenticated } =
    useApp();
  const phoneCodes = useMemo(() => getPhoneCodeOptions(), []);
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  /** Per-field errors shown on blur when leaving a field */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<SignupGender | "">("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phoneIso, setPhoneIso] = useState(DEFAULT_PHONE_ISO);
  const idPack = useMemo(() => getCountryIdPack(phoneIso), [phoneIso]);
  const primaryDoc = useMemo(
    () =>
      idPack.docs.find((d) => d.kind === "national_id" && d.requiredForVerify) ||
      idPack.docs.find((d) => d.requiredForVerify) ||
      idPack.docs[0],
    [idPack]
  );
  const bankDoc = useMemo(
    () => idPack.docs.find((d) => d.kind === "bank_id"),
    [idPack]
  );
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
  /** Optional vehicles — customer can skip (other services need no car) */
  const [vehicles, setVehicles] = useState<MotoristVehicle[]>([]);
  const [draftVehicleType, setDraftVehicleType] = useState("Any");
  const [draftMake, setDraftMake] = useState("Any");
  const [draftModel, setDraftModel] = useState("Any");
  const [draftYear, setDraftYear] = useState("Any");
  const [vehiclePicker, setVehiclePicker] = useState<VehiclePickerKey | null>(
    null
  );
  const [pickerQuery, setPickerQuery] = useState("");
  /**
   * Dual-role signup: prefill from Repair Pro, but only dim/lock fields
   * that already have values. Empty NIN/BVN stay fully editable (not dimmed).
   */
  const [dualSignup, setDualSignup] = useState(false);
  const [nameLocked, setNameLocked] = useState(false);
  const [genderLocked, setGenderLocked] = useState(false);
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [emailLocked, setEmailLocked] = useState(false);
  const [ninLocked, setNinLocked] = useState(false);
  const [bvnLocked, setBvnLocked] = useState(false);

  const fromMenu = searchParams.get("from") === "menu";
  const nextPath =
    searchParams.get("next")?.startsWith("/")
      ? searchParams.get("next")!
      : "/";

  const fullPhone = formatInternationalPhone(phoneDial, phoneNational);

  // Prefill from existing Repair Pro — lock only fields that already have values
  useEffect(() => {
    const vaultPro = getVaultProfile("professional");
    const livePro =
      userProfile?.accountType === "professional" ? userProfile : null;
    // Dual signup from menu: any authenticated non-customer session is the source
    const sessionSource =
      isAuthenticated && userProfile && userProfile.accountType !== "motorist"
        ? userProfile
        : null;
    const pro = vaultPro || livePro || sessionSource;
    if (!pro) {
      setDualSignup(false);
      setNameLocked(false);
      setGenderLocked(false);
      setDateOfBirth("");
      setPhoneLocked(false);
      setEmailLocked(false);
      setNinLocked(false);
      setBvnLocked(false);
      return;
    }

    setDualSignup(true);

    const name = (pro.fullName || vaultPro?.fullName || "").trim();
    const em = (pro.email || vaultPro?.email || "").trim();
    const nin = (pro.idNumber || vaultPro?.idNumber || "").trim();
    const bankId = (pro.bvn || vaultPro?.bvn || "").trim();
    const phoneRaw = (pro.phone || vaultPro?.phone || "").trim();
    const g = (pro.gender || vaultPro?.gender || "") as SignupGender | "";

    if (name) {
      setFullName(name);
      setNameLocked(true);
    } else {
      setNameLocked(false);
    }
    if (g === "male" || g === "female" || g === "prefer_not_to_say") {
      setGender(g);
      setGenderLocked(true);
    } else {
      setGenderLocked(false);
    }
    // Customer DOB: never pre-fill (user must pick the date themselves)
    setDateOfBirth("");
    setFieldError("dob", null);
    if (em) {
      setEmail(em);
      setEmailLocked(true);
    } else {
      setEmailLocked(false);
    }
    // NIN/BVN: only lock + dim when a full 11-digit value exists.
    // Empty / never-filled / last4-only → stay fully editable (not dimmed).
    const ninDigits = nin.replace(/\D/g, "");
    const bvnDigits = bankId.replace(/\D/g, "");
    if (ninDigits.length === 11) {
      setIdNumber(ninDigits);
      setNinLocked(true);
    } else {
      setIdNumber("");
      setNinLocked(false);
    }
    if (bvnDigits.length === 11) {
      setBvn(bvnDigits);
      setBvnLocked(true);
    } else {
      setBvn("");
      setBvnLocked(false);
    }

    setCity(pro.city || vaultPro?.city || "Lagos");
    setArea(pro.area || vaultPro?.area || "");
    // Prefill same password if we still have it locally (user can edit)
    const pwd = (vaultPro?.password || pro.password || "").trim();
    if (pwd) {
      setPassword(pwd);
      setConfirmPassword(pwd);
    }
    if (phoneRaw) {
      const split = splitStoredPhone(phoneRaw);
      setPhoneIso(split.iso);
      setPhoneDial(split.dial);
      setPhoneNational(split.national);
      setPhoneLocked(true);
    } else {
      setPhoneLocked(false);
    }
  }, [userProfile, isAuthenticated]);

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

  /** Dual signup: reuse existing password (min 6 for server), not a new-password checklist */
  const dualPasswordOk = password.trim().length >= 6;

  /** Optional at signup — if filled, must match this country’s rules */
  const optionalIdError = (): string | null => {
    if (idNumber.trim() && primaryDoc) {
      const r = validateIdFormat(idNumber.trim(), primaryDoc);
      if (!r.ok) return r.message;
    }
    if (bvn.trim() && bankDoc) {
      const r = validateIdFormat(bvn.trim(), bankDoc);
      if (!r.ok) return r.message;
    }
    return null;
  };

  const genderDobOk =
    !genderError(gender) && !dobError(dateOfBirth);

  const step1Ok = dualSignup
    ? isValidFullName(fullName) &&
      genderDobOk &&
      !phoneNationalError(phoneNational) &&
      isValidEmail(email) &&
      dualPasswordOk &&
      !optionalIdError()
    : isValidFullName(fullName) &&
      genderDobOk &&
      !phoneNationalError(phoneNational) &&
      isValidEmail(email) &&
      isValidPassword(password) &&
      confirmPassword === password &&
      confirmPassword.length > 0 &&
      !optionalIdError();
  const step2Ok = city.trim().length >= 2 && area.trim().length >= 2;

  const isAny = (v: string) => !v.trim() || v.trim().toLowerCase() === "any";

  /** Real vehicle only when make + model are chosen (not ANY) */
  const draftReady =
    !isAny(draftMake) && !isAny(draftModel);

  /** Vehicles optional — always can finish step 3 */
  const step3Ok = true;

  const resetDraft = () => {
    setDraftVehicleType("Any");
    setDraftMake("Any");
    setDraftModel("Any");
    setDraftYear("Any");
  };

  const addDraftVehicle = (): boolean => {
    if (!draftReady) return false;
    const v: MotoristVehicle = {
      id: `veh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      vehicleType: isAny(draftVehicleType) ? undefined : draftVehicleType.trim(),
      make: draftMake.trim(),
      model: draftModel.trim(),
      year: isAny(draftYear) ? undefined : draftYear.trim(),
    };
    setVehicles((prev) => [...prev, v]);
    resetDraft();
    return true;
  };

  const makeOptions = useMemo(() => {
    const makes = getAllMakes();
    return ["Any", ...makes];
  }, []);

  const modelOptions = useMemo(() => {
    if (isAny(draftMake)) return ["Any"];
    return ["Any", ...getModelsForMake(draftMake)];
  }, [draftMake]);

  const yearOptions = useMemo(() => {
    if (isAny(draftMake) || isAny(draftModel)) return ["Any"];
    const years = getYearsForMakeModel(draftMake, draftModel).map(String);
    return ["Any", ...years];
  }, [draftMake, draftModel]);

  const vehicleTypeOptions = useMemo(
    () =>
      VEHICLE_TYPES.includes("Any")
        ? [...VEHICLE_TYPES]
        : ["Any", ...VEHICLE_TYPES],
    []
  );

  const pickerOptions = useMemo(() => {
    if (!vehiclePicker) return [] as string[];
    if (vehiclePicker === "vehicleType") return vehicleTypeOptions;
    if (vehiclePicker === "make") return makeOptions;
    if (vehiclePicker === "model") return modelOptions;
    return yearOptions;
  }, [
    vehiclePicker,
    vehicleTypeOptions,
    makeOptions,
    modelOptions,
    yearOptions,
  ]);

  const filteredPickerOptions = useMemo(
    () => filterOptions(pickerOptions, pickerQuery, 120),
    [pickerOptions, pickerQuery]
  );

  const openVehiclePicker = (key: VehiclePickerKey) => {
    setPickerQuery("");
    setVehiclePicker(key);
  };

  const pickVehicleValue = (value: string) => {
    if (!vehiclePicker) return;
    if (vehiclePicker === "vehicleType") {
      setDraftVehicleType(value);
      // Keep make/model unless they clear to Any
    } else if (vehiclePicker === "make") {
      setDraftMake(value);
      setDraftModel("Any");
      setDraftYear("Any");
    } else if (vehiclePicker === "model") {
      setDraftModel(value);
      setDraftYear("Any");
    } else {
      setDraftYear(value);
    }
    setVehiclePicker(null);
    setPickerQuery("");
  };

  const displayVal = (v: string) =>
    isAny(v) ? "ANY" : v.toUpperCase();

  const validateStep1 = (): string | null => {
    if (dualSignup) {
      const base =
        fullNameError(fullName) ||
        genderError(gender) ||
        dobError(dateOfBirth) ||
        phoneNationalError(phoneNational) ||
        emailError(email) ||
        optionalIdError();
      if (base) return base;
      if (!dualPasswordOk) {
        return "Enter the same password you use for your Repair Pro account.";
      }
      return null;
    }
    return (
      fullNameError(fullName) ||
      genderError(gender) ||
      dobError(dateOfBirth) ||
      phoneNationalError(phoneNational) ||
      emailError(email) ||
      optionalIdError() ||
      passwordError(password) ||
      confirmPasswordError(password, confirmPassword)
    );
  };

  const goBack = () => {
    if (step === 1) {
      if (fromMenu) {
        router.replace("/dashboard");
        return;
      }
      go("/login/role");
      return;
    }
    setStep((s) => (s - 1) as Step);
  };

  const guardIdentity = (): string | null => {
    // Dual role (same person): Motorist + Repair Pro share one phone/email/NIN/BVN
    if (dualSignup) return null;
    const check = checkIdentityAvailable({
      phone: fullPhone,
      email: email.trim(),
      nin: idNumber.trim() || undefined,
      bvn: bvn.trim() || undefined,
      accountType: "motorist",
    });
    return check.ok ? null : check.message;
  };

  const finish = async (opts?: { skipVehicle?: boolean }) => {
    if (busy) return;
    const v = validateStep1();
    if (v) {
      setFormError(v);
      setStep(1);
      return;
    }
    if (!step2Ok) {
      setFormError("Please set your location.");
      setStep(2);
      return;
    }

    // Skip: register without vehicles. Create account: save draft if filled.
    let list = vehicles;
    if (!opts?.skipVehicle && draftReady) {
      const next: MotoristVehicle = {
        id: `veh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        vehicleType: isAny(draftVehicleType)
          ? undefined
          : draftVehicleType.trim(),
        make: draftMake.trim(),
        model: draftModel.trim(),
        year: isAny(draftYear) ? undefined : draftYear.trim(),
      };
      list = [...vehicles, next];
      setVehicles(list);
      resetDraft();
    }
    if (opts?.skipVehicle) {
      list = [];
      setVehicles([]);
      resetDraft();
    }
    // Vehicles optional — empty list is fine for non-car services

    setBusy(true);
    setFormError("");

    const identityErr = guardIdentity();
    if (identityErr) {
      setFormError(identityErr);
      setBusy(false);
      setStep(1);
      return;
    }

    // Live number checks only for countries that support them (e.g. NG NIN/BVN)
    if (
      (primaryDoc?.api === "nin" && idNumber.trim()) ||
      (bankDoc?.api === "bvn" && bvn.trim())
    ) {
      const verified = await verifySignupIds({
        nin:
          primaryDoc?.api === "nin" ? idNumber.trim() || undefined : undefined,
        bvn: bankDoc?.api === "bvn" ? bvn.trim() || undefined : undefined,
        requireBoth: false,
      });
      if (!verified.ok) {
        setFormError(verified.message);
        setBusy(false);
        setStep(1);
        return;
      }
    }

    const first = list[0];
    const profile: UserProfile = {
      accountType: "motorist",
      fullName: fullName.trim(),
      gender: gender as SignupGender,
      dateOfBirth: normalizeDobIso(dateOfBirth) || "",
      phone: fullPhone,
      email: email.trim(),
      password,
      city: city.trim(),
      area: area.trim(),
      idNumber: idNumber.trim() || undefined,
      bvn: bvn.trim() || undefined,
      identityCountryIso: phoneIso,
      govIdKind: primaryDoc?.kind,
      vehicles: list.length ? list : undefined,
      vehicleMake: first?.make,
      vehicleModel: first?.model,
      vehicleYear: first?.year,
      registeredAt: new Date().toISOString(),
    };

    // Apply live map pin (GPS / Places) to the home map session
    if (pickedLoc) {
      setManualLocation(pickedLoc.label || `${pickedLoc.area}, ${pickedLoc.city}`, {
        lat: pickedLoc.lat,
        lng: pickedLoc.lng,
      });
    }
    const err = await completeSignup(profile);
    if (err) {
      setBusy(false);
      // Hard failure page — never open homepage without server registration
      router.replace(
        `/signup/error?role=motorist&message=${encodeURIComponent(err)}`
      );
      return;
    }
    setDone(true);
    setBusy(false);
  };

  const titles: Record<Step, string> = {
    1: "Your account",
    2: "Where are you?",
    3: "Your vehicles",
  };
  const subtitles: Record<Step, string> = {
    1: "Create your car owner profile so you can ask for help nearby",
    2: "We use this to find repair people close to you",
    3: "Optional — skip if you do not need vehicle services",
  };

  const vehicleRows: {
    key: VehiclePickerKey;
    label: string;
    value: string;
  }[] = [
    { key: "vehicleType", label: "Vehicle", value: draftVehicleType },
    { key: "make", label: "Make", value: draftMake },
    { key: "model", label: "Model", value: draftModel },
    { key: "year", label: "Year", value: draftYear },
  ];

  // Full-screen picker for vehicle rows (image-style list → options sheet)
  if (vehiclePicker) {
    const titleMap: Record<VehiclePickerKey, string> = {
      vehicleType: "Vehicle",
      make: "Make",
      model: "Model",
      year: "Year",
    };
    return (
      <AuthPlate exiting={exiting}>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3">
          <div className="relative flex items-center justify-center pb-1">
            <button
              type="button"
              onClick={() => {
                setVehiclePicker(null);
                setPickerQuery("");
              }}
              className="absolute left-0 inline-flex h-8 items-center gap-0.5 rounded-md border-0 bg-transparent px-0 text-[12px] font-semibold text-[#1e293b]"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
              Back
            </button>
            <h1 className="text-[15px] font-bold tracking-tight text-[#1c1c1e]">
              {titleMap[vehiclePicker]}
            </h1>
          </div>
          <div className="mt-2">
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search"
              className={fieldClass}
              autoFocus
            />
          </div>
          <ul className="mt-2 min-h-0 flex-1 list-none space-y-0.5 overflow-y-auto overscroll-contain scrollbar-hide">
            {filteredPickerOptions.map((opt) => {
              const selected =
                vehiclePicker === "vehicleType"
                  ? draftVehicleType === opt
                  : vehiclePicker === "make"
                    ? draftMake === opt
                    : vehiclePicker === "model"
                      ? draftModel === opt
                      : draftYear === opt;
              return (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => pickVehicleValue(opt)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border-0 px-3 py-2.5 text-left",
                      selected
                        ? "bg-[#FF6B35]/15 text-[#9a3412]"
                        : "bg-transparent text-[#1e293b] active:bg-black/[0.04]"
                    )}
                  >
                    <span className="min-w-0 flex-1 text-[13px] font-semibold uppercase tracking-[0.01em]">
                      {opt}
                    </span>
                    {selected ? (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
            {filteredPickerOptions.length === 0 && (
              <li className="py-8 text-center text-[12px] text-[#64748b]">
                No matches
              </li>
            )}
          </ul>
        </div>
      </AuthPlate>
    );
  }

  return (
    <AuthPlate exiting={exiting}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Top bar — full width for chrome */}
        <div className="mx-auto flex w-[80%] shrink-0 items-center pb-0.5 pt-2.5">
          <button
            type="button"
            onClick={goBack}
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
                n <= step ? "bg-[#FF6B35]" : "bg-black/10"
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

                {dualSignup && (
                  <p className="rounded-md bg-[#e8e9ed] px-2.5 py-2 text-[11px] leading-snug text-[#334155]">
                    Continue from your Repair Pro account
                  </p>
                )}

                <Field label="Full name" required>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                    <input
                      className={cn(
                        fieldIconClass,
                        nameLocked && authLockedFieldClass
                      )}
                      style={nameLocked ? authLockedFieldStyle : undefined}
                      value={fullName}
                      readOnly={nameLocked}
                      tabIndex={nameLocked ? -1 : undefined}
                      onChange={(e) => {
                        if (nameLocked) return;
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

                <div className="grid grid-cols-2 gap-1.5">
                  <Field label="Gender" required>
                    <select
                      className={cn(
                        selectClass,
                        genderLocked && authLockedFieldClass
                      )}
                      style={genderLocked ? authLockedFieldStyle : undefined}
                      value={gender}
                      disabled={genderLocked}
                      onChange={(e) => {
                        if (genderLocked) return;
                        setGender(e.target.value as SignupGender | "");
                        setFieldError("gender", null);
                      }}
                      onBlur={() =>
                        setFieldError("gender", genderError(gender))
                      }
                      required
                    >
                      <option value="">Select</option>
                      {SIGNUP_GENDER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <FieldHint message={fieldErrors.gender} />
                  </Field>
                  <Field label="Date of birth" required>
                    <input
                      type="date"
                      className={fieldClass}
                      value={dateOfBirth}
                      min={dobInputMin()}
                      max={dobInputMax()}
                      autoComplete="off"
                      // Empty until the customer picks a date — no pre-filled value
                      placeholder=""
                      onChange={(e) => {
                        const v = e.target.value;
                        setDateOfBirth(normalizeDobIso(v) || v);
                        setFieldError("dob", null);
                      }}
                      onBlur={() =>
                        setFieldError("dob", dobError(dateOfBirth))
                      }
                      required
                    />
                    <FieldHint message={fieldErrors.dob} />
                  </Field>
                </div>

                <Field label="Phone" required>
                  <div className="flex gap-1.5">
                    <select
                      className={cn(
                        selectClass,
                        "max-w-[42%]",
                        phoneLocked && authLockedFieldClass
                      )}
                      style={phoneLocked ? authLockedFieldStyle : undefined}
                      value={phoneIso}
                      aria-label="Country code"
                      disabled={phoneLocked}
                      onChange={(e) => {
                        if (phoneLocked) return;
                        const iso = e.target.value;
                        setPhoneIso(iso);
                        const opt = phoneCodes.find((c) => c.iso === iso);
                        if (opt) setPhoneDial(opt.dial);
                        // Country change → clear IDs and force re-entry
                        setIdNumber("");
                        setBvn("");
                        setFieldError("nin", null);
                        setFieldError("bvn", null);
                      }}
                    >
                      {phoneCodes.map((c) => (
                        <option key={`${c.iso}-${c.dial}`} value={c.iso}>
                          {c.label} {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className={cn(
                        fieldClass,
                        "min-w-0 flex-1",
                        phoneLocked && authLockedFieldClass
                      )}
                      style={phoneLocked ? authLockedFieldStyle : undefined}
                      value={phoneNational}
                      readOnly={phoneLocked}
                      tabIndex={phoneLocked ? -1 : undefined}
                      onChange={(e) => {
                        if (phoneLocked) return;
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
                      className={cn(
                        fieldIconClass,
                        emailLocked && authLockedFieldClass
                      )}
                      style={emailLocked ? authLockedFieldStyle : undefined}
                      value={email}
                      readOnly={emailLocked}
                      tabIndex={emailLocked ? -1 : undefined}
                      onChange={(e) => {
                        if (emailLocked) return;
                        setEmail(e.target.value);
                        setFieldError("email", null);
                      }}
                      onBlur={() => setFieldError("email", emailError(email))}
                      placeholder="you@email.com"
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </div>
                  <FieldHint message={fieldErrors.email} />
                </Field>

                {primaryDoc ? (
                  <Field label={primaryDoc.label}>
                    <input
                      className={cn(
                        fieldClass,
                        ninLocked && authLockedFieldClass
                      )}
                      style={ninLocked ? authLockedFieldStyle : undefined}
                      value={idNumber}
                      readOnly={ninLocked}
                      tabIndex={ninLocked ? -1 : undefined}
                      onChange={(e) => {
                        if (ninLocked) return;
                        setIdNumber(filterIdInput(e.target.value, primaryDoc));
                        setFieldError("nin", null);
                      }}
                      onBlur={() => {
                        if (!idNumber.trim()) {
                          setFieldError("nin", null);
                          return;
                        }
                        const r = validateIdFormat(idNumber, primaryDoc);
                        setFieldError("nin", r.ok ? null : r.message);
                      }}
                      placeholder={primaryDoc.placeholder}
                      inputMode={
                        primaryDoc.charset === "digits" ? "numeric" : "text"
                      }
                      maxLength={primaryDoc.maxLen}
                    />
                    <p className="mt-0.5 text-[10px] font-medium text-[#64748b]">
                      {idPack.countryName}: {primaryDoc.hint} You can finish
                      this later in Verify.
                    </p>
                    <FieldHint message={fieldErrors.nin} />
                  </Field>
                ) : null}

                {bankDoc ? (
                  <Field label={bankDoc.label}>
                    <input
                      className={cn(
                        fieldClass,
                        bvnLocked && authLockedFieldClass
                      )}
                      style={bvnLocked ? authLockedFieldStyle : undefined}
                      value={bvn}
                      readOnly={bvnLocked}
                      tabIndex={bvnLocked ? -1 : undefined}
                      onChange={(e) => {
                        if (bvnLocked) return;
                        setBvn(filterIdInput(e.target.value, bankDoc));
                        setFieldError("bvn", null);
                      }}
                      onBlur={() => {
                        if (!bvn.trim()) {
                          setFieldError("bvn", null);
                          return;
                        }
                        const r = validateIdFormat(bvn, bankDoc);
                        setFieldError("bvn", r.ok ? null : r.message);
                      }}
                      placeholder={bankDoc.placeholder}
                      inputMode={
                        bankDoc.charset === "digits" ? "numeric" : "text"
                      }
                      maxLength={bankDoc.maxLen}
                    />
                    <p className="mt-0.5 text-[10px] font-medium text-[#64748b]">
                      {bankDoc.hint}
                    </p>
                    <FieldHint message={fieldErrors.bvn} />
                  </Field>
                ) : null}

                {dualSignup ? (
                  <Field label="Same password as your Repair Pro account" required>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                      <PasswordField
                        withLeftIcon
                        value={password}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPassword(v);
                          setConfirmPassword(v);
                          setFieldError("password", null);
                        }}
                        onBlur={() => {
                          if (!dualPasswordOk) {
                            setFieldError(
                              "password",
                              "Enter the same password as your Repair Pro account."
                            );
                          }
                        }}
                        placeholder="Your existing password"
                        autoComplete="current-password"
                      />
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-[#64748b]">
                      No new password — use the one you already signed up with.
                    </p>
                    <FieldHint message={fieldErrors.password} />
                  </Field>
                ) : (
                  <>
                    <Field label="Password" required>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                        <PasswordField
                          withLeftIcon
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
                          autoComplete="new-password"
                        />
                      </div>
                      <PasswordRules password={password} />
                      <FieldHint message={fieldErrors.password} />
                    </Field>

                    <Field label="Confirm password" required>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                        <PasswordField
                          withLeftIcon
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
                {dualSignup
                  ? "Empty NIN/BVN stay editable · opens as Customer"
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
              {vehicles.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {vehicles.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-[#9A9EA6]/50 bg-white/60 px-2.5 py-2 text-[12px] text-[#0f172a]"
                    >
                      <span className="min-w-0 flex-1 font-semibold">
                        {[v.vehicleType, v.make, v.model, v.year]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 border-0 bg-transparent text-[11px] font-semibold text-red-600"
                        onClick={() =>
                          setVehicles((prev) =>
                            prev.filter((x) => x.id !== v.id)
                          )
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Image-style preference rows: Vehicle → Make → Model → Year */}
              <div className="overflow-hidden rounded-xl bg-[#f2f3f5] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                {vehicleRows.map((row, i) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => openVehiclePicker(row.key)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-0 bg-transparent px-4 py-3.5 text-left",
                      i > 0 && "border-t border-black/[0.06]"
                    )}
                  >
                    <span className="text-[14px] font-semibold text-[#1e293b]">
                      {row.label}
                    </span>
                    <span className="inline-flex min-w-0 max-w-[55%] items-center gap-1">
                      <span className="truncate text-[13px] font-medium uppercase tracking-[0.02em] text-[#64748b]">
                        {displayVal(row.value)}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-[#94a3b8]"
                        strokeWidth={2}
                      />
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={cn(
                  authSecondaryBtnClass,
                  "text-[12px] font-semibold"
                )}
                disabled={!draftReady}
                onClick={() => {
                  if (!addDraftVehicle()) {
                    setFormError("Pick make and model to add a vehicle.");
                    return;
                  }
                  setFormError("");
                }}
              >
                + Add another vehicle
              </button>
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
            <>
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
                disabled={busy}
                onClick={() => finish()}
              >
                {busy ? "Please wait…" : "Create my account"}
              </button>
              <button
                type="button"
                className={authSecondaryBtnClass}
                disabled={busy}
                onClick={() => finish({ skipVehicle: true })}
              >
                Skip vehicle. Finish
              </button>
            </>
          )}
        </div>
      </div>

      <RegistrationComplete
        open={done}
        accountLabel="Customer"
        onContinue={() => {
          // Customer home map — lower panel opens collapsed
          router.replace("/");
        }}
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
