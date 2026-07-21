"use client";

/**
 * Post-signup artisan onboarding (multi-step).
 * Phone OTP · Gov ID + NIN upload for admin/care review · liveness · skill proof.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Phone,
  Shield,
  Upload,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FaceLiveness } from "@/components/profile/face-liveness";
import {
  ARTISAN_TRADE_CATALOG,
  COMMON_TOOLS_SUGGESTIONS,
  LAGOS_CITIES,
  NG_STATES,
  tradeDef,
} from "@/lib/artisan/catalog";
import {
  ensureArtisanDraft,
  getArtisanProfile,
  saveArtisanProfile,
} from "@/lib/artisan/local-store";
import {
  professionAnswersValid,
  professionQuestionsFor,
} from "@/lib/artisan/profession-questions";
import {
  canSubmitForReview,
  statusLabel,
  tierProgressPercent,
} from "@/lib/artisan/status";
import { sendArtisanOtp, verifyArtisanOtp } from "@/lib/artisan/verification";
import type {
  ArtisanMedia,
  ArtisanOnboardingStep,
  ArtisanVerificationProfile,
  GovIdType,
  SkillProofType,
} from "@/lib/artisan/types";
import {
  INTRO_VIDEO_MAX_SEC,
  INTRO_VIDEO_MIN_SEC,
  PORTFOLIO_MAX,
  PORTFOLIO_MIN,
} from "@/lib/artisan/types";
import { profileTheme } from "@/lib/profile-system";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const STEPS: { id: ArtisanOnboardingStep; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "profession", label: "Skill" },
  { id: "phone", label: "Phone" },
  { id: "essentials", label: "Profile" },
  { id: "portfolio", label: "Portfolio" },
  { id: "video", label: "Video" },
  { id: "optional_tiers", label: "Verify+" },
  { id: "review", label: "Submit" },
];

function uid() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

export function ArtisanOnboarding({
  mode = "full",
}: {
  /** full = post-signup; settings = optional tiers later */
  mode?: "full" | "settings";
}) {
  const router = useRouter();
  const {
    backendUserId,
    displayName,
    userProfile,
    accountType,
    theme,
  } = useApp();
  const isLight = theme === "light";
  const tokens = profileTheme(isLight);
  const sheetBg = tokens.sheetBg;
  const ink = tokens.ink;
  const muted = tokens.muted;
  const soft = tokens.soft;
  const fieldClass = cn(
    "h-10 w-full rounded-md border-0 px-3 text-[13px] font-medium outline-none",
    isLight ? "bg-[#E2E3E7] text-[#0f172a]" : "bg-[#2c2c2e] text-white"
  );
  const selectClass = cn(
    "h-10 w-full rounded-md border-0 px-2 text-[12px] font-semibold outline-none",
    isLight ? "bg-[#E2E3E7] text-[#0f172a]" : "bg-[#2c2c2e] text-white"
  );
  const panelClass = cn(
    "rounded-md p-3",
    isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
  );
  const chipOff = isLight
    ? "bg-black/10 text-slate-800"
    : "bg-[#2c2c2e] text-[#d1d1d6]";
  const uploadClass = cn(
    "flex cursor-pointer flex-col items-center justify-center rounded-md text-[12px] font-bold",
    isLight ? "bg-[#E2E3E7] text-slate-800" : "bg-[#2c2c2e] text-white"
  );
  const uploadInlineClass = cn(
    "flex cursor-pointer items-center justify-center rounded-md text-[12px] font-bold",
    isLight ? "bg-[#E2E3E7] text-slate-800" : "bg-[#2c2c2e] text-white"
  );
  const errBox = isLight
    ? "bg-red-50 text-red-700"
    : "bg-red-950/50 text-red-300";
  const msgBox = isLight
    ? "bg-emerald-50 text-emerald-800"
    : "bg-emerald-950/40 text-emerald-300";
  const warnBox = isLight
    ? "bg-[#FF6B35]/15 text-[#FF6B35]"
    : "bg-amber-950/40 text-[#FF6B35]";
  const tipBox = isLight
    ? "bg-[#fff7ed] text-[#9a3412]"
    : "bg-[#3a2010] text-[#fdba74]";
  const navBack = isLight
    ? "bg-[#d4d5d9] text-slate-900"
    : "bg-[#2c2c2e] text-white";
  const stepIdle = isLight
    ? "bg-black/10 text-slate-700"
    : "bg-[#2c2c2e] text-[#a1a1a6]";
  const stepDone = isLight
    ? "bg-emerald-600/20 text-emerald-800"
    : "bg-emerald-900/40 text-emerald-300";
  const tradeOff = isLight
    ? "bg-[#d4d5d9] text-slate-900"
    : "bg-[#1c1c1e] text-white";
  const userId =
    backendUserId ||
    (typeof window !== "undefined"
      ? localStorage.getItem("oga-mecho-user-id") || "local-pro"
      : "local-pro");

  const [step, setStep] = useState<ArtisanOnboardingStep>(
    mode === "settings" ? "optional_tiers" : "trade"
  );
  const [profile, setProfile] = useState<ArtisanVerificationProfile | null>(
    null
  );
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  /** Shown once after send so you can complete the flow without SMS */
  const [otpDemoCode, setOtpDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idBusy, setIdBusy] = useState<"gov" | "nin" | null>(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toolDraft, setToolDraft] = useState("");

  useEffect(() => {
    const p = ensureArtisanDraft({
      userId,
      fullName: userProfile?.fullName || displayName || "Artisan",
      phone: userProfile?.phone || "",
      email: userProfile?.email,
      service: userProfile?.services?.[0],
    });
    // Prefill specialty from pro signup if present
    const spec = userProfile?.skillAnswers?.specialty;
    if (typeof spec === "string" && spec.trim() && !p.trade.specialty) {
      const next = {
        ...p,
        trade: { ...p.trade, specialty: spec.trim() },
      };
      saveArtisanProfile(next);
      setProfile(next);
      return;
    }
    setProfile(p);
  }, [userId, userProfile, displayName]);

  const patch = useCallback((partial: Partial<ArtisanVerificationProfile>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial, updatedAt: new Date().toISOString() };
      // Nested merges
      if (partial.tiers) next.tiers = { ...prev.tiers, ...partial.tiers };
      if (partial.trade) next.trade = { ...prev.trade, ...partial.trade };
      if (partial.serviceArea)
        next.serviceArea = { ...prev.serviceArea, ...partial.serviceArea };
      if (partial.guarantor)
        next.guarantor = { ...prev.guarantor, ...partial.guarantor };
      saveArtisanProfile(next);
      // TODO(api): await fetch("/api/artisan/profile", { method: "PATCH", body: JSON.stringify(next) })
      return next;
    });
  }, []);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const progress = profile ? tierProgressPercent(profile.tiers) : 0;

  const addPortfolio = async (files: FileList | null) => {
    if (!files?.length || !profile) return;
    setBusy(true);
    setErr(null);
    try {
      const next = [...profile.portfolio];
      for (const f of Array.from(files)) {
        if (next.length >= PORTFOLIO_MAX) break;
        if (!f.type.startsWith("image/")) continue;
        const url = await fileToDataUrl(f);
        next.push({
          id: uid(),
          url,
          kind: "portfolio",
          name: f.name,
          mime: f.type,
          createdAt: new Date().toISOString(),
        });
      }
      patch({ portfolio: next });
    } catch {
      setErr("Could not read photo. Try a smaller image.");
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = () => {
    if (!profile?.phone?.trim()) {
      setErr("Enter your phone number first.");
      return;
    }
    const res = sendArtisanOtp(profile.phone.trim());
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setOtpSent(true);
    setOtpDemoCode(res.demoCode);
    setOtp("");
    setMsg(
      `OTP sent. Code expires in ${Math.floor(res.expiresInSec / 60)} minutes. (No SMS keys → code shown below.)`
    );
    setErr(null);
  };

  const verifyOtp = () => {
    if (!profile) return;
    const res = verifyArtisanOtp(profile.phone.trim(), otp);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    patch({
      tiers: { ...profile.tiers, tier1_phone: true },
    });
    setOtpDemoCode(null);
    setMsg("Phone verified. Tier 1 complete.");
    setErr(null);
  };

  /** Government ID: type + number + photo → queue for admin/care (no live verify) */
  const submitGovIdForReview = () => {
    if (!profile) return;
    if (!profile.govIdType) {
      setErr("Pick an ID type.");
      return;
    }
    if (!profile.govIdNumber?.trim() || profile.govIdNumber.trim().length < 5) {
      setErr("Enter the ID number.");
      return;
    }
    if (!profile.govIdFront?.url) {
      setErr("Upload a clear photo of the selected ID.");
      return;
    }
    setIdBusy("gov");
    setErr(null);
    patch({
      tiers: { ...profile.tiers, tier2_govId: false },
      govIdReviewStatus: "submitted",
      govIdSubmittedAt: new Date().toISOString(),
    });
    setMsg(
      "Government ID submitted for review. Admin / customer care will approve it."
    );
    setIdBusy(null);
  };

  /** NIN number under BVN panel → queue for admin/care (no document upload) */
  const submitNinForReview = () => {
    if (!profile) return;
    const nin = (profile.nin || "").replace(/\D/g, "");
    if (nin.length !== 11) {
      setErr("NIN must be exactly 11 digits.");
      return;
    }
    setIdBusy("nin");
    setErr(null);
    patch({
      nin,
      tiers: { ...profile.tiers, tier2_nin: false },
      ninReviewStatus: "submitted",
      ninSubmittedAt: new Date().toISOString(),
    });
    setMsg("Submitted for review. Admin / customer care will verify it.");
    setIdBusy(null);
  };

  const reviewLabel = (s?: string | null) => {
    if (s === "submitted") return "Pending review";
    if (s === "approved") return "Approved";
    if (s === "rejected") return "Rejected — re-upload";
    return "Not submitted";
  };

  const submitReview = () => {
    if (!profile) return;
    const gate = canSubmitForReview(profile);
    if (!gate.ok) {
      setErr(gate.reason);
      return;
    }
    // TODO(api): POST /api/artisan/submit → status pending_review
    const next: ArtisanVerificationProfile = {
      ...profile,
      status: "pending_review",
      submittedAt: new Date().toISOString(),
      rejectReason: null,
    };
    saveArtisanProfile(next);
    setProfile(next);
    setMsg("Submitted for admin review. You cannot Go Live until approved.");
    setErr(null);
  };

  if (!profile) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: sheetBg }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-[#FF6B35]" />
      </div>
    );
  }

  if (accountType === "professional" && profile.status === "pending_review") {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: sheetBg }}>
        <PageHeader
          title="Pending Review"
          subtitle="Verification"
          backHref="/dashboard"
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Shield className="h-10 w-10 text-[#FF6B35]" />
          <p className={cn("text-[16px] font-bold", ink)}>
            Profile under review
          </p>
          <p className={cn("max-w-xs text-[13px] font-medium", muted)}>
            Ona Care is checking your details. You cannot Go Live or receive
            jobs until an admin approves you.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-2 h-11 rounded-md border-0 bg-[#323231] px-5 text-[13px] font-bold text-white"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (profile.status === "approved" && mode === "full") {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: sheetBg }}>
        <PageHeader title="Verified" backHref="/dashboard" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Check className="h-10 w-10 text-emerald-600" />
          <p className={cn("text-[16px] font-bold", ink)}>
            You are approved
          </p>
          <p className={cn("max-w-xs text-[13px]", muted)}>
            You can Go Live and complete optional verification tiers anytime
            from Profile.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="h-11 rounded-md border-0 bg-[#323231] px-5 text-[13px] font-bold text-white"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const trade = tradeDef(profile.trade.service);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: sheetBg }}
    >
      <PageHeader
        title={mode === "settings" ? "Verification" : "Artisan setup"}
        subtitle={`${statusLabel(profile.status)} · ${progress}% tiers`}
        backHref={mode === "settings" ? "/profile" : "/dashboard"}
      />

      {/* Progress steps */}
      {mode === "full" ? (
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-hide">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={cn(
                "shrink-0 rounded-md border-0 px-2 py-1 text-[10px] font-bold",
                step === s.id
                  ? "bg-[#323231] text-white"
                  : i < stepIndex
                    ? stepDone
                    : stepIdle
              )}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {err ? (
          <p className={cn("mb-2 rounded-md px-3 py-2 text-[12px] font-semibold", errBox)}>
            {err}
          </p>
        ) : null}
        {msg ? (
          <p className={cn("mb-2 rounded-md px-3 py-2 text-[12px] font-semibold", msgBox)}>
            {msg}
          </p>
        ) : null}

        {/* —— TRADE —— */}
        {step === "trade" && (
          <section className="space-y-3">
            <h2 className={cn("text-[15px] font-bold", ink)}>
              Your primary trade
            </h2>
            <p className={cn("text-[12px]", muted)}>
              Pick one main skill, then a required specialty.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ARTISAN_TRADE_CATALOG.map((t) => {
                const on = profile.trade.service === t.service;
                return (
                  <button
                    key={t.service}
                    type="button"
                    onClick={() =>
                      patch({
                        trade: { service: t.service, specialty: null },
                        professionAnswers: {},
                      })
                    }
                    className={cn(
                      "rounded-md border-0 px-2.5 py-2.5 text-left text-[12px] font-bold",
                      on ? "bg-[#323231] text-white" : tradeOff
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        "mt-0.5 block text-[10px] font-medium",
                        on ? "text-white/70" : muted
                      )}
                    >
                      {t.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {trade?.specialties?.length ? (
              <div>
                <p className={cn("mb-1.5 text-[12px] font-bold", soft)}>
                  Specialty <span className="text-red-600">*</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {trade.specialties.map((s) => {
                    const on = profile.trade.specialty === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          patch({
                            trade: {
                              ...profile.trade,
                              specialty: s,
                            },
                          })
                        }
                        className={cn(
                          "rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                          on ? "bg-[#FF6B35] text-white" : chipOff
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* —— PROFESSION (category-specific only) —— */}
        {step === "profession" && (
          <section className="space-y-3">
            <h2 className={cn("text-[15px] font-bold", ink)}>
              {trade?.label || "Trade"} questions
            </h2>
            <p className={cn("text-[12px]", muted)}>
              Only for{" "}
              <span className="font-bold">
                {profile.trade.specialty || trade?.label}
              </span>
              . No questions from other professions.
            </p>
            {!profile.trade.specialty ? (
              <p className={cn("rounded-md px-3 py-2 text-[12px] font-semibold", warnBox)}>
                Go back and pick a specialty first.
              </p>
            ) : (
              professionQuestionsFor(profile.trade.service).map((q) => {
                const answers = profile.professionAnswers || {};
                const val = answers[q.id];
                return (
                  <div key={q.id} className={panelClass}>
                    <p className={cn("text-[12px] font-bold", ink)}>
                      {q.label}
                      {q.required ? (
                        <span className="text-red-600"> *</span>
                      ) : null}
                    </p>
                    {q.hint ? (
                      <p className={cn("mt-0.5 text-[10px] font-medium", muted)}>
                        {q.hint}
                      </p>
                    ) : null}
                    {q.type === "text" ? (
                      <input
                        value={typeof val === "string" ? val : ""}
                        onChange={(e) =>
                          patch({
                            professionAnswers: {
                              ...answers,
                              [q.id]: e.target.value,
                            },
                          })
                        }
                        placeholder={q.placeholder}
                        className={cn("mt-2", fieldClass)}
                      />
                    ) : null}
                    {q.type === "select" && q.options ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {q.options.map((opt) => {
                          const on = val === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() =>
                                patch({
                                  professionAnswers: {
                                    ...answers,
                                    [q.id]: opt,
                                  },
                                })
                              }
                              className={cn(
                                "rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                                on ? "bg-[#323231] text-white" : chipOff
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {q.type === "multiselect" && q.options ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {q.options.map((opt) => {
                          const arr = Array.isArray(val) ? val : [];
                          const on = arr.includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                let next = on
                                  ? arr.filter((x) => x !== opt)
                                  : [...arr, opt];
                                const max = q.maxSelect ?? 6;
                                if (next.length > max)
                                  next = next.slice(0, max);
                                patch({
                                  professionAnswers: {
                                    ...answers,
                                    [q.id]: next,
                                  },
                                });
                              }}
                              className={cn(
                                "rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                                on ? "bg-[#FF6B35] text-white" : chipOff
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* —— PHONE TIER 1 —— */}
        {step === "phone" && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-[#FF6B35]" />
              <h2 className={cn("text-[15px] font-bold", ink)}>
                Tier 1 · Phone verification
              </h2>
            </div>
            <div className={cn("rounded-md px-3 py-2.5 text-[11px] font-medium leading-snug", tipBox)}>
              <p className="font-bold">How this works</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>Enter your phone → Send OTP (new random 6-digit code).</li>
                <li>Code expires in 10 minutes · max 5 tries · 45s resend wait.</li>
                <li>Enter the code → Verify. Wrong codes fail until you resend.</li>
              </ol>
            </div>
            <label className={cn("block text-[11px] font-bold", soft)}>
              Phone number
              <input
                value={profile.phone}
                onChange={(e) =>
                  patch({
                    phone: e.target.value,
                    ...(profile.tiers.tier1_phone
                      ? { tiers: { ...profile.tiers, tier1_phone: false } }
                      : {}),
                  })
                }
                className={cn("mt-1", fieldClass)}
                placeholder="+234 801 234 5678"
                inputMode="tel"
              />
            </label>
            {!profile.tiers.tier1_phone ? (
              <>
                <button
                  type="button"
                  onClick={sendOtp}
                  className="h-10 w-full rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white"
                >
                  {otpSent ? "Resend OTP" : "Send OTP"}
                </button>
                {otpDemoCode ? (
                  <div
                    className={cn(
                      "rounded-md px-3 py-2 text-center",
                      isLight ? "bg-[#fff7ed]" : "bg-[#3a2010]"
                    )}
                  >
                    <p className={cn("text-[10px] font-semibold uppercase tracking-wide", muted)}>
                      Your code (shown because SMS is not configured)
                    </p>
                    <p className={cn("mt-0.5 text-[22px] font-black tracking-[0.2em]", ink)}>
                      {otpDemoCode}
                    </p>
                  </div>
                ) : null}
                {otpSent ? (
                  <div className="flex gap-2">
                    <input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={cn("min-w-0 flex-1 font-bold tracking-widest", fieldClass)}
                      placeholder="6-digit code"
                      inputMode="numeric"
                      maxLength={6}
                    />
                    <button
                      type="button"
                      onClick={verifyOtp}
                      disabled={otp.length !== 6}
                      className="h-10 shrink-0 rounded-md border-0 bg-[#FF6B35] px-4 text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      Verify
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p
                className={cn(
                  "flex items-center gap-2 text-[13px] font-bold",
                  isLight ? "text-emerald-700" : "text-emerald-400"
                )}
              >
                <Check className="h-4 w-4" /> Phone verified · Tier 1 done
              </p>
            )}
          </section>
        )}

        {/* —— ESSENTIALS —— */}
        {step === "essentials" && (
          <section className="space-y-3">
            <h2 className={cn("text-[15px] font-bold", ink)}>
              Compulsory profile details
            </h2>
            <label className={cn("block text-[11px] font-bold", soft)}>
              Years of experience (min 1)
              <input
                type="number"
                min={1}
                max={60}
                value={profile.yearsExperience}
                onChange={(e) =>
                  patch({ yearsExperience: Math.max(1, Number(e.target.value) || 1) })
                }
                className={cn("mt-1", fieldClass)}
              />
            </label>

            <div>
              <p className={cn("mb-1 text-[11px] font-bold", soft)}>
                Service area · States
              </p>
              <div className="flex flex-wrap gap-1.5">
                {NG_STATES.map((st) => {
                  const on = profile.serviceArea.states.includes(st);
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        const states = on
                          ? profile.serviceArea.states.filter((x) => x !== st)
                          : [...profile.serviceArea.states, st];
                        patch({
                          serviceArea: { ...profile.serviceArea, states },
                        });
                      }}
                      className={cn(
                        "rounded-md border-0 px-2 py-1 text-[10px] font-bold",
                        on ? "bg-[#323231] text-white" : chipOff
                      )}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className={cn("mb-1 text-[11px] font-bold", soft)}>
                Cities (Lagos examples)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LAGOS_CITIES.map((c) => {
                  const on = profile.serviceArea.cities.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        const cities = on
                          ? profile.serviceArea.cities.filter((x) => x !== c)
                          : [...profile.serviceArea.cities, c];
                        patch({
                          serviceArea: { ...profile.serviceArea, cities },
                        });
                      }}
                      className={cn(
                        "rounded-md border-0 px-2 py-1 text-[10px] font-bold",
                        on ? "bg-[#FF6B35] text-white" : chipOff
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className={cn("block text-[11px] font-bold", soft)}>
              LGAs (comma-separated)
              <input
                value={profile.serviceArea.lgas.join(", ")}
                onChange={(e) =>
                  patch({
                    serviceArea: {
                      ...profile.serviceArea,
                      lgas: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                className={cn("mt-1", fieldClass)}
                placeholder="e.g. Eti-Osa, Ikeja"
              />
            </label>

            <div>
              <p className={cn("mb-1 text-[11px] font-bold", soft)}>
                Tools owned
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {COMMON_TOOLS_SUGGESTIONS.map((t) => {
                  const on = profile.toolsOwned.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const toolsOwned = on
                          ? profile.toolsOwned.filter((x) => x !== t)
                          : [...profile.toolsOwned, t];
                        patch({ toolsOwned });
                      }}
                      className={cn(
                        "rounded-md border-0 px-2 py-1 text-[10px] font-bold",
                        on ? "bg-[#323231] text-white" : chipOff
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  value={toolDraft}
                  onChange={(e) => setToolDraft(e.target.value)}
                  className={cn("min-w-0 flex-1", fieldClass)}
                  placeholder="Add custom tool"
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = toolDraft.trim();
                    if (!t) return;
                    if (!profile.toolsOwned.includes(t)) {
                      patch({ toolsOwned: [...profile.toolsOwned, t] });
                    }
                    setToolDraft("");
                  }}
                  className="h-10 rounded-md border-0 bg-[#323231] px-3 text-[12px] font-bold text-white"
                >
                  Add
                </button>
              </div>
              {profile.toolsOwned.length ? (
                <p className={cn("mt-1 text-[11px]", muted)}>
                  Selected: {profile.toolsOwned.join(" · ")}
                </p>
              ) : null}
            </div>

            <div className={panelClass}>
              <p className={cn("mb-2 text-[12px] font-bold", ink)}>
                Guarantor
              </p>
              <label className={cn("mb-2 block text-[11px] font-bold", soft)}>
                Full name
                <input
                  value={profile.guarantor.fullName}
                  onChange={(e) =>
                    patch({
                      guarantor: {
                        ...profile.guarantor,
                        fullName: e.target.value,
                      },
                    })
                  }
                  className={cn("mt-1", fieldClass)}
                />
              </label>
              <label className={cn("block text-[11px] font-bold", soft)}>
                Phone
                <input
                  value={profile.guarantor.phone}
                  onChange={(e) =>
                    patch({
                      guarantor: {
                        ...profile.guarantor,
                        phone: e.target.value,
                      },
                    })
                  }
                  className={cn("mt-1", fieldClass)}
                  inputMode="tel"
                />
              </label>
            </div>
          </section>
        )}

        {/* —— PORTFOLIO —— */}
        {step === "portfolio" && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-[#FF6B35]" />
              <h2 className={cn("text-[15px] font-bold", ink)}>
                Portfolio (compulsory)
              </h2>
            </div>
            <p className={cn("text-[12px]", muted)}>
              Upload {PORTFOLIO_MIN}–{PORTFOLIO_MAX} clear photos of previous
              jobs. This filters out non-professionals.
            </p>
            <label
              className={cn(
                "flex h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed",
                isLight ? "border-[#9A9EA6] bg-[#E2E3E7]" : "border-white/20 bg-[#2c2c2e]"
              )}
            >
              <Upload className={cn("h-5 w-5", isLight ? "text-slate-500" : "text-[#a1a1a6]")} />
              <span className={cn("mt-1 text-[12px] font-bold", soft)}>
                Add photos ({profile.portfolio.length}/{PORTFOLIO_MAX})
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void addPortfolio(e.target.files)}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {profile.portfolio.map((m) => (
                <div key={m.id} className="relative aspect-square overflow-hidden rounded-md bg-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        portfolio: profile.portfolio.filter((x) => x.id !== m.id),
                      })
                    }
                    className="absolute right-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* —— VIDEO —— */}
        {step === "video" && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-[#FF6B35]" />
              <h2 className={cn("text-[15px] font-bold", ink)}>
                Video introduction
              </h2>
            </div>
            <div className={cn("rounded-md px-3 py-2.5 text-[12px] font-medium leading-snug", tipBox)}>
              Strongly recommended. A {INTRO_VIDEO_MIN_SEC}–{INTRO_VIDEO_MAX_SEC}
              s video of you and your tools helps admins approve you faster and
              builds customer trust. Optional for now.
            </div>
            <label className={cn("h-20", uploadClass)}>
              <span className={cn("text-[12px] font-bold", soft)}>
                {profile.introVideo
                  ? `Uploaded: ${profile.introVideo.name || "video"}`
                  : "Record or upload video"}
              </span>
              <input
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy(true);
                  try {
                    const url = await fileToDataUrl(f);
                    const media: ArtisanMedia = {
                      id: uid(),
                      url,
                      kind: "intro_video",
                      name: f.name,
                      mime: f.type,
                      createdAt: new Date().toISOString(),
                    };
                    patch({ introVideo: media });
                    setMsg("Intro video saved (local demo).");
                  } catch {
                    setErr("Could not load video.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {profile.introVideo ? (
              <button
                type="button"
                onClick={() => patch({ introVideo: null })}
                className="text-[12px] font-bold text-red-600"
              >
                Remove video
              </button>
            ) : null}
          </section>
        )}

        {/* —— OPTIONAL TIERS 2–4 —— */}
        {(step === "optional_tiers" || mode === "settings") && (
          <section className="space-y-4">
            <div className={cn("rounded-md px-3 py-2.5 text-[11px] font-medium leading-snug", tipBox)}>
              <p className="font-bold">How verification works</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>
                  <span className="font-semibold">ID &amp; NIN</span> — Upload
                  your government ID and NIN. Our team reviews them.
                </li>
                <li>
                  <span className="font-semibold">Face check</span> — Look at
                  the camera, turn left, turn right, then blink.
                </li>
                <li>
                  <span className="font-semibold">Skill proof</span> — Upload
                  your certificate. Our team reviews it.
                </li>
                <li>
                  <span className="font-semibold">Go live</span> — After admin
                  approves, you can turn on Live and take jobs.
                </li>
              </ol>
            </div>

            {/* Status strip */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["Phone", profile.tiers.tier1_phone],
                  ["Gov ID", profile.tiers.tier2_govId],
                  ["NIN", profile.tiers.tier2_nin],
                  ["Liveness", profile.tiers.tier3_liveness],
                  ["Skill", profile.tiers.tier4_skillProof],
                ] as const
              ).map(([label, ok]) => (
                <span
                  key={label}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-bold",
                    ok
                      ? isLight
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-emerald-900/50 text-emerald-300"
                      : isLight
                        ? "bg-black/10 text-slate-600"
                        : "bg-[#2c2c2e] text-[#a1a1a6]"
                  )}
                >
                  {ok ? "✓" : "·"} {label}
                </span>
              ))}
            </div>

            <div className={panelClass}>
              <p className={cn("flex items-center gap-2 text-[13px] font-bold", ink)}>
                <FileText className="h-4 w-4 shrink-0 text-[#FF6B35]" />{" "}
                Tier 2 · Government ID
              </p>
              <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                {profile.tiers.tier2_govId
                  ? "Approved by admin / care"
                  : reviewLabel(profile.govIdReviewStatus)}
              </p>
              <select
                value={profile.govIdType || ""}
                onChange={(e) =>
                  patch({
                    govIdType: (e.target.value || null) as GovIdType | null,
                    tiers: { ...profile.tiers, tier2_govId: false },
                    govIdReviewStatus: "none",
                  })
                }
                className={cn("mt-2", selectClass)}
              >
                <option value="">ID type…</option>
                <option value="nin">National ID (NIN card)</option>
                <option value="drivers_licence">Driver’s Licence</option>
                <option value="voters_card">Voter’s Card</option>
                <option value="international_passport">
                  International Passport
                </option>
              </select>
              <input
                value={profile.govIdNumber || ""}
                onChange={(e) =>
                  patch({
                    govIdNumber: e.target.value,
                    tiers: { ...profile.tiers, tier2_govId: false },
                    govIdReviewStatus: "none",
                  })
                }
                placeholder="ID number on the document"
                className={cn("mt-2", fieldClass)}
              />
              <label className={cn("mt-2 h-14", uploadInlineClass)}>
                <Upload className="h-3.5 w-3.5 shrink-0" />
                {profile.govIdFront
                  ? `Uploaded: ${profile.govIdFront.name || "ID photo"}`
                  : "Upload photo of selected ID"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBusy(true);
                    try {
                      const url = await fileToDataUrl(f);
                      patch({
                        govIdFront: {
                          id: uid(),
                          url,
                          kind: "id_front",
                          name: f.name,
                          mime: f.type,
                          createdAt: new Date().toISOString(),
                        },
                        tiers: { ...profile.tiers, tier2_govId: false },
                        govIdReviewStatus: "none",
                      });
                      setErr(null);
                    } catch {
                      setErr("Could not read ID photo.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              <button
                type="button"
                disabled={idBusy === "gov" || profile.tiers.tier2_govId}
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white disabled:opacity-60"
                onClick={submitGovIdForReview}
              >
                {idBusy === "gov" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : profile.tiers.tier2_govId ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> ID approved
                  </>
                ) : profile.govIdReviewStatus === "submitted" ? (
                  "Resubmit ID for review"
                ) : (
                  "Submit ID for review"
                )}
              </button>
            </div>

            <div className={panelClass}>
              <p className={cn("flex items-center gap-2 text-[13px] font-bold", ink)}>
                <FileText className="h-4 w-4 shrink-0 text-[#FF6B35]" /> BVN
              </p>
              <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                {profile.tiers.tier2_nin
                  ? "Approved by admin / care"
                  : reviewLabel(profile.ninReviewStatus)}
              </p>
              <input
                value={profile.nin || ""}
                onChange={(e) =>
                  patch({
                    nin: e.target.value.replace(/\D/g, "").slice(0, 11),
                    tiers: { ...profile.tiers, tier2_nin: false },
                    ninReviewStatus: "none",
                  })
                }
                placeholder="11-digit BVN"
                className={cn("mt-2", fieldClass)}
                inputMode="numeric"
                maxLength={11}
              />
              <button
                type="button"
                disabled={idBusy === "nin" || profile.tiers.tier2_nin}
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white disabled:opacity-60"
                onClick={submitNinForReview}
              >
                {idBusy === "nin" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : profile.tiers.tier2_nin ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Approved
                  </>
                ) : (
                  "Submit"
                )}
              </button>
            </div>

            <div className={panelClass}>
              <p className={cn("text-[13px] font-bold", ink)}>
                Tier 3 · Face liveness
              </p>
              <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                {profile.tiers.tier3_liveness
                  ? `Passed${profile.livenessPassedAt ? ` · ${new Date(profile.livenessPassedAt).toLocaleString()}` : ""}`
                  : "Camera required · 4 gesture steps"}
              </p>
              {showLiveness ? (
                <div className="mt-2">
                  <FaceLiveness
                    isLight={isLight}
                    onCancel={() => setShowLiveness(false)}
                    onPassed={() => {
                      patch({
                        livenessPassed: true,
                        livenessPassedAt: new Date().toISOString(),
                        tiers: { ...profile.tiers, tier3_liveness: true },
                        selfie: profile.selfie || {
                          id: uid(),
                          url: "",
                          kind: "selfie",
                          name: "liveness-pass",
                          createdAt: new Date().toISOString(),
                        },
                      });
                      setShowLiveness(false);
                      setMsg("Face liveness passed. Tier 3 complete.");
                      setErr(null);
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md border-0 bg-[#FF6B35] text-[12px] font-bold text-white"
                  onClick={() => {
                    setShowLiveness(true);
                    setErr(null);
                  }}
                >
                  <Camera className="h-4 w-4" />
                  {profile.tiers.tier3_liveness
                    ? "Run liveness again"
                    : "Start face liveness"}
                </button>
              )}
            </div>

            <div className={panelClass}>
              <p className={cn("text-[13px] font-bold", ink)}>
                Tier 4 · Proof of skill
              </p>
              <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                {profile.skillProof
                  ? `Uploaded · ${profile.skillProofStatus || "under_review"} · admin must approve`
                  : "Upload trade certificate or evidence"}
              </p>
              <select
                value={profile.skillProofType || ""}
                onChange={(e) =>
                  patch({
                    skillProofType: (e.target.value ||
                      null) as SkillProofType | null,
                  })
                }
                className={cn("mt-2", selectClass)}
              >
                <option value="">Certificate type…</option>
                <option value="trade_test">Trade Test</option>
                <option value="nabteb">NABTEB</option>
                <option value="itf">ITF</option>
                <option value="apprenticeship_letter">
                  Apprenticeship letter
                </option>
                <option value="other_evidence">Other evidence</option>
              </select>
              <label className={cn("mt-2 h-14", uploadInlineClass)}>
                {profile.skillProof
                  ? `Uploaded: ${profile.skillProof.name || "file"}`
                  : "Upload certificate"}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (!profile.skillProofType) {
                      setErr("Pick a certificate type first.");
                      return;
                    }
                    setBusy(true);
                    try {
                      const url = await fileToDataUrl(f);
                      patch({
                        skillProof: {
                          id: uid(),
                          url,
                          kind: "skill_proof",
                          name: f.name,
                          mime: f.type,
                          createdAt: new Date().toISOString(),
                        },
                        skillProofStatus: "under_review",
                        tiers: { ...profile.tiers, tier4_skillProof: true },
                      });
                      setMsg(
                        "Skill proof uploaded and marked under review for admin."
                      );
                      setErr(null);
                    } catch {
                      setErr("Could not read file.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
            </div>
          </section>
        )}

        {/* —— REVIEW —— */}
        {step === "review" && (
          <section className="space-y-3">
            <h2 className={cn("text-[15px] font-bold", ink)}>
              Review & submit
            </h2>
            <ul className={cn("space-y-1.5 text-[12px] font-medium", soft)}>
              <li>
                Trade: {trade?.label}
                {profile.trade.specialty
                  ? ` · ${profile.trade.specialty}`
                  : ""}
              </li>
              <li>
                Profession Qs:{" "}
                {professionAnswersValid(
                  profile.trade.service,
                  profile.professionAnswers || {}
                )
                  ? "Complete"
                  : "Incomplete"}
              </li>
              <li>
                Phone OTP:{" "}
                {profile.tiers.tier1_phone ? "Verified" : "Missing"}
              </li>
              <li>Experience: {profile.yearsExperience} year(s)</li>
              <li>
                Areas:{" "}
                {[
                  ...profile.serviceArea.states,
                  ...profile.serviceArea.cities,
                  ...profile.serviceArea.lgas,
                ].join(", ") || "—"}
              </li>
              <li>Tools: {profile.toolsOwned.length}</li>
              <li>
                Guarantor: {profile.guarantor.fullName || "—"} /{" "}
                {profile.guarantor.phone || "—"}
              </li>
              <li>
                Portfolio: {profile.portfolio.length} photo(s)
              </li>
              <li>
                Intro video: {profile.introVideo ? "Yes" : "No (optional)"}
              </li>
              <li>
                Optional tiers: ID{" "}
                {profile.tiers.tier2_govId ? "✓" : "—"} · NIN{" "}
                {profile.tiers.tier2_nin ? "✓" : "—"} · Liveness{" "}
                {profile.tiers.tier3_liveness ? "✓" : "—"} · Skill{" "}
                {profile.tiers.tier4_skillProof ? "✓" : "—"}
              </li>
            </ul>
            <p className={cn("text-[11px] font-medium leading-snug", muted)}>
              After submit your status becomes Pending Review. An admin must
              approve before you can Go Live or receive jobs.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={submitReview}
              className="h-11 w-full rounded-md border-0 bg-[#FF6B35] text-[14px] font-bold text-white disabled:opacity-50"
            >
              Submit for review
            </button>
          </section>
        )}
      </div>

      {/* Nav */}
      {mode === "full" ? (
        <div
          className="flex shrink-0 gap-2 border-0 px-3 pb-4 pt-2"
          style={{ backgroundColor: sheetBg }}
        >
          <button
            type="button"
            disabled={stepIndex <= 0}
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border-0 text-[13px] font-bold disabled:opacity-40",
              navBack
            )}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            disabled={stepIndex >= STEPS.length - 1}
            onClick={() =>
              setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id)
            }
            className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function useArtisanProfile(userId: string | null) {
  return useMemo(() => {
    if (!userId) return null;
    return getArtisanProfile(userId);
  }, [userId]);
}
