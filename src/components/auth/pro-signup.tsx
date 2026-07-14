"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronLeft, ChevronRight, User } from "lucide-react";
import {
  AuthPlate,
  authBackBtnClass,
  authFieldClass,
  authFieldIconClass,
  authFieldStyle,
  authLabelClass,
  authSelectClass,
  authTextareaClass,
} from "@/components/auth/auth-plate";
import { RegistrationComplete } from "@/components/auth/registration-complete";
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
  confirmPasswordError,
  emailError,
  fullNameError,
  isValidEmail,
  isValidPassword,
  ninError,
  passwordError,
  passwordRules,
  phoneNationalError,
} from "@/lib/signup-validation";
import {
  PRO_SERVICE_LABELS,
  PRO_TRADE_OPTIONS,
} from "@/lib/services";
import {
  CERTIFICATION_WARNING,
  getSkillFlow,
  isSkillFileValue,
  publicSkillRows,
  skillAnswersValid,
  specialtyMaxForSkill,
  type SkillAnswerValue,
} from "@/lib/skill-questions";
import { useApp } from "@/lib/store";
import type { ProService, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PrefKey } from "@/lib/vehicle-focus";
import {
  PREF_ROWS,
  optionsForPref,
  syncBrandForVehicleType,
  syncLocationForCountry,
} from "@/lib/vehicle-focus";

/** 1 skill · 2 skill Q · 3 vehicles · 4 about · 5 contact · 6 area · 7 review */
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Selected value accent (matches reference gold check style) */

/** Actual years of service — 1–9, then 10+ */
const EXP_YEARS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"] as const;
const BIO_MAX = 144;
const MAX_BRANDS = 2;

function experienceLabel(value: string) {
  if (value === "10+") return "10+ yrs";
  if (value === "1") return "1 yr";
  return `${value} yrs`;
}

/**
 * Full Repair Pro registration — one skill only, skill-specific questions,
 * unique phone/email/NIN/BVN across all accounts.
 */
