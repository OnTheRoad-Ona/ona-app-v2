"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronLeft, ChevronRight, User } from "lucide-react";
import {
  AuthPlate,
  authBackBtnClass,
  authFieldClass,
  authLabelClass,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
} from "@/components/auth/auth-plate";
import { RegistrationComplete } from "@/components/auth/registration-complete";
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
  syncModelForBrand,
} from "@/lib/vehicle-focus";

/** 1 skill · 2 skill Q · 3 vehicles · 4 about · 5 contact · 6 area · 7 review */
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Selected value accent (matches reference gold check style) */
const PREF_SELECTED = "#b08d3c";

/** Actual years of service — 1–9, then 10+ */
const EXP_YEARS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"] as const;
const BIO_MAX = 160;

function experienceLabel(value: string) {
  if (value === "10+") return "10+ yrs";
  if (value === "1") return "1 yr";
  return `${value} yrs`;
}

/** About you fields — reduced radius, gray focus border */
const aboutFieldClass =
  "h-11 w-full rounded-md border border-transparent bg-white px-3.5 text-[14px] font-medium text-[#0f172a] outline-none placeholder:text-[#94a3b8] shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus:border-[#8E8E93] focus:ring-0";

const aboutFieldIconClass =
  "h-11 w-full rounded-md border border-transparent bg-white py-0 pl-10 pr-3.5 text-[14px] font-medium text-[#0f172a] outline-none placeholder:text-[#94a3b8] shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus:border-[#8E8E93] focus:ring-0";

const aboutAreaClass =
  "min-h-[100px] w-full resize-none rounded-md border border-transparent bg-white px-3.5 py-3 text-[14px] font-medium leading-relaxed text-[#0f172a] outline-none placeholder:text-[#94a3b8] shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus:border-[#8E8E93] focus:ring-0";

/**
 * Full Repair Pro registration — one skill only, skill-specific questions,
 * unique phone/email/NIN/BVN across all accounts.
 */
