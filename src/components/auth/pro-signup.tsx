"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, Check, ChevronLeft, ChevronRight, User } from "lucide-react";
import {
  AuthPlate,
  authBackBtnClass,
  authFieldClass as authFieldClassLegacy,
  authFieldIconClass as authFieldIconClassLegacy,
  authFieldStyle as authFieldStyleLegacy,
  authLabelClass,
  authLockedFieldClass,
  authLockedFieldStyle,
  authSelectClass as authSelectClassLegacy,
  authTextareaClass as authTextareaClassLegacy,
} from "@/components/auth/auth-plate";
import {
  AppleProBody,
  AppleProFooter,
  AppleProOptionRow,
  AppleProProgress,
  AppleProTitle,
  AppleProWizard,
  appleProFieldClass,
  appleProSelectClass,
  appleProTextareaClass,
  proSheetBg,
} from "@/components/pro/apple-pro-wizard";
import { useAuthNavigate } from "@/components/auth/auth-transition";
import { PasswordField } from "@/components/auth/password-field";
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
  genderError,
  dobError,
  dobInputMax,
  dobInputMin,
  formatGenderLabel,
  normalizeDobIso,
  SIGNUP_GENDER_OPTIONS,
  type SignupGender,
} from "@/lib/signup-validation";
import { compressImageFile } from "@/lib/image-compress";
import {
  PRO_SERVICE_LABELS,
  PRO_TRADE_OPTIONS,
} from "@/lib/services";
import {
  ARTISAN_TRADE_CATALOG,
  needsVehiclesSignupStep,
  tradeDef,
} from "@/lib/artisan/catalog";
import {
  CERTIFICATION_WARNING,
  getSkillFlow,
  isSkillFileValue,
  publicSkillRows,
  type SkillAnswerValue,
} from "@/lib/skill-questions";
import {
  filterOptions,
  getAllMakes,
  getModelsForMake,
  getYearsForMakeModel,
} from "@/lib/vehicle-catalog";
import { useApp } from "@/lib/store";
import type { MotoristVehicle, ProService, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PrefKey } from "@/lib/vehicle-focus";
import {
  PREF_ROWS,
  VEHICLE_TYPES,
  optionsForPref,
  syncBrandForVehicleType,
  syncLocationForCountry,
} from "@/lib/vehicle-focus";

type VehiclePickerKey = "vehicleType" | "make" | "model" | "year";