export function ProSignup() {
  const router = useRouter();
  const { completeSignup } = useApp();
  const phoneCodes = useMemo(() => getPhoneCodeOptions(), []);
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Identity locked from existing Motorist account on this device */
  const [identityLocked, setIdentityLocked] = useState(false);

  /** Exactly one skill */
  const [skill, setSkill] = useState<ProService | null>(null);
  const [skillAnswers, setSkillAnswers] = useState<
    Record<string, SkillAnswerValue>
  >({});
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [bio, setBio] = useState("");
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
  const [serviceRadiusKm, setServiceRadiusKm] = useState(8);

  const fullPhone = formatInternationalPhone(phoneDial, phoneNational);

  // Prefill locked identity from existing Motorist account
  useEffect(() => {
    const motorist = getVaultProfile("motorist");
    if (!motorist) return;
    setIdentityLocked(true);
    setFullName(motorist.fullName || "");
    setEmail(motorist.email || "");
    setIdNumber(motorist.idNumber || "");
    setBvn(motorist.bvn || "");
    setPassword(motorist.password || "");
    setConfirmPassword(motorist.password || "");
    const split = splitStoredPhone(motorist.phone || "");
    setPhoneIso(split.iso);
    setPhoneDial(split.dial);
    setPhoneNational(split.national);
  }, []);

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

  /** Service focus: type, up to 2 brands, many models per brand, country, location */
  const [vehicleType, setVehicleType] = useState("Automobile / Passenger Car");
  const [vehicleBrands, setVehicleBrands] = useState<string[]>([]);
  /** Models chosen for each brand (multi-select, no cap) */
  const [vehicleModelsByBrand, setVehicleModelsByBrand] = useState<
    Record<string, string[]>
  >({});
  const [prefCountry, setPrefCountry] = useState("Nigeria");
  const [prefLocation, setPrefLocation] = useState("Any");
  const [pickerKey, setPickerKey] = useState<PrefKey | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const brandLabel =
    vehicleBrands.length === 0
      ? "Pick up to 2"
      : vehicleBrands.join(", ");

  const modelsFor = (brand: string) =>
    vehicleModelsByBrand[brand]?.length
      ? vehicleModelsByBrand[brand]
      : (["Any"] as string[]);

  const modelLabel =
    vehicleBrands.length === 0
      ? "Pick brands first"
      : vehicleBrands
          .map((b) => {
            const list = modelsFor(b);
            const modelsText = list.join(", ");
            return vehicleBrands.length > 1 ? `${b}: ${modelsText}` : modelsText;
          })
          .join(" · ");

  const prefValue: Record<PrefKey, string> = {
    vehicleType,
    brand: brandLabel,
    model: modelLabel,
    country: prefCountry,
    location: prefLocation,
  };

  /** Toggle a model under a brand (unlimited multi-select). */
  const toggleModelForBrand = (brand: string, model: string) => {
    setVehicleModelsByBrand((prev) => {
      const cur = prev[brand] ?? [];
      if (model === "Any") {
        return { ...prev, [brand]: ["Any"] };
      }
      const withoutAny = cur.filter((m) => m !== "Any");
      if (withoutAny.includes(model)) {
        const next = withoutAny.filter((m) => m !== model);
        return { ...prev, [brand]: next.length ? next : ["Any"] };
      }
      return { ...prev, [brand]: [...withoutAny, model] };
    });
  };

  const toggleBrand = (value: string) => {
    setVehicleBrands((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((b) => b !== value);
        setVehicleModelsByBrand((models) => {
          const copy = { ...models };
          delete copy[value];
          return copy;
        });
        return next;
      }
      if (prev.length >= MAX_BRANDS) return prev;
      if (value === "Any") {
        setVehicleModelsByBrand({ Any: ["Any"] });
        return ["Any"];
      }
      const withoutAny = prev.filter((b) => b !== "Any");
      const next = [...withoutAny, value];
      setVehicleModelsByBrand((models) => {
        const cleaned = { ...models };
        delete cleaned.Any;
        return {
          ...cleaned,
          [value]: models[value]?.length ? models[value] : ["Any"],
        };
      });
      return next;
    });
  };

  const setPrefValue = (key: PrefKey, value: string) => {
    if (key === "vehicleType") {
      setVehicleType(value);
      const synced = vehicleBrands
        .map((b) => syncBrandForVehicleType(value, b))
        .filter((b, i, arr) => arr.indexOf(b) === i)
        .slice(0, MAX_BRANDS);
      setVehicleBrands(synced);
      setVehicleModelsByBrand((prev) => {
        const next: Record<string, string[]> = {};
        for (const b of synced) {
          const existing = prev[b] ?? ["Any"];
          // Keep models that still exist for this brand/type
          const allowed = new Set(
            optionsForPref("model", value, b, prefCountry)
          );
          const kept = existing.filter((m) => allowed.has(m));
          next[b] = kept.length ? kept : ["Any"];
        }
        return next;
      });
      return;
    }
    if (key === "brand") {
      toggleBrand(value);
      return;
    }
    if (key === "model") {
      const b = vehicleBrands[0] || "Any";
      toggleModelForBrand(b, value);
      return;
    }
    if (key === "country") {
      setPrefCountry(value);
      setPrefLocation(syncLocationForCountry(value, prefLocation));
      return;
    }
    setPrefLocation(value);
  };

  const openPicker = (key: PrefKey) => {
    setPickerQuery("");
    setPickerKey(key);
  };

  const closePicker = () => {
    setPickerKey(null);
    setPickerQuery("");
  };

  const selectSkill = (id: ProService, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setSkill(id);
    setSkillAnswers({});
    // Stay on step 1 until user taps Next (never leave signup)
  };

  const setSkillAnswer = (qid: string, value: SkillAnswerValue) => {
    setSkillAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const toggleMulti = (qid: string, option: string, maxSelect?: number) => {
    setSkillAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? [...(prev[qid] as string[])] : [];
      if (cur.includes(option)) {
        return { ...prev, [qid]: cur.filter((x) => x !== option) };
      }
      if (maxSelect != null && cur.length >= maxSelect) {
        return prev; // already at max (e.g. 3 specialties)
      }
      return { ...prev, [qid]: [...cur, option] };
    });
  };

  const onCertFile = (qid: string, file: File | null) => {
    if (!file) {
      setSkillAnswers((prev) => {
        const next = { ...prev };
        delete next[qid];
        return next;
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setSkillAnswer(qid, {
        name: file.name,
        dataUrl,
        mime: file.type || "application/octet-stream",
      });
    };
    reader.readAsDataURL(file);
  };

  const step1Ok = skill != null;
  const step2Ok = skill != null && skillAnswersValid(skill, skillAnswers);
  const step3Ok = vehicleBrands.length >= 1 && vehicleBrands.length <= MAX_BRANDS;
  const step4Ok =
    fullName.trim().length >= 2 &&
    businessName.trim().length >= 2 &&
    yearsExperience.trim().length > 0 &&
    bio.trim().length >= 2 &&
    bio.trim().length <= BIO_MAX;
  const step5Ok = identityLocked
    ? !phoneNationalError(phoneNational) &&
      isValidEmail(email) &&
      !ninError(idNumber) &&
      !bvnError(bvn) &&
      password.length > 0
    : !phoneNationalError(phoneNational) &&
      isValidEmail(email) &&
      isValidPassword(password) &&
      confirmPassword === password &&
      confirmPassword.length > 0 &&
      !ninError(idNumber) &&
      !bvnError(bvn);
  const step6Ok =
    city.trim().length >= 2 &&
    area.trim().length >= 2 &&
    serviceRadiusKm >= 1;

  const validateStep4 = (): string | null => {
    if (fullNameError(fullName)) return fullNameError(fullName);
    if (businessName.trim().length < 2) return "Please enter your business or workshop name.";
    if (!yearsExperience.trim()) return "Please pick how many years you have worked.";
    if (bio.trim().length < 2) return "Please write a short bio.";
    if (bio.trim().length > BIO_MAX) return `Bio must be ${BIO_MAX} characters or less.`;
    return null;
  };

  const validateStep5 = (): string | null => {
    if (identityLocked) {
      return (
        phoneNationalError(phoneNational) ||
        emailError(email) ||
        ninError(idNumber) ||
        bvnError(bvn)
      );
    }
    return (
      phoneNationalError(phoneNational) ||
      emailError(email) ||
      ninError(idNumber) ||
      bvnError(bvn) ||
      passwordError(password) ||
      confirmPasswordError(password, confirmPassword)
    );
  };

  const finish = async () => {
    if (busy || !skill || !step2Ok || !step4Ok || !step5Ok || !step6Ok) return;
    const v5 = validateStep5();
    if (v5) {
      setFormError(v5);
      setStep(5);
      return;
    }
    setBusy(true);
    setFormError("");

    const identity = checkIdentityAvailable({
      phone: fullPhone,
      email: email.trim(),
      nin: idNumber.trim(),
      bvn: bvn.trim(),
      accountType: "professional",
    });
    if (!identity.ok) {
      setFormError(identity.message);
      setBusy(false);
      setStep(5);
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
      setStep(5);
      return;
    }

    const profile: UserProfile = {
      accountType: "professional",
      fullName: fullName.trim(),
      businessName: businessName.trim(),
      phone: fullPhone,
      email: email.trim(),
      password,
      city: city.trim(),
      area: area.trim(),
      services: [skill],
      serviceRadiusKm,
      yearsExperience: yearsExperience.trim() || undefined,
      bio: bio.trim() || undefined,
      idNumber: idNumber.trim() || undefined,
      bvn: bvn.trim() || undefined,
      skillAnswers,
      servedVehicleType: vehicleType,
      servedBrand: vehicleBrands.join(", ") || "Any",
      servedMake: vehicleBrands[0] || "Any",
      servedModel:
        vehicleBrands.length === 0
          ? "Any"
          : vehicleBrands
              .map((b) => {
                const list = vehicleModelsByBrand[b]?.length
                  ? vehicleModelsByBrand[b]
                  : ["Any"];
                const modelsText = list.join(", ");
                return vehicleBrands.length > 1
                  ? `${b}: ${modelsText}`
                  : modelsText;
              })
              .join(" · "),
      servedCountry: prefCountry,
      servedLocation: prefLocation,
      registeredAt: new Date().toISOString(),
    };
    const err = completeSignup(profile);
    if (err) {
      setFormError(err);
      setBusy(false);
      setStep(5);
      return;
    }
    setDone(true);
    setBusy(false);
  };

  const goBack = () => {
    if (pickerKey) {
      closePicker();
      return;
    }
    if (step === 1) router.push("/login/role");
    else setStep((s) => (s - 1) as Step);
  };

  const stepTitles: Record<Step, string> = {
    1: "What work do you do?",
    2: skill ? getSkillFlow(skill).title : "Tell us about your skill",
    3: "Cars you usually fix",
    4: "About you",
    5: "Phone, email and password",
    6: "Where do you work from?",
    7: "Check and finish",
  };

  const pickerLabel = pickerKey
    ? PREF_ROWS.find((r) => r.key === pickerKey)?.label ?? ""
    : "";

  /* Full-page picker (same AuthPlate background) */
  if (pickerKey) {
    const isVehicleType = pickerKey === "vehicleType";
    const isBrand = pickerKey === "brand";
    const isModel = pickerKey === "model";
    const q = pickerQuery.trim().toLowerCase();

    const filterOpts = (opts: string[]) =>
      opts.filter((opt) => !q || opt.toLowerCase().includes(q));

    const singleBrandForModel = vehicleBrands[0] || "Any";
    const modelBrands =
      vehicleBrands.length > 0 ? vehicleBrands : (["Any"] as string[]);

    const singleOptions =
      !isModel || vehicleBrands.length <= 1
        ? filterOpts(
            optionsForPref(
              pickerKey,
              vehicleType,
              isModel ? singleBrandForModel : vehicleBrands[0] || "Any",
              prefCountry
            )
          )
        : [];

    const optionBtn = (
      opt: string,
      selected: boolean,
      onPick: () => void,
      disabled?: boolean
    ) => (
      <button
        type="button"
        key={opt}
        disabled={disabled}
        onClick={onPick}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border-0 px-2 text-left transition-colors",
          isVehicleType ? "py-1.5" : "py-2",
          selected
            ? "bg-[#e85a12]/18 text-[#9a3412] ring-1 ring-[#e85a12]/45"
            : "bg-transparent text-[#1e293b] active:bg-black/[0.04]",
          disabled && "opacity-40"
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 font-semibold uppercase leading-snug tracking-[0.01em]",
            isVehicleType || isModel ? "text-[11px]" : "text-[13px]",
            selected ? "text-[#9a3412]" : "text-[#1e293b]"
          )}
        >
          {opt}
        </span>
        {selected && (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-[#e85a12]"
            strokeWidth={2.5}
          />
        )}
      </button>
    );

    const modelColumn = (brand: string) => {
      const opts = filterOpts(
        optionsForPref("model", vehicleType, brand, prefCountry)
      );
      const chosen = modelsFor(brand);
      return (
        <div
          key={brand}
          className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-black/10 bg-white/40"
        >
          <p className="shrink-0 border-b border-black/10 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-[#475569]">
            {brand}
            <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-[#64748b]">
              {chosen.filter((m) => m !== "Any").length ||
              chosen.includes("Any")
                ? `${chosen.length} selected`
                : "Tap models"}
            </span>
          </p>
          <ul className="min-h-0 flex-1 list-none space-y-0.5 overflow-y-auto overscroll-contain p-1 scrollbar-hide">
            {opts.map((opt) =>
              optionBtn(opt, chosen.includes(opt), () =>
                toggleModelForBrand(brand, opt)
              )
            )}
            {opts.length === 0 && (
              <li className="py-4 text-center text-[11px] text-[#64748b]">
                No matches
              </li>
            )}
          </ul>
        </div>
      );
    };

    return (
      <AuthPlate>
        <div className="om-pro-signup-fields flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3">
          <div className="relative flex items-center justify-center pb-0.5">
            <button
              type="button"
              onClick={closePicker}
              className="absolute left-0 inline-flex h-8 items-center gap-0.5 rounded-md border-0 bg-transparent px-0 text-[12px] font-semibold text-[#1e293b]"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
              Back
            </button>
            <h1 className="text-[15px] font-bold tracking-tight text-[#1c1c1e]">
              {isBrand
                ? "Car brands (up to 2)"
                : isModel
                  ? "Models"
                  : pickerLabel}
            </h1>
          </div>

          {isBrand && (
            <p className="mt-1 text-center text-[11px] text-[#475569]">
              Selected {vehicleBrands.length}/{MAX_BRANDS}. Tap to add or remove.
            </p>
          )}
          {isModel && vehicleBrands.length > 0 && (
            <p className="mt-1 text-center text-[11px] text-[#475569]">
              Full list per brand. Pick as many models as you like, then Done.
            </p>
          )}
          {isModel && vehicleBrands.length === 0 && (
            <p className="mt-1 text-center text-[11px] text-[#475569]">
              Pick brands first, then choose models.
            </p>
          )}

          <div className="mt-2">
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search"
              className={authFieldClass}
              style={authFieldStyle}
              autoFocus
            />
          </div>

          {/* Two brands: side-by-side full model catalogs, multi-select */}
          {isModel && vehicleBrands.length >= 1 ? (
            <div
              className={cn(
                "mt-1.5 min-h-0 flex-1 gap-2",
                vehicleBrands.length > 1
                  ? "grid grid-cols-2"
                  : "flex flex-col"
              )}
            >
              {modelBrands.map((brand) => modelColumn(brand))}
            </div>
          ) : (
            <ul className="mt-1.5 min-h-0 flex-1 list-none space-y-1 overflow-y-auto overscroll-contain scrollbar-hide">
              {singleOptions.map((opt) => {
                const selected = isBrand
                  ? vehicleBrands.includes(opt)
                  : prefValue[pickerKey] === opt;
                const brandFull =
                  isBrand && !selected && vehicleBrands.length >= MAX_BRANDS;
                return (
                  <li key={opt}>
                    {optionBtn(
                      opt,
                      selected,
                      () => {
                        if (isBrand) {
                          toggleBrand(opt);
                          return;
                        }
                        setPrefValue(pickerKey, opt);
                        closePicker();
                      },
                      brandFull
                    )}
                  </li>
                );
              })}
              {singleOptions.length === 0 && (
                <li className="py-8 text-center text-[12px] text-[#64748b]">
                  {isModel && vehicleBrands.length === 0
                    ? "Pick car brands first"
                    : "No matches"}
                </li>
              )}
            </ul>
          )}

          {(isBrand || isModel) && (
            <button
              type="button"
              className="om-cta-dark-gray mt-2"
              onClick={closePicker}
              disabled={isModel && vehicleBrands.length === 0}
            >
              Done
            </button>
          )}
        </div>
      </AuthPlate>
    );
  }

  return (
    <AuthPlate>
      <div className="om-pro-signup-fields mx-auto flex min-h-0 w-[80%] flex-1 flex-col pb-4 pt-5">
        <button type="button" onClick={goBack} className={authBackBtnClass}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          Back
        </button>

        <h1 className="text-center text-[17px] font-bold tracking-tight text-[#1c1c1e]">
          {stepTitles[step]}
        </h1>
        {/* Progress bar only (no page numbers) */}
        <div className="mt-2 flex gap-1">
          {([1, 2, 3, 4, 5, 6, 7] as Step[]).map((n) => (
            <span
              key={n}
              className={cn(
                "h-0.5 flex-1 rounded-sm",
                n <= step
                  ? "auth-apple-progress-fill"
                  : "auth-apple-progress-track"
              )}
            />
          ))}
        </div>

        <div
          className={cn(
            "mt-2 flex min-h-0 flex-1 flex-col",
            step === 1
              ? "overflow-hidden"
              : "gap-2 overflow-y-auto scrollbar-hide"
          )}
        >
          {step === 1 && (
            <>
              <div className="min-h-0 w-full flex-1 overflow-y-auto scrollbar-hide">
                <ul className="flex list-none flex-col gap-2 p-0 pb-2">
                  {PRO_TRADE_OPTIONS.map(({ id, label, icon: Icon, hint }) => {
                    const active = skill === id;
                    return (
                      <li key={id} className="shrink-0">
                        <button
                          type="button"
                          onClick={(e) => selectSkill(id, e)}
                          aria-pressed={active}
                          className={cn(
                            "flex min-h-[52px] w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                            !active &&
                              "bg-[#E2E3E7] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] hover:bg-[#E8E9ED]",
                            active &&
                              "bg-[#9a9da5] shadow-[0_1px_6px_rgba(15,23,42,0.08)]"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0",
                              active ? "text-[#1c1c1e]" : "text-[#3f4248]"
                            )}
                            strokeWidth={1.85}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block text-[15px] tracking-[-0.01em]",
                                active
                                  ? "font-semibold text-[#1c1c1e]"
                                  : "font-medium text-[#1c1c1e]"
                              )}
                            >
                              {label}
                            </span>
                            <span className="block text-[11px] text-[#3a3a3c]/70">
                              {hint}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                              active
                                ? "border-[#e85a12] bg-[#e85a12] text-[8px] font-bold text-white"
                                : "border-[#8b8e96]/50 bg-transparent"
                            )}
                            aria-hidden
                          >
                            {active ? "✓" : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p className="mt-2 shrink-0 text-center text-[11px] text-[#3a3a3c]/70">
                Choose only{" "}
                <span className="font-semibold text-[#e85a12]">one</span> skill
              </p>
            </>
          )}

          {/* Step 2 — skill-specific questions (professional layout) */}
          {step === 2 && skill && (
            <div className="flex flex-col gap-3.5 pb-1 pt-0.5">
              <div className="text-center">
                <p className="text-[11px] leading-snug text-[#475569]">
                  {getSkillFlow(skill).intro}
                </p>
              </div>

              {getSkillFlow(skill).questions.map((q) => {
                const val = skillAnswers[q.id];
                const selectedCount = Array.isArray(val) ? val.length : 0;
                const isSpecialties = q.id === "specialties";

                return (
                  <section
                    key={q.id}
                    className={cn(
                      "flex flex-col border-b border-black/[0.06] last:border-0 last:pb-0",
                      isSpecialties
                        ? "gap-2 rounded-md border border-[#c5c7ce] bg-[#e8e9ed]/80 p-2.5 pb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] last:border last:pb-3"
                        : "gap-2 pb-3.5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[13px] font-bold",
                            isSpecialties ? "text-[#1e293b]" : "text-[#0f172a]"
                          )}
                        >
                          {q.label}
                          {q.required ? (
                            <span className="text-[#e85a12]"> *</span>
                          ) : null}
                        </p>
                        {q.hint && (
                          <p className="mt-0.5 text-[11px] leading-snug text-[#475569]">
                            {q.hint}
                          </p>
                        )}
                      </div>
                      {q.type === "multiselect" && q.maxSelect != null && (
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums",
                            selectedCount > 0
                              ? "bg-[#e85a12] text-white"
                              : isSpecialties
                                ? "bg-white/80 text-[#475569] ring-1 ring-[#b8bbc3]"
                                : "bg-black/10 text-[#475569]"
                          )}
                        >
                          {selectedCount}/{q.maxSelect}
                        </span>
                      )}
                    </div>

                    {q.type === "text" && (
                      <input
                        className={authFieldClass}
                      style={authFieldStyle}
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) => setSkillAnswer(q.id, e.target.value)}
                        placeholder={q.placeholder}
                      />
                    )}

                    {q.type === "select" && (
                      <div className="grid grid-cols-2 gap-2">
                        {(q.options ?? []).map((opt) => {
                          const on = val === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setSkillAnswer(q.id, opt)}
                              className={cn(
                                "rounded-md px-3 py-2.5 text-[12px] font-semibold transition-colors",
                                on
                                  ? "border-0 bg-[#323231] text-white shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
                                  : "border border-[#9A9EA6] bg-[#E2E3E7] text-[#0f172a] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)]"
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === "multiselect" && (
                      <div
                        className={cn(
                          "grid",
                          isSpecialties
                            ? "grid-cols-3 gap-1.5"
                            : "grid-cols-2 gap-2"
                        )}
                      >
                        {(q.options ?? []).map((opt) => {
                          const arr = Array.isArray(val) ? val : [];
                          const on = arr.includes(opt);
                          const atMax =
                            q.maxSelect != null &&
                            arr.length >= q.maxSelect &&
                            !on;
                          return (
                            <button
                              key={opt}
                              type="button"
                              disabled={atMax}
                              onClick={() =>
                                toggleMulti(q.id, opt, q.maxSelect)
                              }
                              className={cn(
                                "rounded-md font-semibold transition-colors",
                                isSpecialties
                                  ? "flex h-11 items-center justify-center px-1.5 text-center text-[11px] leading-tight"
                                  : "px-2.5 py-2.5 text-left text-[12px] leading-snug",
                                /* "What you can fix": moderate highlight, no border lines */
                                isSpecialties && on
                                  ? "border-0 bg-[#fff0e8] text-[#9a3412] shadow-[0_1px_4px_rgba(232,90,18,0.22)] ring-0"
                                  : isSpecialties && atMax
                                    ? "border-0 bg-[#e0e1e5] text-[#94a3b8] opacity-70"
                                    : isSpecialties
                                      ? "border-0 bg-[#e8e9ed] text-[#1e293b] shadow-[0_1px_3px_rgba(15,23,42,0.08)] active:bg-[#dde0e6]"
                                      : on
                                        ? "border-0 bg-[#323231] text-white shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
                                        : atMax
                                          ? "border-0 bg-[#E2E3E7]/50 text-[#94a3b8]"
                                          : "border-0 bg-[#E2E3E7] text-[#0f172a] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)]"
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {q.type === "file" && (
                      <div className="flex flex-col gap-2">
                        <div
                          className="rounded-md border border-red-300/80 bg-red-50 px-3 py-2.5"
                          role="note"
                        >
                          <p className="text-center text-[10px] font-bold uppercase leading-snug tracking-[0.03em] text-red-700">
                            {CERTIFICATION_WARNING}
                          </p>
                        </div>
                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#9A9EA6] bg-[#E2E3E7] px-3 py-5 text-center transition-colors active:bg-[#E8E9ED]">
                          <span className="text-[13px] font-semibold text-[#0f172a]">
                            {isSkillFileValue(val)
                              ? "Replace certificate"
                              : "Tap to upload certificate"}
                          </span>
                          <span className="mt-1 text-[11px] text-[#64748b]">
                            PDF, JPG, or PNG · required
                          </span>
                          <input
                            type="file"
                            accept={q.accept ?? "image/*,.pdf,application/pdf"}
                            className="sr-only"
                            onChange={(e) =>
                              onCertFile(q.id, e.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                        {isSkillFileValue(val) && (
                          <p className="text-center text-[12px] font-medium text-[#16a34a]">
                            ✓ {val.name}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {/* Step 3 — Service focus (same app bg, no extra panel fill) */}
          {step === 3 && (
            <div className="flex flex-col pt-1">
              <p className="mb-2 px-0.5 text-center text-[12px] leading-relaxed text-[#475569]">
                Which cars do you usually work on?
              </p>
              <div>
                {PREF_ROWS.map(({ key, label }, i) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openPicker(key)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-0 bg-transparent px-1 py-3.5 text-left transition-colors active:bg-black/[0.03]",
                      i > 0 && "border-t border-black/[0.08]"
                    )}
                  >
                    <span className="text-[15px] font-semibold text-[#1e293b]">
                      {label}
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[13px] font-medium uppercase tracking-[0.02em] text-[#64748b]">
                        {prefValue[key]}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-[#94a3b8]"
                        strokeWidth={2}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-6 pt-1">
              <section className="flex flex-col gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                    Your name
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#475569]">
                    This is how car owners will see you
                  </p>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#475569]">
                    Full name
                    <span className="ml-0.5 font-bold text-red-600" aria-label="required">
                      *
                    </span>
                  </span>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                    <input
                      className={authFieldIconClass}
                      style={{
                        ...authFieldStyle,
                        ...(identityLocked
                          ? { opacity: 0.85, cursor: "not-allowed" }
                          : null),
                      }}
                      value={fullName}
                      readOnly={identityLocked}
                      onChange={(e) => {
                        if (!identityLocked) setFullName(e.target.value);
                      }}
                      placeholder="e.g. Adaobi Okeke"
                      autoComplete="name"
                      required
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#475569]">
                    Business / workshop
                    <span className="ml-0.5 font-bold text-red-600" aria-label="required">
                      *
                    </span>
                  </span>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                    <input
                      className={authFieldIconClass}
                      style={authFieldStyle}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Okafor Auto Care"
                      required
                    />
                  </div>
                </label>
              </section>

              <section className="flex flex-col gap-2.5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                    Years of service
                    <span className="ml-0.5 font-bold text-red-600" aria-label="required">
                      *
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#475569]">
                    How many years have you worked? (required)
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {EXP_YEARS.map((year) => {
                    const on = yearsExperience === year;
                    const isTenPlus = year === "10+";
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => setYearsExperience(year)}
                        aria-pressed={on}
                        aria-label={experienceLabel(year)}
                        className={cn(
                          "flex h-11 items-center justify-center rounded-md px-0.5 text-center font-semibold transition-all",
                          isTenPlus ? "text-[11px] leading-tight" : "text-[14px]",
                          on
                            ? "border-0 bg-[#323231] text-white shadow-[0_2px_8px_rgba(0,0,0,0.16)]"
                            : "border border-[#9A9EA6] bg-[#E2E3E7] text-[#0f172a] shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] active:bg-[#E8E9ED]"
                        )}
                      >
                        {isTenPlus ? (
                          <span className="flex flex-col items-center leading-none">
                            <span>10+</span>
                            <span
                              className={cn(
                                "mt-0.5 text-[9px] font-medium",
                                on ? "text-white/75" : "text-[#64748b]"
                              )}
                            >
                              yrs
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-baseline gap-0.5">
                            <span>{year}</span>
                            <span
                              className={cn(
                                "text-[10px] font-medium",
                                on ? "text-white/75" : "text-[#64748b]"
                              )}
                            >
                              {year === "1" ? "yr" : "yrs"}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-2.5">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                      Short bio
                      <span className="ml-0.5 font-bold text-red-600" aria-label="required">
                        *
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#475569]">
                      Write what you do best (max {BIO_MAX} characters)
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-semibold tabular-nums",
                      bio.length > BIO_MAX * 0.9
                        ? "text-[#e85a12]"
                        : "text-[#94a3b8]"
                    )}
                  >
                    {bio.length}/{BIO_MAX}
                  </span>
                </div>
                <textarea
                  className={authTextareaClass}
                  style={authFieldStyle}
                  value={bio}
                  maxLength={BIO_MAX}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  placeholder="e.g. I come on time, fair price, I work nights"
                  rows={3}
                  required
                />
              </section>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-1.5">
              {identityLocked ? (
                <p className="rounded-md bg-[#e8e9ed] px-2.5 py-2 text-center text-[11px] leading-snug text-[#334155]">
                  We filled your name, phone, email, NIN and BVN from your
                  Motorist account. Those cannot be changed here. No new
                  password needed.
                </p>
              ) : (
                <p className="text-center text-[10px] leading-snug text-[#475569]">
                  {IDENTITY_RULE_COPY}
                </p>
              )}
              {formError && (
                <p
                  className="rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-medium leading-snug text-red-700"
                  role="alert"
                >
                  {formError}
                </p>
              )}
              <Field label="Phone" required>
                <div className="flex gap-1.5">
                  <select
                    className={cn(authSelectClass, "max-w-[42%]")}
                    style={authFieldStyle}
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
                    className={cn(authFieldClass, "min-w-0 flex-1")}
                    style={{
                      ...authFieldStyle,
                      ...(identityLocked
                        ? { opacity: 0.85, cursor: "not-allowed" }
                        : null),
                    }}
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
                      setFieldError("phone", phoneNationalError(phoneNational))
                    }
                    placeholder="8012345678"
                    type="tel"
                    inputMode="numeric"
                  />
                </div>
                <FieldHint message={fieldErrors.phone} />
              </Field>
              <Field label="Email" required>
                <input
                  className={authFieldClass}
                  style={{
                    ...authFieldStyle,
                    ...(identityLocked
                      ? { opacity: 0.85, cursor: "not-allowed" }
                      : null),
                  }}
                  value={email}
                  readOnly={identityLocked}
                  onChange={(e) => {
                    if (identityLocked) return;
                    setEmail(e.target.value);
                    setFieldError("email", null);
                  }}
                  onBlur={() => setFieldError("email", emailError(email))}
                  placeholder="pro@email.com"
                  type="email"
                />
                <FieldHint message={fieldErrors.email} />
              </Field>
              <Field label="NIN (11 numbers)">
                <input
                  className={authFieldClass}
                  style={{
                    ...authFieldStyle,
                    ...(identityLocked
                      ? { opacity: 0.85, cursor: "not-allowed" }
                      : null),
                  }}
                  value={idNumber}
                  readOnly={identityLocked}
                  onChange={(e) => {
                    if (identityLocked) return;
                    setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11));
                    setFieldError("nin", null);
                  }}
                  onBlur={() => setFieldError("nin", ninError(idNumber))}
                  placeholder="NIN"
                  inputMode="numeric"
                  maxLength={11}
                />
                <FieldHint message={fieldErrors.nin} />
              </Field>
              <Field label="BVN (11 numbers)">
                <input
                  className={authFieldClass}
                  style={{
                    ...authFieldStyle,
                    ...(identityLocked
                      ? { opacity: 0.85, cursor: "not-allowed" }
                      : null),
                  }}
                  value={bvn}
                  readOnly={identityLocked}
                  onChange={(e) => {
                    if (identityLocked) return;
                    setBvn(e.target.value.replace(/\D/g, "").slice(0, 11));
                    setFieldError("bvn", null);
                  }}
                  onBlur={() => setFieldError("bvn", bvnError(bvn))}
                  placeholder="BVN"
                  inputMode="numeric"
                  maxLength={11}
                />
                <FieldHint message={fieldErrors.bvn} />
              </Field>
              {!identityLocked && (
                <>
                  <Field label="Password" required>
                    <input
                      className={authFieldClass}
                      style={authFieldStyle}
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
                      type="password"
                      placeholder="At least 8 characters"
                    />
                    <PasswordRules password={password} inline />
                    <FieldHint message={fieldErrors.password} />
                  </Field>
                  <Field label="Confirm password" required>
                    <input
                      className={authFieldClass}
                      style={authFieldStyle}
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
                      type="password"
                      placeholder="Re-enter password"
                    />
                    <FieldHint message={fieldErrors.confirm} />
                  </Field>
                </>
              )}
            </div>
          )}

          {step === 6 && (
            <>
              <Field label="City">
                <input
                  className={authFieldClass}
                      style={authFieldStyle}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Lagos"
                />
              </Field>
              <Field label="Area or street">
                <input
                  className={authFieldClass}
                      style={authFieldStyle}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Yaba"
                />
              </Field>
              <Field label={`How far you can go: ${serviceRadiusKm} km`}>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(Number(e.target.value))}
                  className="mt-2 w-full accent-[#e85a12]"
                />
              </Field>
            </>
          )}

          {step === 7 && (
            <div className="space-y-0 text-[12px]">
              <Row k="Name" v={fullName} />
              <Row k="Business" v={businessName} />
              <Row k="Skill" v={skill ? PRO_SERVICE_LABELS[skill] : "Not set"} />
              {skill &&
                publicSkillRows(skill, skillAnswers).map((r) => (
                  <Row key={r.label} k={r.label} v={r.value} />
                ))}
              <Row k="Vehicle" v={vehicleType} />
              <Row k="Brands" v={brandLabel} />
              <Row k="Models" v={modelLabel} />
              <Row k="Country" v={prefCountry} />
              <Row k="State / Region" v={prefLocation} />
              <Row k="Phone" v={fullPhone} />
              <Row k="Email" v={email} />
              <Row k="NIN" v={idNumber} />
              <Row k="BVN" v={bvn ? "••••" + bvn.slice(-4) : "Not set"} />
              <Row k="Area" v={`${area}, ${city}`} />
              <Row k="Radius" v={`${serviceRadiusKm} km`} />
              {yearsExperience && (
                <Row k="Experience" v={experienceLabel(yearsExperience)} />
              )}
              {bio && <Row k="Bio" v={bio} />}
            </div>
          )}
        </div>

        <div className={cn("shrink-0", step === 1 ? "mt-2" : "mt-3")}>
          {formError && step !== 5 && (
            <p className="mb-2 text-center text-[12px] font-medium text-red-700">
              {formError}
            </p>
          )}
          {step < 7 ? (
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
                cursor: "pointer",
                opacity: 1,
              }}
              data-cta="next"
              onClick={() => {
                if (step === 3 && !step3Ok) {
                  setFormError("Please pick at least 1 car brand (up to 2).");
                  return;
                }
                if (step === 4) {
                  const err = validateStep4();
                  if (err) {
                    setFormError(err);
                    return;
                  }
                }
                if (step === 5) {
                  const err = validateStep5();
                  if (err) {
                    setFormError(err);
                    return;
                  }
                }
                const blocked =
                  (step === 1 && !step1Ok) ||
                  (step === 2 && !step2Ok) ||
                  (step === 3 && !step3Ok) ||
                  (step === 4 && !step4Ok) ||
                  (step === 5 && !step5Ok) ||
                  (step === 6 && !step6Ok);
                if (blocked) return;
                setFormError("");
                setStep((s) => (s + 1) as Step);
              }}
            >
              Next
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
              data-cta="complete-registration"
              onClick={finish}
            >
              {busy ? "Please wait…" : "Finish and create account"}
            </button>
          )}
        </div>

      </div>

      <RegistrationComplete
        open={done}
        accountLabel="Repair Pro"
        onContinue={() => router.replace("/dashboard")}
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
      <span className={authLabelClass}>
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
    <p
      className="mt-0.5 text-[10px] font-medium leading-snug text-red-600"
      role="alert"
    >
      {message}
    </p>
  );
}

function PasswordRules({
  password,
  inline,
}: {
  password: string;
  inline?: boolean;
}) {
  const r = passwordRules(password);
  const rows: { ok: boolean; text: string }[] = [
    { ok: r.length, text: "At least 8 characters" },
    { ok: r.upper, text: "At least 1 capital letter" },
    { ok: r.digit, text: "At least 1 number" },
    { ok: true, text: "You can add symbols if you want" },
  ];
  return (
    <ul className={cn("mt-1 space-y-0.5", inline && "mb-0.5")}>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 border-b border-black/[0.06] py-2 last:border-0">
      <span className="w-24 shrink-0 font-semibold text-[#86868b]">{k}</span>
      <span className="min-w-0 flex-1 font-semibold text-[#1d1d1f]">{v}</span>
    </div>
  );
}