export function ProSignup() {
  const router = useRouter();
  const { completeSignup } = useApp();
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  /** Exactly one skill */
  const [skill, setSkill] = useState<ProService | null>(null);
  const [skillAnswers, setSkillAnswers] = useState<
    Record<string, SkillAnswerValue>
  >({});
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bvn, setBvn] = useState("");
  const [city, setCity] = useState("Lagos");
  const [area, setArea] = useState("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState(8);

  /** Service focus prefs (step after skills) — type → brand → model; country → location */
  const [vehicleType, setVehicleType] = useState("Automobile / Passenger Car");
  const [vehicleBrand, setVehicleBrand] = useState("Any");
  const [vehicleModel, setVehicleModel] = useState("Any");
  const [prefCountry, setPrefCountry] = useState("Nigeria");
  const [prefLocation, setPrefLocation] = useState("Any");
  const [pickerKey, setPickerKey] = useState<PrefKey | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const prefValue: Record<PrefKey, string> = {
    vehicleType,
    brand: vehicleBrand,
    model: vehicleModel,
    country: prefCountry,
    location: prefLocation,
  };

  const setPrefValue = (key: PrefKey, value: string) => {
    if (key === "vehicleType") {
      setVehicleType(value);
      const nextBrand = syncBrandForVehicleType(value, vehicleBrand);
      setVehicleBrand(nextBrand);
      setVehicleModel(syncModelForBrand(nextBrand, vehicleModel, value));
      return;
    }
    if (key === "brand") {
      setVehicleBrand(value);
      setVehicleModel(syncModelForBrand(value, vehicleModel, vehicleType));
      return;
    }
    if (key === "model") {
      setVehicleModel(value);
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

  const selectSkill = (id: ProService) => {
    setSkill(id);
    setSkillAnswers({});
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
  const step3Ok = true;
  const step4Ok =
    fullName.trim().length >= 2 && businessName.trim().length >= 2;
  const step5Ok =
    phone.trim().length >= 10 &&
    email.includes("@") &&
    password.length >= 6 &&
    idNumber.trim().length >= 11 &&
    bvn.trim().length >= 11;
  const step6Ok =
    city.trim().length >= 2 &&
    area.trim().length >= 2 &&
    serviceRadiusKm >= 1;

  const finish = () => {
    if (busy || !skill || !step2Ok || !step4Ok || !step5Ok || !step6Ok) return;
    setBusy(true);
    setFormError("");
    const profile: UserProfile = {
      accountType: "professional",
      fullName: fullName.trim(),
      businessName: businessName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      password,
      city: city.trim(),
      area: area.trim(),
      services: [skill],
      serviceRadiusKm,
      yearsExperience: yearsExperience.trim() || undefined,
      bio: bio.trim() || undefined,
      idNumber: idNumber.trim(),
      bvn: bvn.trim(),
      skillAnswers,
      servedVehicleType: vehicleType,
      servedBrand: vehicleBrand,
      servedMake: vehicleBrand,
      servedModel: vehicleModel,
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
    1: "Choose your skill",
    2: skill ? getSkillFlow(skill).title : "Skill details",
    3: "Service focus",
    4: "About you",
    5: "Contact & security",
    6: "Service area",
    7: "Review",
  };

  const pickerLabel = pickerKey
    ? PREF_ROWS.find((r) => r.key === pickerKey)?.label ?? ""
    : "";
  const pickerOptions = pickerKey
    ? optionsForPref(
        pickerKey,
        vehicleType,
        vehicleBrand,
        prefCountry
      ).filter((opt) =>
        opt.toLowerCase().includes(pickerQuery.trim().toLowerCase())
      )
    : [];

  /* Full-page picker (same AuthPlate background — no separate sheet) */
  if (pickerKey) {
    const isVehicleType = pickerKey === "vehicleType";
    return (
      <AuthPlate>
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3">
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
              {pickerLabel}
            </h1>
          </div>

          <div className="mt-2">
            <input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search"
              className="h-9 w-full rounded-md border-0 bg-white/70 px-3 text-[13px] font-medium text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border focus:border-[#8E8E93] focus:ring-0"
              autoFocus
            />
          </div>

          <ul className="mt-1.5 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain scrollbar-hide">
            {pickerOptions.map((opt, i) => {
              const selected = prefValue[pickerKey] === opt;
              return (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => {
                      setPrefValue(pickerKey, opt);
                      closePicker();
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-0 bg-transparent px-0.5 text-left transition-colors active:bg-black/[0.03]",
                      isVehicleType ? "py-2" : "py-3",
                      i > 0 && "border-t border-black/[0.07]"
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 font-semibold uppercase leading-snug tracking-[0.01em]",
                        isVehicleType ? "text-[11.5px]" : "text-[13px]",
                        selected ? "text-[#b08d3c]" : "text-[#1e293b]"
                      )}
                    >
                      {opt}
                    </span>
                    {selected && (
                      <Check
                        className={cn(
                          "shrink-0",
                          isVehicleType ? "h-3.5 w-3.5" : "h-4 w-4"
                        )}
                        style={{ color: PREF_SELECTED }}
                        strokeWidth={2.5}
                      />
                    )}
                  </button>
                </li>
              );
            })}
            {pickerOptions.length === 0 && (
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
    <AuthPlate>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-5">
        <button type="button" onClick={goBack} className={authBackBtnClass}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          Back
        </button>

        <h1 className="text-center text-[17px] font-bold tracking-tight text-[#1c1c1e]">
          {stepTitles[step]}
        </h1>
        <p className="mt-0.5 text-center text-[11px] text-[#1c1c1e]/65">
          Step {step} of 7
          {step === 1 ? " · one skill only" : ""}
          {step === 2 ? " · skill questions" : ""}
          {step === 3 ? " · vehicles you serve" : ""}
        </p>

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
              <div className="flex min-h-0 w-full flex-[0_0_85%] flex-col">
                <ul className="flex min-h-0 flex-1 list-none flex-col gap-2 p-0">
                  {PRO_TRADE_OPTIONS.map(({ id, label, icon: Icon, hint }) => {
                    const active = skill === id;
                    return (
                      <li key={id} className="min-h-0 flex-1">
                        <button
                          type="button"
                          onClick={() => selectSkill(id)}
                          aria-pressed={active}
                          className={cn(
                            "flex h-full w-full items-center gap-3 rounded-md border-0 px-3 text-left transition-colors",
                            !active && "bg-transparent hover:bg-white/20",
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
                Select <span className="font-semibold text-[#e85a12]">1</span> skill only
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
                      isSpecialties ? "gap-1.5 pb-3" : "gap-2 pb-3.5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-[#0f172a]">
                          {q.label}
                          {q.required ? (
                            <span className="text-[#e85a12]"> *</span>
                          ) : null}
                        </p>
                        {q.hint && (
                          <p className="mt-0.5 text-[11px] leading-snug text-[#64748b]">
                            {q.hint}
                          </p>
                        )}
                      </div>
                      {q.type === "multiselect" && q.maxSelect != null && (
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums",
                            selectedCount > 0
                              ? "bg-[#323231] text-white"
                              : "bg-black/10 text-[#475569]"
                          )}
                        >
                          {selectedCount}/{q.maxSelect}
                        </span>
                      )}
                    </div>

                    {q.type === "text" && (
                      <input
                        className={aboutFieldClass}
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
                                "rounded-md border-0 px-3 py-2.5 text-[12px] font-semibold transition-colors",
                                on
                                  ? "bg-[#323231] text-white shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
                                  : "bg-white text-[#0f172a] shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
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
                            ? // Equal boxes, no inner scroll — fit on page
                              "grid-cols-3 gap-1.5"
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
                                "rounded-md border-0 font-semibold transition-colors",
                                isSpecialties
                                  ? "flex h-11 items-center justify-center px-1.5 text-center text-[11px] leading-tight"
                                  : "px-2.5 py-2.5 text-left text-[12px] leading-snug",
                                on
                                  ? "bg-[#323231] text-white shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
                                  : atMax
                                    ? "bg-white/35 text-[#94a3b8]"
                                    : "bg-white text-[#0f172a] shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
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
                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#8E8E93] bg-white/70 px-3 py-5 text-center transition-colors active:bg-white">
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
                Tell us which vehicles you typically serve
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
                    Identity
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#475569]">
                    How motorists will see you
                  </p>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#475569]">
                    Full name
                  </span>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                    <input
                      className={aboutFieldIconClass}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Adaobi Okeke"
                      autoComplete="name"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-[#475569]">
                    Business / workshop
                  </span>
                  <div className="relative">
                    <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                    <input
                      className={aboutFieldIconClass}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Okafor Auto Care"
                    />
                  </div>
                </label>
              </section>

              <section className="flex flex-col gap-2.5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                    Years of service
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#475569]">
                    Optional · choose your actual years
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
                        onClick={() =>
                          setYearsExperience(on ? "" : year)
                        }
                        aria-pressed={on}
                        aria-label={experienceLabel(year)}
                        className={cn(
                          "flex h-11 items-center justify-center rounded-md border-0 px-0.5 text-center font-semibold transition-all",
                          isTenPlus ? "text-[11px] leading-tight" : "text-[14px]",
                          on
                            ? "bg-[#323231] text-white shadow-[0_2px_8px_rgba(0,0,0,0.16)]"
                            : "bg-white text-[#0f172a] shadow-[0_1px_3px_rgba(15,23,42,0.06)] active:bg-white/90"
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
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#475569]">
                      Optional · what you do best
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
                  className={aboutAreaClass}
                  value={bio}
                  maxLength={BIO_MAX}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Fast diagnostics, honest pricing, 24/7 call-out…"
                  rows={3}
                />
              </section>
            </div>
          )}

          {step === 5 && (
            <>
              <p className="text-center text-[12px] text-[#475569]">
                Phone, NIN, and BVN must be unique — cannot match another Motorist or Repair Pro account.
              </p>
              {formError && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700" role="alert">
                  {formError}
                </p>
              )}
              <Field label="Phone">
                <input
                  className={authFieldClass}
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setFormError(""); }}
                  placeholder="+234 800 000 0000"
                  type="tel"
                />
              </Field>
              <Field label="Email">
                <input
                  className={authFieldClass}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFormError(""); }}
                  placeholder="pro@email.com"
                  type="email"
                />
              </Field>
              <Field label="Password (min 6)">
                <input
                  className={authFieldClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                />
              </Field>
              <Field label="National ID / NIN (11 digits)">
                <input
                  className={authFieldClass}
                  value={idNumber}
                  onChange={(e) => { setIdNumber(e.target.value); setFormError(""); }}
                  placeholder="NIN"
                  inputMode="numeric"
                />
              </Field>
              <Field label="BVN (11 digits)">
                <input
                  className={authFieldClass}
                  value={bvn}
                  onChange={(e) => { setBvn(e.target.value); setFormError(""); }}
                  placeholder="BVN"
                  inputMode="numeric"
                />
              </Field>
            </>
          )}

          {step === 6 && (
            <>
              <Field label="City">
                <input
                  className={authFieldClass}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Lagos"
                />
              </Field>
              <Field label="Base area">
                <input
                  className={authFieldClass}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Yaba"
                />
              </Field>
              <Field label={`Service radius: ${serviceRadiusKm} km`}>
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
              <Row k="Skill" v={skill ? PRO_SERVICE_LABELS[skill] : "—"} />
              {skill &&
                publicSkillRows(skill, skillAnswers).map((r) => (
                  <Row key={r.label} k={r.label} v={r.value} />
                ))}
              <Row k="Vehicle type" v={vehicleType} />
              <Row k="Brand" v={vehicleBrand} />
              <Row k="Model" v={vehicleModel} />
              <Row k="Country" v={prefCountry} />
              <Row k="State / Region" v={prefLocation} />
              <Row k="Phone" v={phone} />
              <Row k="Email" v={email} />
              <Row k="NIN" v={idNumber} />
              <Row k="BVN" v={bvn ? "••••" + bvn.slice(-4) : "—"} />
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
              className={cn(authPrimaryBtnClass, "!rounded-md")}
              style={authPrimaryBtnStyle}
              disabled={
                (step === 1 && !step1Ok) ||
                (step === 2 && !step2Ok) ||
                (step === 3 && !step3Ok) ||
                (step === 4 && !step4Ok) ||
                (step === 5 && !step5Ok) ||
                (step === 6 && !step6Ok)
              }
              onClick={() => {
                setFormError("");
                setStep((s) => (s + 1) as Step);
              }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className={cn(authPrimaryBtnClass, "!rounded-md")}
              style={authPrimaryBtnStyle}
              disabled={busy}
              onClick={finish}
            >
              {busy ? "Registering…" : "Complete registration"}
            </button>
          )}
        </div>

      </div>

      <RegistrationComplete
        open={done}
        accountLabel="Repair Professional"
        onContinue={() => router.replace("/dashboard")}
      />
    </AuthPlate>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={authLabelClass}>{label}</span>
      {children}
    </label>
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