/**
 * Account signup: trade → specialty → vehicles you fix → about → contact → area → review.
 * Profession-specific questions: /artisan/onboarding.
 */
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const FLOW_STEPS: Step[] = [1, 2, 3, 4, 5, 6, 7];

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
  const { exiting, go } = useAuthNavigate();
  const searchParams = useSearchParams();
  const { completeSignup, userProfile, isAuthenticated, theme } = useApp();
  const isLight = theme === "light";
  /** Apple premium: hairline fields on single sheet (no nested gray wells) */
  const authFieldClass = appleProFieldClass(isLight);
  const authFieldIconClass = cn(appleProFieldClass(isLight), "pl-8");
  const authSelectClass = appleProSelectClass(isLight);
  const authTextareaClass = appleProTextareaClass(isLight);
  const authFieldStyle = {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: isLight ? "#1c1c1e" : "#ffffff",
    boxShadow: "none",
  } as const;
  void authFieldClassLegacy;
  void authFieldIconClassLegacy;
  void authSelectClassLegacy;
  void authTextareaClassLegacy;
  void authFieldStyleLegacy;
  const phoneCodes = useMemo(() => getPhoneCodeOptions(), []);
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /**
   * Dual-role signup: prefill from Customer, but only dim/lock fields
   * that already have values. Empty NIN/BVN stay fully editable (not dimmed).
   */
  const [dualSignup, setDualSignup] = useState(false);
  const [nameLocked, setNameLocked] = useState(false);
  const [genderLocked, setGenderLocked] = useState(false);
  const [dobLocked, setDobLocked] = useState(false);
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [emailLocked, setEmailLocked] = useState(false);
  const [ninLocked, setNinLocked] = useState(false);
  const [bvnLocked, setBvnLocked] = useState(false);
  /** After signup → artisan verification onboarding (Go Live gated until approved) */
  const nextPath =
    searchParams.get("next")?.startsWith("/")
      ? searchParams.get("next")!
      : "/artisan/onboarding";
  const fromMenu = searchParams.get("from") === "menu";
  const fromProfile = searchParams.get("from") === "profile";

  /** Exactly one skill + required specialty */
  const [skill, setSkill] = useState<ProService | null>(null);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [skillAnswers, setSkillAnswers] = useState<
    Record<string, SkillAnswerValue>
  >({});
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<SignupGender | "">("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [bio, setBio] = useState("");
  const [phoneIso, setPhoneIso] = useState(DEFAULT_PHONE_ISO);
  const [phoneDial, setPhoneDial] = useState(DEFAULT_PHONE_DIAL);
  const [phoneNational, setPhoneNational] = useState("");
  const [email, setEmail] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bvn, setBvn] = useState("");

  // Guarantor (compulsory for Repair Pro)
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [guarantorAddress, setGuarantorAddress] = useState("");
  const [guarantorOccupation, setGuarantorOccupation] = useState("");
  const [guarantorRelationship, setGuarantorRelationship] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [city, setCity] = useState("Lagos");
  const [area, setArea] = useState("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState(5);

  const fullPhone = formatInternationalPhone(phoneDial, phoneNational);

  /**
   * Prefill from existing Customer — lock only fields that already have values.
   * Empty NIN/BVN are never dimmed.
   */
  useEffect(() => {
    const dualRole = fromMenu || fromProfile;
    if (!dualRole || !isAuthenticated) {
      setDualSignup(false);
      setNameLocked(false);
      setGenderLocked(false);
      setDobLocked(false);
      setPhoneLocked(false);
      setEmailLocked(false);
      setNinLocked(false);
      setBvnLocked(false);
      return;
    }
    const vaultMot = getVaultProfile("motorist");
    const liveMot =
      userProfile?.accountType === "motorist" ? userProfile : null;
    const sessionSource =
      userProfile && userProfile.accountType !== "professional"
        ? userProfile
        : null;
    const motorist = liveMot || sessionSource || vaultMot;
    if (!motorist) {
      setDualSignup(false);
      setNameLocked(false);
      setGenderLocked(false);
      setDobLocked(false);
      setPhoneLocked(false);
      setEmailLocked(false);
      setNinLocked(false);
      setBvnLocked(false);
      return;
    }

    setDualSignup(true);

    const name = (motorist.fullName || vaultMot?.fullName || "").trim();
    const em = (motorist.email || vaultMot?.email || "").trim();
    const nin = (motorist.idNumber || vaultMot?.idNumber || "").trim();
    const bankId = (motorist.bvn || vaultMot?.bvn || "").trim();
    const phoneRaw = (motorist.phone || vaultMot?.phone || "").trim();
    const g = (motorist.gender || vaultMot?.gender || "") as SignupGender | "";
    const dob = (motorist.dateOfBirth || vaultMot?.dateOfBirth || "").slice(
      0,
      10
    );

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
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setDateOfBirth(dob);
      setDobLocked(true);
    } else {
      setDobLocked(false);
    }
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

    setCity(motorist.city || vaultMot?.city || "Lagos");
    setArea(motorist.area || vaultMot?.area || "");
    const pwd = (vaultMot?.password || motorist.password || "").trim();
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
  }, [userProfile, isAuthenticated, fromMenu, fromProfile]);

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
  /** Vehicles this pro can fix (Customer-style cascade list) */
  const [vehiclesCanFix, setVehiclesCanFix] = useState<MotoristVehicle[]>([]);
  const [draftVehicleType, setDraftVehicleType] = useState("Any");
  const [draftMake, setDraftMake] = useState("Any");
  const [draftModel, setDraftModel] = useState("Any");
  const [draftYear, setDraftYear] = useState("Any");
  const [vehiclePicker, setVehiclePicker] = useState<VehiclePickerKey | null>(
    null
  );
  const [vehiclePickerQuery, setVehiclePickerQuery] = useState("");

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
    setSpecialty(null);
    setSkillAnswers({});
    // Stay on step 1 until specialty chosen + Next
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
    // Compress images so vulcanizer/pro signup does not hit body-size limits
    void (async () => {
      try {
        const isImage = (file.type || "").startsWith("image/");
        const dataUrl = isImage
          ? await compressImageFile(file, { maxEdge: 1280, quality: 0.72 })
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result ?? ""));
              reader.onerror = () => reject(new Error("read failed"));
              reader.readAsDataURL(file);
            });
        // PDF or still-huge: store name only; server keeps signup working
        if (!isImage && dataUrl.length > 350_000) {
          setSkillAnswer(qid, {
            name: file.name,
            mime: file.type || "application/pdf",
          });
          return;
        }
        setSkillAnswer(qid, {
          name: file.name,
          dataUrl,
          mime: file.type || "application/octet-stream",
        });
      } catch {
        setSkillAnswer(qid, {
          name: file.name,
          mime: file.type || "application/octet-stream",
        });
      }
    })();
  };

  const step1Ok = skill != null; // specialty selected on step 2
  const step2Ok = Boolean(specialty?.trim());
  const isAny = (v: string) => !v || v === "Any";
  const draftVehicleReady =
    !isAny(draftMake) && !isAny(draftModel);
  /** Auto trades + AC/Electric (Vehicle focus) only — solar/generator skip */
  const needsVehicleStep = needsVehiclesSignupStep(skill, specialty);
  /** Vehicles step is optional when shown — pro can skip and add later */
  const step3Ok = true;
  const step4Ok =
    !fullNameError(fullName) &&
    !genderError(gender) &&
    !dobError(dateOfBirth) &&
    !phoneNationalError(phoneNational) &&
    businessName.trim().length >= 2 &&
    guarantorName.trim().length >= 2 &&
    guarantorPhone.replace(/\D/g, "").length >= 7 &&
    guarantorRelationship.trim().length >= 2 &&
    yearsExperience.trim().length > 0 &&
    bio.trim().length >= 2 &&
    bio.trim().length <= BIO_MAX;
  /** Dual signup: reuse existing Customer password (min 6 for server) */
  const dualPasswordOk = password.trim().length >= 6;

  const step5Ok = dualSignup
    ? !phoneNationalError(phoneNational) &&
      isValidEmail(email) &&
      !ninError(idNumber) &&
      !bvnError(bvn) &&
      dualPasswordOk
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
    if (genderError(gender)) return genderError(gender);
    if (dobError(dateOfBirth)) return dobError(dateOfBirth);
    if (phoneNationalError(phoneNational)) {
      return phoneNationalError(phoneNational);
    }
    if (businessName.trim().length < 2) return "Please enter your business or workshop name.";
    if (guarantorName.trim().length < 2) return "Enter your guarantor's full name.";
    if (guarantorPhone.replace(/\D/g, "").length < 7) return "Enter a valid guarantor phone number.";
    if (guarantorRelationship.trim().length < 2) return "Enter your relationship with the guarantor.";
    if (!yearsExperience.trim()) return "Please pick how many years you have worked.";
    if (bio.trim().length < 2) return "Please write a short bio.";
    if (bio.trim().length > BIO_MAX) return `Bio must be ${BIO_MAX} characters or less.`;
    return null;
  };

  const validateStep5 = (): string | null => {
    if (dualSignup) {
      const base =
        phoneNationalError(phoneNational) ||
        emailError(email) ||
        ninError(idNumber) ||
        bvnError(bvn);
      if (base) return base;
      if (!dualPasswordOk) {
        return "Enter the same password you use for your Customer account.";
      }
      return null;
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
    if (busy || !skill || !specialty || !step4Ok || !step5Ok || !step6Ok) return;
    const v5 = validateStep5();
    if (v5) {
      setFormError(v5);
      setStep(5);
      return;
    }
    setBusy(true);
    setFormError("");

    // Dual role: same phone/email as Customer is intentional — do not block
    if (!dualSignup) {
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

    const certUpload = skillAnswers.certificationUpload as
      | { name?: string; dataUrl?: string; mime?: string }
      | undefined;
    const hasCert =
      certUpload &&
      typeof certUpload === "object" &&
      Boolean(certUpload.name || certUpload.dataUrl);

    const profile: UserProfile = {
      accountType: "professional",
      fullName: fullName.trim(),
      name_locked: true,
      gender: gender as SignupGender,
      dateOfBirth: normalizeDobIso(dateOfBirth) || dateOfBirth.trim(),
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
      // Only under_review when a cert was uploaded; no cert → full radius (admin can still verify)
      docsStatus: hasCert ? "under_review" : "none",
      docsRatingBoostApplied: false,
      certificationFileName: hasCert
        ? String(certUpload?.name || "certificate")
        : undefined,
      certificationFileDataUrl: hasCert
        ? String(certUpload?.dataUrl || "")
        : undefined,
      averageRating: 0,
      // Vehicles only for auto trades (or AC/Electric vehicle focus)
      ...(needsVehiclesSignupStep(skill, specialty)
        ? {
            servedVehicleType:
              vehiclesCanFix[0]?.vehicleType || vehicleType || undefined,
            servedBrand:
              vehiclesCanFix[0]?.make || vehicleBrands[0] || undefined,
            servedMake:
              vehiclesCanFix[0]?.make || vehicleBrands[0] || undefined,
            servedModel:
              vehiclesCanFix[0]?.model ||
              (vehicleBrands[0] &&
              vehicleModelsByBrand[vehicleBrands[0]]?.length
                ? vehicleModelsByBrand[vehicleBrands[0]].join(", ")
                : undefined),
            vehiclesServedUpdatedAt: new Date().toISOString(),
          }
        : {}),
      servedCountry: prefCountry,
      servedLocation: prefLocation,
      skillAnswers: {
        ...skillAnswers,
        // Singular + array so discovery filters (Home/Office/…) always match
        specialty: specialty || "",
        specialties: specialty ? [specialty] : [],
        // Serialized list of vehicles this pro can fix (type/make/model/year)
        ...(needsVehiclesSignupStep(skill, specialty)
          ? {
              vehiclesCanFixJson: JSON.stringify(
                vehiclesCanFix.map((v) => ({
                  vehicleType: v.vehicleType,
                  make: v.make,
                  model: v.model,
                  year: v.year,
                }))
              ),
            }
          : {}),
      },
      guarantor: {
        fullName: guarantorName.trim(),
        phone: guarantorPhone.trim(),
        address: guarantorAddress.trim() || undefined,
        occupation: guarantorOccupation.trim() || undefined,
        relationship: guarantorRelationship.trim(),
      },
      registeredAt: new Date().toISOString(),
      refCode: searchParams.get("ref") || undefined,
    };

    // Dual-role: carry Customer bank into Repair Pro so payout bank is ready
    // and the "Add bank" panel does not ask again after signup.
    if (dualSignup) {
      try {
        const { getVaultProfile } = await import("@/lib/profiles-vault");
        const { hasCompleteBankDetails } = await import("@/lib/bank-details");
        const vaultMot = getVaultProfile("motorist");
        const liveMot =
          userProfile?.accountType === "motorist" ? userProfile : null;
        const donor =
          (liveMot && hasCompleteBankDetails(liveMot) && liveMot) ||
          (vaultMot && hasCompleteBankDetails(vaultMot) && vaultMot) ||
          (userProfile && hasCompleteBankDetails(userProfile) && userProfile) ||
          null;
        if (donor) {
          profile.bankCode = donor.bankCode;
          profile.bankName = donor.bankName;
          profile.bankAccountName = donor.bankAccountName;
          profile.bankAccountNumber = donor.bankAccountNumber;
        }
      } catch {
        /* continue without bank; identity sync may still copy server-side */
      }
    }

    const err = await completeSignup(profile);
    if (err) {
      setBusy(false);
      router.replace(
        `/signup/error?role=professional&message=${encodeURIComponent(err)}`
      );
      return;
    }
    setDone(true);
    setBusy(false);
  };

  const goBack = () => {
    if (vehiclePicker) {
      setVehiclePicker(null);
      setVehiclePickerQuery("");
      return;
    }
    if (pickerKey) {
      closePicker();
      return;
    }
    if (step === 1) {
      if (fromMenu) {
        // Dual-signup from ☰ — return to Customer home
        router.replace("/");
        return;
      }
      if (fromProfile) {
        router.push("/profile");
        return;
      }
      go("/login/role");
      return;
    }
    const idx = FLOW_STEPS.indexOf(step);
    if (idx <= 0) return;
    let prev = FLOW_STEPS[idx - 1];
    // Skip vehicle step when going back if trade doesn't need it
    if (prev === 3 && !needsVehiclesSignupStep(skill, specialty)) {
      prev = 2;
    }
    setStep(prev);
  };

  const stepTitles: Record<Step, string> = {
    1: "Choose your trade",
    2: skill
      ? `Your ${PRO_SERVICE_LABELS[skill] || "trade"} focus`
      : "Choose your focus",
    3: "Vehicles you fix",
    4: "About you",
    5: "Contact & security",
    6: "Service area",
    7: "Review & create",
  };

  const displayVal = (v: string) => (isAny(v) ? "ANY" : v.toUpperCase());
  const openVehiclePicker = (key: VehiclePickerKey) => {
    setVehiclePickerQuery("");
    setVehiclePicker(key);
  };
  const vehicleOptionsFor = (key: VehiclePickerKey): string[] => {
    if (key === "vehicleType")
      return filterOptions(
        ["Any", ...VEHICLE_TYPES.filter((t) => t !== "Any")],
        vehiclePickerQuery
      );
    if (key === "make") {
      return filterOptions(["Any", ...getAllMakes()], vehiclePickerQuery);
    }
    if (key === "model") {
      if (isAny(draftMake)) return ["Any"];
      return filterOptions(
        ["Any", ...getModelsForMake(draftMake)],
        vehiclePickerQuery
      );
    }
    if (isAny(draftMake) || isAny(draftModel)) return ["Any"];
    const years = getYearsForMakeModel(draftMake, draftModel);
    return filterOptions(["Any", ...years.map(String)], vehiclePickerQuery);
  };
  const applyVehiclePick = (key: VehiclePickerKey, value: string) => {
    if (key === "vehicleType") {
      setDraftVehicleType(value);
      setDraftMake("Any");
      setDraftModel("Any");
      setDraftYear("Any");
    } else if (key === "make") {
      setDraftMake(value);
      setDraftModel("Any");
      setDraftYear("Any");
    } else if (key === "model") {
      setDraftModel(value);
      setDraftYear("Any");
    } else {
      setDraftYear(value);
    }
    setVehiclePicker(null);
    setVehiclePickerQuery("");
  };
  const addVehicleCanFix = () => {
    if (!draftVehicleReady && isAny(draftMake)) return;
    const next: MotoristVehicle = {
      id: `pro-veh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      vehicleType: isAny(draftVehicleType) ? undefined : draftVehicleType.trim(),
      make: isAny(draftMake) ? "" : draftMake.trim(),
      model: isAny(draftModel) ? "" : draftModel.trim(),
      year: isAny(draftYear) ? undefined : draftYear.trim(),
    };
    if (!next.make && !next.model) return;
    setVehiclesCanFix((prev) => [...prev, next]);
    setDraftVehicleType("Any");
    setDraftMake("Any");
    setDraftModel("Any");
    setDraftYear("Any");
  };

  const specialtyOptions = skill
    ? tradeDef(skill)?.specialties ||
      ARTISAN_TRADE_CATALOG.find((t) => t.service === skill)?.specialties ||
      []
    : [];

  const nextFlowStep = (s: Step): Step | null => {
    const idx = FLOW_STEPS.indexOf(s);
    if (idx < 0 || idx >= FLOW_STEPS.length - 1) return null;
    let next = FLOW_STEPS[idx + 1];
    // Solar / generator / home trades: never show mechanic-style vehicle list
    if (next === 3 && !needsVehiclesSignupStep(skill, specialty)) {
      next = FLOW_STEPS[idx + 2] ?? null;
    }
    return next ?? null;
  };

  const pickerLabel = pickerKey
    ? PREF_ROWS.find((r) => r.key === pickerKey)?.label ?? ""
    : "";

  /* Full-page vehicle cascade picker (Vehicles you fix) */
  if (vehiclePicker) {
    const titleMap: Record<VehiclePickerKey, string> = {
      vehicleType: "Vehicle",
      make: "Make",
      model: "Model",
      year: "Year",
    };
    const opts = vehicleOptionsFor(vehiclePicker);
    return (
      <AuthPlate exiting={exiting}>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3">
          <div className="relative flex items-center justify-center pb-1">
            <button
              type="button"
              onClick={() => {
                setVehiclePicker(null);
                setVehiclePickerQuery("");
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
              value={vehiclePickerQuery}
              onChange={(e) => setVehiclePickerQuery(e.target.value)}
              placeholder="Search"
              className={authFieldClass}
              style={authFieldStyle}
              autoFocus
            />
          </div>
          <ul className="mt-1.5 min-h-0 flex-1 list-none space-y-1 overflow-y-auto scrollbar-hide">
            {opts.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => applyVehiclePick(vehiclePicker, opt)}
                  className="flex w-full items-center justify-between rounded-md border-0 bg-white/70 px-3 py-3 text-left text-[13px] font-semibold text-[#0f172a]"
                >
                  {opt}
                  {(vehiclePicker === "vehicleType"
                    ? draftVehicleType
                    : vehiclePicker === "make"
                      ? draftMake
                      : vehiclePicker === "model"
                        ? draftModel
                        : draftYear) === opt ? (
                    <Check className="h-4 w-4 text-[#FF6B35]" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </AuthPlate>
    );
  }

  /* Full-page skill picker (same AuthPlate background + enter/exit motion) */
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
            ? "bg-[#FF6B35]/18 text-[#9a3412] ring-1 ring-[#FF6B35]/45"
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
            className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]"
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
      <AuthPlate exiting={exiting}>
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
    <AppleProWizard
      isLight={isLight}
      className={exiting ? "om-auth-exit" : "om-auth-enter"}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[390px] flex-1 flex-col">
        <AppleProTitle
          title={stepTitles[step]}
          subtitle={
            dualSignup
              ? "Continue as Repair Pro with your Customer details"
              : "Create your Repair Pro account"
          }
          isLight={isLight}
          stepLabel={`Step ${FLOW_STEPS.indexOf(step) + 1} of ${FLOW_STEPS.length}`}
        />
        <AppleProProgress
          total={FLOW_STEPS.length}
          index={FLOW_STEPS.indexOf(step)}
          isLight={isLight}
        />

        <AppleProBody
          className={cn(
            step === 1 ? "flex flex-col overflow-hidden" : "gap-1"
          )}
        >
          {step === 1 && (
            <>
              <div className="min-h-0 w-full flex-1 overflow-y-auto scrollbar-hide">
                <ul className="flex list-none flex-col p-0">
                  {PRO_TRADE_OPTIONS.map(({ id, label, icon: Icon, hint }) => {
                    const active = skill === id;
                    return (
                      <li key={id} className="shrink-0">
                        <AppleProOptionRow
                          active={active}
                          isLight={isLight}
                          onClick={() => selectSkill(id)}
                        >
                          <Icon
                            className={cn(
                              "h-5 w-5 shrink-0",
                              active
                                ? "text-[#FF6B35]"
                                : isLight
                                  ? "text-slate-600"
                                  : "text-white/70"
                            )}
                            strokeWidth={1.85}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block text-[16px] font-semibold",
                                isLight ? "text-[#1c1c1e]" : "text-white"
                              )}
                            >
                              {label}
                            </span>
                            {hint ? (
                              <span
                                className={cn(
                                  "mt-0.5 block text-[12px] font-medium",
                                  isLight ? "text-slate-500" : "text-white/45"
                                )}
                              >
                                {hint}
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                              active
                                ? "border-[#FF6B35] bg-[#FF6B35] text-[8px] font-bold text-white"
                                : isLight
                                  ? "border-black/20 bg-transparent"
                                  : "border-white/30 bg-transparent"
                            )}
                            aria-hidden
                          >
                            {active ? "✓" : ""}
                          </span>
                        </AppleProOptionRow>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p
                className={cn(
                  "mt-2 shrink-0 text-center text-[12px] font-medium",
                  isLight ? "text-slate-500" : "text-white/45"
                )}
              >
                Choose only{" "}
                <span className="font-semibold text-[#FF6B35]">one</span> trade,
                then pick your focus
              </p>
            </>
          )}

          {/* Step 2 — specialty (hairline list) */}
          {step === 2 && skill && (
            <div className="flex min-h-0 flex-1 flex-col pt-1">
              <p
                className={cn(
                  "mb-2 text-[14px] font-medium leading-snug",
                  isLight ? "text-slate-600" : "text-white/55"
                )}
              >
                Where do you mainly work as a{" "}
                <span
                  className={cn(
                    "font-semibold",
                    isLight ? "text-[#1c1c1e]" : "text-white"
                  )}
                >
                  {PRO_SERVICE_LABELS[skill]}
                </span>
                ?
              </p>
              <ul className="flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0 pb-2 scrollbar-hide">
                {specialtyOptions.map((s) => {
                  const on = specialty === s;
                  return (
                    <li key={s} className="shrink-0">
                      <AppleProOptionRow
                        active={on}
                        isLight={isLight}
                        onClick={() => setSpecialty(s)}
                      >
                        <span
                          className={cn(
                            "text-[16px] font-semibold",
                            isLight ? "text-[#1c1c1e]" : "text-white"
                          )}
                        >
                          {s}
                        </span>
                      </AppleProOptionRow>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {false && step === 2 && skill && (
            <div>
              <ul>
                {specialtyOptions.map((s) => {
                  const on = specialty === s;
                  return (
                    <li key={s}>
                      <button type="button">
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-black",
                            on
                              ? "bg-[#FF6B35] text-white"
                              : "bg-white/80 text-[#FF6B35]"
                          )}
                        >
                          {s.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-[15px] font-bold tracking-tight",
                              on ? "text-white" : "text-[#1c1c1e]"
                            )}
                          >
                            {s}
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 block text-[11px] font-medium",
                              on ? "text-white/65" : "text-[#64748b]"
                            )}
                          >
                            Tap to select this focus area
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                            on
                              ? "bg-[#FF6B35] text-white"
                              : "border border-[#9A9EA6]/60 bg-transparent text-transparent"
                          )}
                        >
                          ✓
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!specialty ? (
                <p className="mt-2 shrink-0 text-center text-[11px] font-medium text-[#64748b]">
                  Required — pick the best match for your work
                </p>
              ) : null}
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
                    This is how customers will see you
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
                      className={cn(
                        authFieldIconClass,
                        nameLocked && authLockedFieldClass
                      )}
                      style={
                        nameLocked ? authLockedFieldStyle : authFieldStyle
                      }
                      value={fullName}
                      readOnly={nameLocked}
                      tabIndex={nameLocked ? -1 : undefined}
                      onChange={(e) => {
                        if (!nameLocked) setFullName(e.target.value);
                      }}
                      placeholder="e.g. Adaobi Okeke"
                      autoComplete="name"
                      required
                    />
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-[#475569]">
                      Gender
                      <span
                        className="ml-0.5 font-bold text-red-600"
                        aria-label="required"
                      >
                        *
                      </span>
                    </span>
                    <select
                      className={cn(
                        authSelectClass,
                        genderLocked && authLockedFieldClass
                      )}
                      style={
                        genderLocked ? authLockedFieldStyle : authFieldStyle
                      }
                      value={gender}
                      disabled={genderLocked}
                      onChange={(e) =>
                        setGender(e.target.value as SignupGender | "")
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
                  </label>
                  <Field label="Date of birth" required>
                    <input
                      type="date"
                      className={cn(
                        authFieldClass,
                        dobLocked && authLockedFieldClass
                      )}
                      style={dobLocked ? authLockedFieldStyle : authFieldStyle}
                      value={dateOfBirth}
                      readOnly={dobLocked}
                      tabIndex={dobLocked ? -1 : undefined}
                      min={dobInputMin()}
                      max={dobInputMax()}
                      onChange={(e) => {
                        if (dobLocked) return;
                        setDateOfBirth(
                          normalizeDobIso(e.target.value) || e.target.value
                        );
                        setFieldError("dob", null);
                      }}
                      onBlur={(e) =>
                        setFieldError(
                          "dob",
                          dobError(e.target.value || dateOfBirth)
                        )
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
                        authSelectClass,
                        "max-w-[42%]",
                        phoneLocked && authLockedFieldClass
                      )}
                      style={
                        phoneLocked ? authLockedFieldStyle : authFieldStyle
                      }
                      value={phoneIso}
                      aria-label="Country code"
                      disabled={phoneLocked}
                      onChange={(e) => {
                        if (phoneLocked) return;
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
                      className={cn(
                        authFieldClass,
                        "min-w-0 flex-1",
                        phoneLocked && authLockedFieldClass
                      )}
                      style={
                        phoneLocked ? authLockedFieldStyle : authFieldStyle
                      }
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
                      required
                    />
                  </div>
                  <FieldHint message={fieldErrors.phone} />
                </Field>

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
                        ? "text-[#FF6B35]"
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

              {/* Guarantor — compulsory for Repair Pro */}
              <section className="flex flex-col gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                    Guarantor
                    <span className="ml-0.5 font-bold text-red-600" aria-label="required">*</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#475569]">
                    Provide a guarantor reference (required). Must be at least name, phone, and your relationship.
                  </p>
                </div>
                <Field label="Full name" required>
                  <input className={authFieldClass} style={authFieldStyle} value={guarantorName}
                    onChange={(e) => setGuarantorName(e.target.value)} placeholder="e.g. Chidi Okafor" />
                </Field>
                <Field label="Phone" required>
                  <input className={authFieldClass} style={authFieldStyle} value={guarantorPhone}
                    onChange={(e) => setGuarantorPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                    placeholder="e.g. 8012345678" type="tel" inputMode="numeric" />
                </Field>
                <Field label="Occupation">
                  <input className={authFieldClass} style={authFieldStyle} value={guarantorOccupation}
                    onChange={(e) => setGuarantorOccupation(e.target.value)} placeholder="e.g. Business owner" />
                </Field>
                <Field label="Residential address">
                  <input className={authFieldClass} style={authFieldStyle} value={guarantorAddress}
                    onChange={(e) => setGuarantorAddress(e.target.value)} placeholder="e.g. 25 Awolowo Road, Ikeja" />
                </Field>
                <Field label="Relationship to you" required>
                  <input className={authFieldClass} style={authFieldStyle} value={guarantorRelationship}
                    onChange={(e) => setGuarantorRelationship(e.target.value)} placeholder="e.g. Uncle, Former employer, Pastor" />
                </Field>
              </section>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-1.5">
              {dualSignup ? (
                <p className="rounded-md bg-[#e8e9ed] px-2.5 py-2 text-center text-[11px] leading-snug text-[#334155]">
                  Continue from your Customer account
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
                    className={cn(
                      authSelectClass,
                      "max-w-[42%]",
                      phoneLocked && authLockedFieldClass
                    )}
                    style={
                      phoneLocked ? authLockedFieldStyle : authFieldStyle
                    }
                    value={phoneIso}
                    aria-label="Country code"
                    disabled={phoneLocked}
                    onChange={(e) => {
                      if (phoneLocked) return;
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
                    className={cn(
                      authFieldClass,
                      "min-w-0 flex-1",
                      phoneLocked && authLockedFieldClass
                    )}
                    style={
                      phoneLocked ? authLockedFieldStyle : authFieldStyle
                    }
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
                  className={cn(
                    authFieldClass,
                    emailLocked && authLockedFieldClass
                  )}
                  style={
                    emailLocked ? authLockedFieldStyle : authFieldStyle
                  }
                  value={email}
                  readOnly={emailLocked}
                  tabIndex={emailLocked ? -1 : undefined}
                  onChange={(e) => {
                    if (emailLocked) return;
                    setEmail(e.target.value);
                    setFieldError("email", null);
                  }}
                  onBlur={() => setFieldError("email", emailError(email))}
                  placeholder="pro@email.com"
                  type="email"
                  autoComplete="email"
                  required
                />
                <FieldHint message={fieldErrors.email} />
              </Field>
              <Field label="NIN">
                <input
                  className={cn(
                    authFieldClass,
                    ninLocked && authLockedFieldClass
                  )}
                  style={
                    ninLocked ? authLockedFieldStyle : authFieldStyle
                  }
                  value={idNumber}
                  readOnly={ninLocked}
                  tabIndex={ninLocked ? -1 : undefined}
                  onChange={(e) => {
                    if (ninLocked) return;
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
              <Field label="BVN">
                <input
                  className={cn(
                    authFieldClass,
                    bvnLocked && authLockedFieldClass
                  )}
                  style={
                    bvnLocked ? authLockedFieldStyle : authFieldStyle
                  }
                  value={bvn}
                  readOnly={bvnLocked}
                  tabIndex={bvnLocked ? -1 : undefined}
                  onChange={(e) => {
                    if (bvnLocked) return;
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
              {dualSignup ? (
                <Field
                  label="Same password as your Customer account"
                  required
                >
                  <PasswordField
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
                          "Enter the same password as your Customer account."
                        );
                      }
                    }}
                    placeholder="Your existing password"
                    autoComplete="current-password"
                  />
                  <p className="mt-1 text-[10px] leading-snug text-[#64748b]">
                    No new password — use the one you already signed up with.
                  </p>
                  <FieldHint message={fieldErrors.password} />
                </Field>
              ) : (
                <>
                  <Field label="Password" required>
                    <PasswordField
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
                    <PasswordRules password={password} inline />
                    <FieldHint message={fieldErrors.password} />
                  </Field>
                  <Field label="Confirm password" required>
                    <PasswordField
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
                    <FieldHint message={fieldErrors.confirm} />
                  </Field>
                </>
              )}
            </div>
          )}

          {step === 3 && needsVehicleStep && (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] font-medium leading-snug text-[#475569]">
                Add vehicle types you fix best (type, make, model, year).
                Optional — you can skip.
              </p>
              {vehiclesCanFix.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {vehiclesCanFix.map((v) => (
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
                          setVehiclesCanFix((prev) =>
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
              <div className="overflow-hidden rounded-xl bg-[#f2f3f5] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                {(
                  [
                    { key: "vehicleType" as const, label: "Vehicle", value: draftVehicleType },
                    { key: "make" as const, label: "Make", value: draftMake },
                    { key: "model" as const, label: "Model", value: draftModel },
                    { key: "year" as const, label: "Year", value: draftYear },
                  ] as const
                ).map((row, i) => (
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
                disabled={!draftVehicleReady}
                onClick={addVehicleCanFix}
                className="h-11 w-full rounded-md border-0 bg-[#FF6B35] text-[13px] font-bold text-white disabled:opacity-40"
              >
                Add vehicle
              </button>
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
              <Field label="Area">
                <input
                  className={authFieldClass}
                      style={authFieldStyle}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Yaba"
                />
              </Field>
              <Field label={`Service radius: ${serviceRadiusKm} km`}>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(Number(e.target.value))}
                  className="mt-2 w-full accent-[#FF6B35]"
                />
              </Field>
            </>
          )}

          {step === 7 && (
            <div className="space-y-0 text-[12px]">
              <Row k="Name" v={fullName} />
              <Row k="Gender" v={formatGenderLabel(gender)} />
              <Row k="Date of birth" v={dateOfBirth || "Not set"} />
              <Row k="Business" v={businessName} />
              <Row k="Trade" v={skill ? PRO_SERVICE_LABELS[skill] : "Not set"} />
              <Row k="Focus" v={specialty || "Not set"} />
              <Row k="Phone" v={fullPhone} />
              <Row k="Email" v={email} />
              <Row k="NIN" v={idNumber} />
              <Row k="BVN" v={bvn ? "••••" + bvn.slice(-4) : "Not set"} />
              <Row k="Area" v={`${area}, ${city}`} />
              <Row k="Radius" v={`${serviceRadiusKm} km`} />
              {vehiclesCanFix.length > 0 && (
                <Row
                  k="Vehicles you fix"
                  v={vehiclesCanFix
                    .map((v) =>
                      [v.vehicleType, v.make, v.model, v.year]
                        .filter(Boolean)
                        .join(" ")
                    )
                    .join(" · ")}
                />
              )}
              {yearsExperience && (
                <Row k="Experience" v={experienceLabel(yearsExperience)} />
              )}
              {bio && <Row k="Bio" v={bio} />}
              {guarantorName && (
                <Row k="Guarantor" v={`${guarantorName} · ${guarantorPhone} · ${guarantorRelationship}`} />
              )}
            </div>
          )}

          {formError && step !== 5 ? (
            <p className="mb-2 text-center text-[12px] font-medium text-red-700">
              {formError}
            </p>
          ) : null}
        </AppleProBody>

        <AppleProFooter
          isLight={isLight}
          hideBack={step === 1 && !dualSignup}
          onBack={goBack}
          nextLabel={
            step < 7
              ? "Continue"
              : busy
                ? "Please wait…"
                : "Finish and create account"
          }
          nextBusy={busy}
          nextDisabled={
            busy ||
            (step === 1 && !skill) ||
            (step === 2 && !specialty?.trim()) ||
            (step === 4 && !step4Ok) ||
            (step === 5 && !step5Ok) ||
            (step === 6 && !step6Ok)
          }
          onNext={() => {
            if (step === 7) {
              void finish();
              return;
            }
            if (step === 1) {
              if (!skill) {
                setFormError("Please select your trade.");
                return;
              }
              setFormError("");
              setStep(2);
              return;
            }
            if (step === 2) {
              if (!specialty?.trim()) {
                setFormError("Please pick your focus area.");
                return;
              }
              setFormError("");
              // Mechanic etc. → vehicles; solar/generator/home → about you
              setStep(
                needsVehiclesSignupStep(skill, specialty) ? 3 : 4
              );
              return;
            }
            if (step === 3) {
              setFormError("");
              setStep(4);
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
              (step === 4 && !step4Ok) ||
              (step === 5 && !step5Ok) ||
              (step === 6 && !step6Ok);
            if (blocked) return;
            const nxt = nextFlowStep(step);
            if (!nxt) return;
            setFormError("");
            setStep(nxt);
          }}
        />
      </div>

      <RegistrationComplete
        open={done}
        accountLabel="Repair Pro"
        onContinue={() => {
          router.replace("/dashboard");
        }}
      />
    </AppleProWizard>
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
