"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import {
  AuthPlate,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
  authSecondaryBtnClass,
} from "@/components/auth/auth-plate";
import { RegistrationComplete } from "@/components/auth/registration-complete";
import { useApp } from "@/lib/store";
import type { UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

/** Reduced-radius fields — gray focus border when selected */
const fieldClass =
  "h-11 w-full rounded-md border border-transparent bg-white px-3.5 text-[14px] font-medium text-[#0f172a] outline-none placeholder:text-[#94a3b8] shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus:border-[#8E8E93] focus:ring-0";

const fieldIconClass =
  "h-11 w-full rounded-md border border-transparent bg-white py-0 pl-10 pr-3.5 text-[14px] font-medium text-[#0f172a] outline-none placeholder:text-[#94a3b8] shadow-[0_1px_3px_rgba(15,23,42,0.06)] focus:border-[#8E8E93] focus:ring-0";

/**
 * Full Motorist signup — polished account step + reduced corner radius.
 */
export function MotoristSignup() {
  const router = useRouter();
  const { completeSignup } = useApp();
  const [step, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [bvn, setBvn] = useState("");
  const [city, setCity] = useState("Lagos");
  const [area, setArea] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");

  const step1Ok =
    fullName.trim().length >= 2 &&
    phone.trim().length >= 10 &&
    email.includes("@") &&
    password.length >= 6 &&
    (idNumber.trim().length === 0 || idNumber.trim().length >= 11) &&
    (bvn.trim().length === 0 || bvn.trim().length >= 11);
  const step2Ok = city.trim().length >= 2 && area.trim().length >= 2;

  const finish = () => {
    if (busy) return;
    setBusy(true);
    setFormError("");
    const profile: UserProfile = {
      accountType: "motorist",
      fullName: fullName.trim(),
      phone: phone.trim(),
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
    1: "Create your motorist profile to request help nearby",
    2: "So we can match you with pros in your area",
    3: "Optional — helps pros prepare for your vehicle",
  };

  return (
    <AuthPlate>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <button
            type="button"
            onClick={() =>
              step === 1
                ? router.push("/login/role")
                : setStep((s) => (s - 1) as Step)
            }
            className="inline-flex h-9 items-center gap-0.5 rounded-md border-0 bg-transparent px-1 text-[13px] font-semibold text-[#1e293b] transition-opacity active:opacity-70"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            Back
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
            Motorist · {step} of 3
          </span>
          <span className="w-14" aria-hidden />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 text-center">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-[#0f172a]">
            {titles[step]}
          </h1>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-[#475569]">
            {subtitles[step]}
          </p>
        </div>

        {/* Progress */}
        <div className="mt-4 flex gap-1.5 px-5">
          {([1, 2, 3] as Step[]).map((n) => (
            <span
              key={n}
              className={cn(
                "h-1 flex-1 rounded-sm transition-colors",
                n <= step ? "bg-[#e85a12]" : "bg-black/10"
              )}
            />
          ))}
        </div>

        {/* Body */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-2 scrollbar-hide">
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                Profile details
              </p>

              <Field label="Full name">
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    className={fieldIconClass}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ada Okafor"
                    autoComplete="name"
                  />
                </div>
              </Field>

              <Field label="Phone">
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    className={fieldIconClass}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setFormError("");
                    }}
                    placeholder="+234 800 000 0000"
                    type="tel"
                    autoComplete="tel"
                  />
                </div>
              </Field>

              <Field label="Email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    className={fieldIconClass}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFormError("");
                    }}
                    placeholder="you@email.com"
                    type="email"
                    autoComplete="email"
                  />
                </div>
              </Field>

              <Field label="Password">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    className={fieldIconClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    type="password"
                    autoComplete="new-password"
                  />
                </div>
                <PasswordStrength length={password.length} />
              </Field>

              <Field label="NIN (optional · unique)">
                <input
                  className={fieldClass}
                  value={idNumber}
                  onChange={(e) => {
                    setIdNumber(e.target.value);
                    setFormError("");
                  }}
                  placeholder="11-digit NIN"
                  inputMode="numeric"
                />
              </Field>

              <Field label="BVN (optional · unique)">
                <input
                  className={fieldClass}
                  value={bvn}
                  onChange={(e) => {
                    setBvn(e.target.value);
                    setFormError("");
                  }}
                  placeholder="11-digit BVN"
                  inputMode="numeric"
                />
              </Field>

              {formError && (
                <p
                  className="rounded-md bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700"
                  role="alert"
                >
                  {formError}
                </p>
              )}

              <p className="text-center text-[11px] text-[#64748b]">
                Phone, email, NIN, and BVN cannot match a Repair Pro or another
                Motorist account
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
                Location
              </p>
              <Field label="City">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
                  <input
                    className={fieldIconClass}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Lagos"
                  />
                </div>
              </Field>
              <Field label="Area / landmark">
                <input
                  className={fieldClass}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Ikeja GRA"
                />
              </Field>
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

        {/* Footer CTAs */}
        <div className="flex shrink-0 flex-col gap-2 px-4 pb-5 pt-3">
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !step1Ok : !step2Ok}
              className={cn(
                authPrimaryBtnClass,
                "!rounded-md flex items-center justify-center gap-1.5"
              )}
              style={authPrimaryBtnStyle}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Continue
              <ChevronRight className="h-4 w-4 opacity-90" strokeWidth={2.4} />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !step1Ok || !step2Ok}
              className={cn(authPrimaryBtnClass, "!rounded-md")}
              style={authPrimaryBtnStyle}
              onClick={finish}
            >
              {busy ? "Creating account…" : "Create Motorist account"}
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className={cn(authSecondaryBtnClass, "!rounded-md")}
              onClick={finish}
              disabled={busy || !step1Ok || !step2Ok}
            >
              Skip vehicle · Finish
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-[#475569]">
        {label}
      </span>
      {children}
    </label>
  );
}

function PasswordStrength({ length }: { length: number }) {
  const level = length === 0 ? 0 : length < 6 ? 1 : length < 10 ? 2 : 3;
  const labels = ["", "Too short", "Good", "Strong"];
  const colors = ["", "#ef4444", "#e85a12", "#16a34a"];

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="h-1 flex-1 rounded-sm transition-colors"
            style={{
              backgroundColor: n <= level ? colors[level] : "rgba(0,0,0,0.08)",
            }}
          />
        ))}
      </div>
      {level > 0 && (
        <p
          className="mt-1 text-[10px] font-semibold"
          style={{ color: colors[level] }}
        >
          {labels[level]}
        </p>
      )}
    </div>
  );
}
