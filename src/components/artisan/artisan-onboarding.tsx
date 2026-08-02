"use client";

/**
 * Post-signup artisan onboarding (multi-step).
 * Phone OTP · Gov ID + NIN upload for admin/care review · liveness · skill proof.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { FaceLiveness } from "@/components/profile/face-liveness";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ARTISAN_TRADE_CATALOG, tradeDef } from "@/lib/artisan/catalog";
import {
  ensureArtisanDraft,
  getArtisanProfile,
  saveArtisanProfile,
} from "@/lib/artisan/local-store";
import {
  OTHER_OPTION,
  otherAnswerKey,
  professionAnswersValid,
  professionQuestionsFor,
} from "@/lib/artisan/profession-questions";
import {
  canSubmitForReview,
  statusLabel,
  tierProgressPercent,
} from "@/lib/artisan/status";
import {
  canAccessBvn,
  canAccessLiveness,
  canAccessSkillProof,
  isBvnComplete,
  isGovIdComplete,
  isLivenessComplete,
  isSkillComplete,
  lockMessageForSection,
} from "@/lib/artisan/verification-order";
import { sendArtisanOtp, verifyArtisanOtp } from "@/lib/artisan/verification";
import type {
  ArtisanMedia,
  ArtisanOnboardingStep,
  ArtisanVerificationProfile,
  GovIdType,
  SkillProofType,
} from "@/lib/artisan/types";
import {
  IMAGE_MAX_BYTES,
  INTRO_VIDEO_MAX_BYTES,
  INTRO_VIDEO_MAX_SEC,
  INTRO_VIDEO_MIN_SEC,
  PORTFOLIO_MAX,
  PORTFOLIO_MIN,
} from "@/lib/artisan/types";
import {
  ARTISAN_STEP_KEY,
  countryName,
  resolveSignupCountryIso,
  supportsLga,
} from "@/lib/geo/service-area";
import { profileTheme } from "@/lib/profile-system";
import {
  customerHasT1,
  customerHasT2,
  isProSwitchMandatoryOnboardingDone,
} from "@/lib/pro-switch-onboarding";
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

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read video duration in seconds (rejects if unreadable) */
function getVideoDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(d) || d <= 0) reject(new Error("duration"));
      else resolve(d);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("meta"));
    };
    v.src = url;
  });
}

function ReqStar() {
  return <span className="text-red-600"> *</span>;
}

export function ArtisanOnboarding({
  mode = "full",
  embedInSheet = false,
  skipT1IfCustomerDone = false,
  skipT2IfCustomerDone = false,
  onMandatoryComplete,
}: {
  /** full = post-signup; settings = optional tiers later */
  mode?: "full" | "settings";
  /** Nested in ProOnboardingSheet (60% panel) — compact chrome */
  embedInSheet?: boolean;
  /** Customer already passed T1 — hide phone OTP step */
  skipT1IfCustomerDone?: boolean;
  /** Customer already passed T2 — hide gov ID re-verify */
  skipT2IfCustomerDone?: boolean;
  /** Called when mandatory T1+T2 (inherited or done) are satisfied */
  onMandatoryComplete?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    backendUserId,
    displayName,
    userProfile,
    accountType,
    theme,
    updateUserProfile,
  } = useApp();
  const isLight = theme === "light";
  const tokens = profileTheme(isLight);
  const sheetBg = tokens.sheetBg;
  const ink = tokens.ink;
  const muted = tokens.muted;
  const soft = tokens.soft;
  // Apple premium: single sheet, hairline fields only (no nested fills)
  const fieldClass = cn(
    "h-11 w-full border-0 border-b bg-transparent px-0 text-[16px] font-medium outline-none",
    isLight
      ? "border-black/15 text-[#1c1c1e] placeholder:text-slate-400"
      : "border-white/20 text-white placeholder:text-white/35"
  );
  const selectClass = cn(
    "h-11 w-full border-0 border-b bg-transparent px-0 text-[16px] font-semibold outline-none",
    isLight ? "border-black/15 text-[#1c1c1e]" : "border-white/20 text-white"
  );
  const panelClass = "rounded-none border-0 bg-transparent p-0";
  const chipOff = isLight
    ? "bg-transparent text-slate-800 border border-black/10"
    : "bg-transparent text-[#d1d1d6] border border-white/15";
  const uploadClass = cn(
    "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-[13px] font-semibold",
    isLight
      ? "border-black/20 bg-transparent text-slate-800"
      : "border-white/25 bg-transparent text-white"
  );
  const uploadInlineClass = cn(
    "flex cursor-pointer items-center justify-center rounded-xl border border-dashed text-[13px] font-semibold",
    isLight
      ? "border-black/20 bg-transparent text-slate-800"
      : "border-white/25 bg-transparent text-white"
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
    ? "bg-transparent text-slate-600"
    : "bg-transparent text-white/60";
  const tradeOff = isLight
    ? "bg-transparent text-slate-900 border-b border-black/10"
    : "bg-transparent text-white border-b border-white/10";
  /** Selected chips — brand orange for all Yes/No and option picks */
  const chipOn = "bg-[#FF6B35] text-white";
  const userId =
    backendUserId ||
    (typeof window !== "undefined"
      ? localStorage.getItem("ona-user-id") || "local-pro"
      : "local-pro");

  const [step, setStep] = useState<ArtisanOnboardingStep>(
    mode === "settings" ? "optional_tiers" : "trade"
  );
  const [profile, setProfile] = useState<ArtisanVerificationProfile | null>(
    null
  );
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [busy, setBusy] = useState(false);
  const [idBusy, setIdBusy] = useState<"gov" | "nin" | null>(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toolDraft, setToolDraft] = useState("");
  /** Soft popup when pro tries to change locked primary trade */
  const [tradeLockOpen, setTradeLockOpen] = useState(false);
  /** Soft grey square popup for verification step locks */
  const [gatePopup, setGatePopup] = useState<string | null>(null);
  const skillSectionRef = useRef<HTMLDivElement>(null);

  /** Signup primary trade — locked for life of this onboarding/profile */
  const lockedPrimaryTrade = useMemo(() => {
    const fromProfile = userProfile?.services?.[0];
    if (fromProfile && ARTISAN_TRADE_CATALOG.some((t) => t.service === fromProfile)) {
      return fromProfile;
    }
    return null;
  }, [userProfile?.services]);

  // Hydrate draft + reconcile with server (care reset must unlock re-verify)
  useEffect(() => {
    let cancelled = false;
    const iso = resolveSignupCountryIso(userProfile?.identityCountryIso);
    const primary =
      lockedPrimaryTrade ||
      userProfile?.services?.[0] ||
      undefined;
    let next = ensureArtisanDraft({
      userId,
      fullName: userProfile?.fullName || displayName || "Artisan",
      phone: userProfile?.phone || "",
      email: userProfile?.email,
      service: primary,
      countryCode: iso,
      countryName: countryName(iso),
    });

    // Always re-read latest (state/city/LGA pickers write to the same store)
    const fresh = getArtisanProfile(userId);
    if (fresh) next = fresh;

    let dirty = false;
    // Unify with server/app identity phone flag (same as Customer Tier 1)
    if (userProfile?.phoneVerified && !next.tiers.tier1_phone) {
      next = {
        ...next,
        tiers: { ...next.tiers, tier1_phone: true },
      };
      dirty = true;
    }
    // Force primary trade from signup when known (lock)
    if (primary && next.trade.service !== primary) {
      next = {
        ...next,
        trade: { service: primary, specialty: next.trade.specialty },
      };
      dirty = true;
    }
    const spec = userProfile?.skillAnswers?.specialty;
    if (typeof spec === "string" && spec.trim() && !next.trade.specialty) {
      next = {
        ...next,
        trade: { ...next.trade, specialty: spec.trim() },
      };
      dirty = true;
    }
    if (
      next.serviceArea.countryCode !== iso ||
      !next.serviceArea.countryName
    ) {
      next = {
        ...next,
        serviceArea: {
          ...next.serviceArea,
          countryCode: iso,
          countryName: countryName(iso),
        },
      };
      dirty = true;
    }
    if (dirty) saveArtisanProfile(next);
    setProfile(next);

    // Server is truth for care reset / approval — unlock local "pending_review" wall
    const syncFromServer = async () => {
      try {
        const res = await fetch(
          `/api/artisan/profile?userId=${encodeURIComponent(userId)}`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          data?: {
            pro?: {
              status?: string;
              pipeline_status?: string | null;
              pipeline_notes?: string | null;
              rejection_reason?: string | null;
              gov_id_review_status?: string | null;
              docs_status?: string | null;
              visibility_tier?: number | null;
              verified?: boolean | null;
              nin_verified?: boolean | null;
              face_liveness_verified?: boolean | null;
              tier2_approved_at?: string | null;
              tier3_approved_at?: string | null;
              tier4_approved_at?: string | null;
              go_live_window_ends_at?: string | null;
            } | null;
          };
        } | null;
        if (cancelled || !json?.ok || !json.data?.pro) return;
        const pro = json.data.pro;
        const local = getArtisanProfile(userId) || next;
        let merged = { ...local };
        let changed = false;

        const gov = String(pro.gov_id_review_status || "none");
        const docs = String(pro.docs_status || "none");
        const pipe = String(pro.pipeline_status || "");
        const careReset =
          pipe === "needs_resubmit" ||
          /re-?\s*submit/i.test(String(pro.rejection_reason || "")) ||
          /re-?\s*submit/i.test(String(pro.pipeline_notes || ""));
        const t2Approved =
          gov === "approved" ||
          Boolean(pro.verified) ||
          Boolean(pro.nin_verified);
        const vis = Number(pro.visibility_tier) || 1;
        const proStatus = String(pro.status || "");

        // Immediately apply care approval → ID approved + T2 privileges + %
        if (t2Approved) {
          const nextTiers = {
            ...merged.tiers,
            tier2_govId: true,
            tier2_nin:
              Boolean(pro.nin_verified) ||
              gov === "approved" ||
              merged.tiers.tier2_nin,
            tier3_liveness: Boolean(pro.face_liveness_verified),
            tier4_skillProof:
              docs === "approved" || merged.tiers.tier4_skillProof,
          };
          const fullyApproved =
            proStatus === "approved" || (t2Approved && vis >= 2);
          if (
            merged.govIdReviewStatus !== "approved" ||
            !merged.tiers.tier2_govId ||
            (fullyApproved && merged.status !== "approved") ||
            merged.visibilityTier !== vis
          ) {
            merged = {
              ...merged,
              status: fullyApproved ? "approved" : merged.status,
              rejectReason: fullyApproved ? null : merged.rejectReason,
              govIdReviewStatus: "approved",
              ninReviewStatus:
                Boolean(pro.nin_verified) || gov === "approved"
                  ? "approved"
                  : merged.ninReviewStatus,
              tiers: nextTiers,
              visibilityTier: vis as 1 | 2 | 3 | 4,
              tier2ApprovedAt:
                pro.tier2_approved_at ||
                merged.tier2ApprovedAt ||
                new Date().toISOString(),
              tier3ApprovedAt:
                pro.tier3_approved_at || merged.tier3ApprovedAt,
              tier4ApprovedAt:
                pro.tier4_approved_at || merged.tier4ApprovedAt,
              goLiveWindowEndsAt:
                pro.go_live_window_ends_at || merged.goLiveWindowEndsAt,
              isNewArtisan: vis <= 2,
            };
            changed = true;
          }
        } else if (careReset || gov === "rejected") {
          // Care reset / reject: unlock form so pro can re-verify
          if (
            merged.status === "pending_review" ||
            merged.status === "approved" ||
            merged.govIdReviewStatus === "submitted" ||
            merged.govIdReviewStatus === "approved" ||
            merged.tiers.tier2_govId
          ) {
            merged = {
              ...merged,
              status: "rejected",
              rejectReason:
                pro.rejection_reason ||
                pro.pipeline_notes ||
                "Care asked you to re-submit verification.",
              govIdReviewStatus: gov === "rejected" ? "rejected" : "none",
              ninReviewStatus: "none",
              tiers: {
                ...merged.tiers,
                tier2_govId: false,
                tier2_nin: false,
                tier3_liveness: Boolean(pro.face_liveness_verified),
                tier4_skillProof: docs === "approved",
              },
              visibilityTier: (vis >= 1 && vis <= 4 ? vis : 1) as 1 | 2 | 3 | 4,
            };
            changed = true;
          }
        } else if (gov === "submitted") {
          if (merged.govIdReviewStatus !== "submitted") {
            merged = {
              ...merged,
              govIdReviewStatus: "submitted",
              status:
                merged.status === "draft" ? "pending_review" : merged.status,
            };
            changed = true;
          }
        } else if (gov === "none" && merged.govIdReviewStatus === "submitted") {
          // Server cleared submitted (rare) — unlock
          merged = {
            ...merged,
            govIdReviewStatus: "none",
            status: merged.status === "pending_review" ? "draft" : merged.status,
          };
          changed = true;
        }

        // Sync visibility ladder from server when not already handled
        if (vis !== merged.visibilityTier) {
          merged = {
            ...merged,
            visibilityTier: vis as 1 | 2 | 3 | 4,
            tier2ApprovedAt: pro.tier2_approved_at || merged.tier2ApprovedAt,
            tier3ApprovedAt: pro.tier3_approved_at || merged.tier3ApprovedAt,
            tier4ApprovedAt: pro.tier4_approved_at || merged.tier4ApprovedAt,
            goLiveWindowEndsAt:
              pro.go_live_window_ends_at || merged.goLiveWindowEndsAt,
            isNewArtisan: vis <= 2,
          };
          changed = true;
        }

        if (docs === "under_review" && merged.skillProofStatus !== "under_review") {
          merged = {
            ...merged,
            skillProofStatus: "under_review",
            tiers: { ...merged.tiers, tier4_skillProof: true },
          };
          changed = true;
        }
        if (docs === "approved" && !merged.tiers.tier4_skillProof) {
          merged = {
            ...merged,
            skillProofStatus: "approved",
            tiers: { ...merged.tiers, tier4_skillProof: true },
          };
          changed = true;
        }

        if (changed) {
          saveArtisanProfile(merged);
          if (!cancelled) {
            setProfile(merged);
            if (t2Approved && (gov === "approved" || Boolean(pro.verified))) {
              setMsg(
                "Government ID approved. Tier 2 privileges unlocked."
              );
              setErr(null);
            } else if (careReset || gov === "rejected") {
              setMsg(
                pro.rejection_reason ||
                  pro.pipeline_notes ||
                  "Care reset your verification. Re-submit ID / skill docs below."
              );
            }
          }
        }
      } catch {
        /* offline — keep local draft */
      }
    };

    void syncFromServer();
    // Poll while page open so approval flips without leaving the screen
    const pollId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void syncFromServer();
    }, 4000);

    if (mode === "full") {
      try {
        const saved = sessionStorage.getItem(ARTISAN_STEP_KEY);
        if (saved && STEPS.some((s) => s.id === saved)) {
          setStep(saved as ArtisanOnboardingStep);
          sessionStorage.removeItem(ARTISAN_STEP_KEY);
        }
      } catch {
        /* */
      }
    }
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
    // Only re-run when identity/user changes — not every profile field tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, lockedPrimaryTrade, mode]);

  // Back from state/city/LGA routes — re-read vault + restore Profile step
  useEffect(() => {
    if (pathname !== "/artisan/onboarding") return;
    const fresh = getArtisanProfile(userId);
    if (fresh) setProfile(fresh);
    try {
      const saved = sessionStorage.getItem(ARTISAN_STEP_KEY);
      if (saved && STEPS.some((s) => s.id === saved)) {
        setStep(saved as ArtisanOnboardingStep);
        sessionStorage.removeItem(ARTISAN_STEP_KEY);
      }
    } catch {
      /* */
    }
  }, [pathname, userId]);

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
        if (f.size > IMAGE_MAX_BYTES) {
          setErr(
            `Each image must be ${formatMb(IMAGE_MAX_BYTES)} or less. “${f.name}” is ${formatMb(f.size)}.`
          );
          continue;
        }
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
      if (next.length >= PORTFOLIO_MIN) setMsg(null);
    } catch {
      setErr("Could not read photo. Try a smaller image.");
    } finally {
      setBusy(false);
    }
  };

  /** Block Next until step requirements are met */
  const stepGateError = (): string | null => {
    if (!profile) return "Loading…";
    if (step === "trade") {
      if (!profile.trade.service) return "Select your primary trade";
      if (!profile.trade.specialty?.trim()) return "Select a specialty";
      return null;
    }
    if (step === "profession") {
      if (
        !professionAnswersValid(
          profile.trade.service,
          profile.professionAnswers || {}
        )
      ) {
        return "Answer all required questions (include text if you pick Other)";
      }
      return null;
    }
    if (step === "phone") {
      if (!profile.tiers.tier1_phone) return "Verify your phone to continue";
      return null;
    }
    if (step === "essentials") {
      if (!profile.yearsExperience || profile.yearsExperience < 1) {
        return "Enter years of experience";
      }
      if (!profile.serviceArea.states?.length) return "Pick your service state";
      if (!profile.serviceArea.cities?.length) {
        return "Pick at least one city";
      }
      if (!profile.toolsOwned?.length) return "Add at least one tool";
      if (!profile.guarantor.fullName?.trim() || !profile.guarantor.phone?.trim()) {
        return "Guarantor name and phone are required";
      }
      return null;
    }
    if (step === "portfolio") {
      if (profile.portfolio.length < PORTFOLIO_MIN) {
        return `Upload at least ${PORTFOLIO_MIN} photos`;
      }
      return null;
    }
    return null;
  };

  const goNext = () => {
    const gate = stepGateError();
    if (gate) {
      setErr(gate);
      return;
    }
    setErr(null);
    setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].id);
  };

  const sendOtp = async () => {
    if (!profile?.phone?.trim()) {
      setErr("Enter your phone number first.");
      return;
    }
    const phone = profile.phone.trim();
    // Server OTP (login path) so 336699 + phone_verified land on profiles
    try {
      const r = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "phone", target: phone }),
      });
      const json = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (json?.ok) {
        // Keep local demo session in sync for offline/demo
        sendArtisanOtp(phone);
        setOtpSent(true);
        setOtp("");
        setMsg("OTP sent. Enter the code (demo 336699 when enabled).");
        setErr(null);
        return;
      }
      // Fall through to local if server rejects unregistered mid-signup
      if (json?.error?.message) {
        /* try local */
      }
    } catch {
      /* offline → local */
    }
    const res = sendArtisanOtp(phone);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setOtpSent(true);
    setOtp("");
    setMsg(
      `OTP sent. Code expires in ${Math.floor(res.expiresInSec / 60)} minutes.`
    );
    setErr(null);
  };

  const verifyOtp = async () => {
    if (!profile) return;
    const phone = profile.phone.trim();
    // Prefer server profile-verify so phone_verified is unified with Customer
    try {
      const r = await fetch("/api/auth/otp/profile-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "phone",
          target: phone,
          code: otp,
        }),
      });
      const json = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (json?.ok) {
        verifyArtisanOtp(phone, otp); // clear local session if any
        patch({
          tiers: { ...profile.tiers, tier1_phone: true },
        });
        updateUserProfile({ phoneVerified: true });
        setMsg("Phone verified. Tier 1 complete. Next: add your bank account.");
        setErr(null);
        return;
      }
      // If server says wrong code, still try local demo path
      const local = verifyArtisanOtp(phone, otp);
      if (!local.ok) {
        setErr(json?.error?.message || local.error);
        return;
      }
    } catch {
      const res = verifyArtisanOtp(phone, otp);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
    }
    patch({
      tiers: { ...profile.tiers, tier1_phone: true },
    });
    updateUserProfile({ phoneVerified: true });
    setMsg("Phone verified. Tier 1 complete. Next: add your bank account.");
    setErr(null);
  };

  const getAccessToken = async (): Promise<string | null> => {
    try {
      const { getAppSupabase } = await import("@/lib/supabase/app-client");
      const sb = getAppSupabase();
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  };

  const postProVerify = async (
    body: Record<string, unknown>
  ): Promise<string | null> => {
    const token = await getAccessToken();
    if (!token) return "Sign in again to submit for review.";
    try {
      const res = await fetch("/api/verify/pro-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, ...body }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (!json?.ok) {
        return json?.error?.message || "Could not submit to server.";
      }
      return null;
    } catch {
      return "Network error submitting for review.";
    }
  };

  /** NIN / passport = front only; driver’s licence / voter’s card = front + back */
  const govIdNeedsBack = (type: GovIdType | null | undefined) =>
    type === "drivers_licence" || type === "voters_card";

  /** Government ID: type + number + photo → server queue for admin/care */
  const submitGovIdForReview = async () => {
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
      setErr(
        govIdNeedsBack(profile.govIdType)
          ? "Upload a clear photo of the front of the ID."
          : "Upload a clear photo of the selected ID."
      );
      return;
    }
    if (govIdNeedsBack(profile.govIdType) && !profile.govIdBack?.url) {
      setErr("Upload a clear photo of the back of the ID.");
      return;
    }
    setIdBusy("gov");
    setErr(null);
    const apiErr = await postProVerify({
      kind: "gov_id",
      govIdKind: profile.govIdType,
      govIdNumber: profile.govIdNumber.trim(),
      govIdFrontUrl: profile.govIdFront.url,
      govIdBackUrl: govIdNeedsBack(profile.govIdType)
        ? profile.govIdBack?.url
        : undefined,
      primaryService: profile.trade?.service,
      businessName: profile.fullName,
    });
    if (apiErr) {
      setErr(apiErr);
      setIdBusy(null);
      return;
    }
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

  /** NIN/BVN number → server queue for admin/care */
  const submitNinForReview = async () => {
    if (!profile) return;
    const nin = (profile.nin || "").replace(/\D/g, "");
    if (nin.length !== 11) {
      setErr("BVN must be exactly 11 digits.");
      return;
    }
    setIdBusy("nin");
    setErr(null);
    const apiErr = await postProVerify({ kind: "nin", nin });
    if (apiErr) {
      setErr(apiErr);
      setIdBusy(null);
      return;
    }
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
    if (s === "rejected") return "Rejected · re-upload";
    return "Not submitted";
  };

  const submitReview = async () => {
    if (!profile) return;
    const gate = canSubmitForReview(profile);
    if (!gate.ok) {
      setErr(gate.reason);
      return;
    }
    setBusy(true);
    setErr(null);
    const apiErr = await postProVerify({
      kind: "profile_submit",
      primaryService: profile.trade?.service,
      businessName: profile.fullName,
    });
    if (apiErr) {
      setErr(apiErr);
      setBusy(false);
      return;
    }
    const next: ArtisanVerificationProfile = {
      ...profile,
      status: "pending_review",
      submittedAt: new Date().toISOString(),
      rejectReason: null,
    };
    saveArtisanProfile(next);
    setProfile(next);
    setMsg("Submitted for admin review. You cannot Go Live until approved.");
    setBusy(false);
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

  // Soft wait state only — never hard-lock the whole page after care reset.
  // When ID is submitted and waiting, show banner + still allow reading tiers.
  const waitingCareId =
    profile.status === "pending_review" &&
    profile.govIdReviewStatus === "submitted" &&
    !profile.rejectReason;
  const needsResubmit =
    profile.status === "rejected" ||
    profile.govIdReviewStatus === "rejected" ||
    Boolean(profile.rejectReason);

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

  const hidePhoneTier =
    skipT1IfCustomerDone && customerHasT1(userProfile);
  const hideGovIdTiers =
    skipT2IfCustomerDone && customerHasT2(userProfile);

  // Notify parent sheet when Customer-inherited or local T1+T2 are done
  useEffect(() => {
    if (!onMandatoryComplete || !profile) return;
    if (isProSwitchMandatoryOnboardingDone(userProfile, profile)) {
      onMandatoryComplete();
    }
  }, [
    onMandatoryComplete,
    userProfile,
    profile?.tiers?.tier1_phone,
    profile?.tiers?.tier2_govId,
    profile?.govIdReviewStatus,
  ]);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
      style={{ backgroundColor: sheetBg }}
    >
      <div className="shrink-0">
        {!embedInSheet ? (
          <PageHeader
            title={mode === "settings" ? "Verification" : "Repair Pro Setup"}
            subtitle={`${statusLabel(profile.status)} · ${progress}% verified`}
            // Stack previous page when available; else dashboard (pro) / profile
            backHref={mode === "settings" ? "/profile" : "/dashboard"}
          />
        ) : (
          <div className="px-3 pb-1 pt-0.5">
            <p className={cn("text-[11px] font-semibold", muted)}>
              {hideGovIdTiers
                ? "Customer ID already verified — finish Pro-only steps"
                : "Complete remaining verification for Repair Pro"}
              {" · "}
              {progress}%
            </p>
          </div>
        )}

        {needsResubmit ? (
          <div
            className={cn(
              "mx-3 mb-2 rounded-md border-0 px-3 py-2.5",
              isLight ? "bg-black/[0.05]" : "bg-white/[0.06]"
            )}
          >
            <p className={cn("text-[12px] font-bold", ink)}>
              Care asked you to re-verify
            </p>
            <p className={cn("mt-0.5 text-[11px] font-medium leading-snug", muted)}>
              {profile.rejectReason ||
                "Re-submit government ID and any skill documents below. You are not locked out."}
            </p>
          </div>
        ) : waitingCareId ? (
          <div
            className={cn(
              "mx-3 mb-2 rounded-md border-0 px-3 py-2.5",
              isLight ? "bg-black/[0.05]" : "bg-white/[0.06]"
            )}
          >
            <p className={cn("text-[12px] font-bold", ink)}>
              ID under review
            </p>
            <p className={cn("mt-0.5 text-[11px] font-medium leading-snug", muted)}>
              Ona Care is checking your details. You can still update other
              tiers. Go Live unlocks after T2 ID is approved.
            </p>
          </div>
        ) : null}

        {/* Progress — full onboarding only */}
        {mode === "full" ? (
          <div className="px-3 pb-2">
            <div
              className={cn(
                "h-1 w-full overflow-hidden rounded-full",
                isLight ? "bg-black/10" : "bg-white/15"
              )}
            >
              <div
                className="h-full rounded-full bg-[#FF6B35] transition-all duration-300"
                style={{
                  width: `${((stepIndex + 1) / STEPS.length) * 100}%`,
                }}
              />
            </div>
            <p
              className={cn(
                "mt-2 text-[11px] font-semibold tracking-wide",
                muted
              )}
            >
              {STEPS[stepIndex]?.label}{" "}
              <span className={cn("font-medium", soft)}>
                Step {stepIndex + 1} of {STEPS.length}
              </span>
            </p>
          </div>
        ) : null}
      </div>

      {/* Scrollable body — must stay scrollable on mobile */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-4"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
        }}
      >
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
              {lockedPrimaryTrade
                ? "Pre-selected from signup. Specialty can still be set below."
                : "Pick one main skill, then a required specialty."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ARTISAN_TRADE_CATALOG.map((t) => {
                const on = profile.trade.service === t.service;
                return (
                  <button
                    key={t.service}
                    type="button"
                    onClick={() => {
                      const locked =
                        lockedPrimaryTrade || profile.trade.service;
                      // Always locked once a primary trade exists (signup or draft)
                      if (locked && t.service !== locked) {
                        setTradeLockOpen(true);
                        return;
                      }
                      if (locked && t.service === locked) return;
                      patch({
                        trade: { service: t.service, specialty: null },
                        professionAnswers: {},
                      });
                    }}
                    className={cn(
                      "rounded-md border-0 px-2.5 py-2.5 text-left text-[12px] font-bold",
                      on ? "bg-[#FF6B35] text-white" : tradeOff,
                      lockedPrimaryTrade && !on && "opacity-55"
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        "mt-0.5 block text-[10px] font-medium",
                        on ? "text-white/80" : muted
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
                                on ? chipOn : chipOff
                              )}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {q.type === "multiselect" && q.options ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
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
                                  // Other doesn't count against max the same way — allow +1
                                  const maxAllow =
                                    opt === OTHER_OPTION ? max + 1 : max;
                                  if (next.length > maxAllow)
                                    next = next.slice(0, maxAllow);
                                  const nextAnswers: Record<
                                    string,
                                    string | string[]
                                  > = {
                                    ...answers,
                                    [q.id]: next,
                                  };
                                  if (
                                    opt === OTHER_OPTION &&
                                    on
                                  ) {
                                    // Deselected Other → clear custom text
                                    delete nextAnswers[otherAnswerKey(q.id)];
                                  }
                                  patch({ professionAnswers: nextAnswers });
                                }}
                                className={cn(
                                  "rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                                  on ? chipOn : chipOff
                                )}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {Array.isArray(val) && val.includes(OTHER_OPTION) ? (
                          <input
                            className={fieldClass}
                            value={
                              typeof answers[otherAnswerKey(q.id)] === "string"
                                ? (answers[otherAnswerKey(q.id)] as string)
                                : ""
                            }
                            onChange={(e) =>
                              patch({
                                professionAnswers: {
                                  ...answers,
                                  [otherAnswerKey(q.id)]: e.target.value,
                                },
                              })
                            }
                            placeholder="Type your answer"
                            maxLength={120}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* —— PHONE TIER 1 —— (skip if Customer already T1) */}
        {step === "phone" && !hidePhoneTier && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-[#FF6B35]" />
              <h2 className={cn("text-[15px] font-bold", ink)}>
                Phone verification
              </h2>
            </div>
            <div className={cn("rounded-md px-3 py-2.5 text-[11px] font-medium leading-snug", tipBox)}>
              <p className="font-bold">Tier 1 required</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Enter your phone and send a code</li>
                <li>Code expires in 10 minutes (5 tries, 45s resend)</li>
                <li>Enter the code to verify</li>
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
                  onClick={() => void sendOtp()}
                  className="h-10 w-full rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white"
                >
                  {otpSent ? "Resend OTP" : "Send OTP"}
                </button>
                {/* Demo / SMS-config codes are never shown in the UI */}
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
                      onClick={() => void verifyOtp()}
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
                <Check className="h-4 w-4" /> Phone verified (Tier 1)
              </p>
            )}
          </section>
        )}

        {/* —— ESSENTIALS —— */}
        {step === "essentials" && (
          <section className="space-y-3">
            <h2 className={cn("text-[15px] font-bold", ink)}>
              Profile details
            </h2>
            <label className={cn("block text-[11px] font-bold", soft)}>
              Years of experience
              <ReqStar />
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

            {/* Country locked from signup */}
            <div className={panelClass}>
              <p className={cn("text-[11px] font-bold", soft)}>
                Service area country
              </p>
              <p className={cn("mt-1 text-[14px] font-semibold", ink)}>
                {profile.serviceArea.countryName ||
                  countryName(profile.serviceArea.countryCode || "NG")}
              </p>
              <p className={cn("mt-0.5 text-[10px] font-medium", muted)}>
                From your signup and cannot be changed
              </p>
            </div>

            {/* State / Cities / LGA navigation rows */}
            <div
              className={cn(
                "overflow-hidden rounded-md",
                isLight ? "bg-black/[0.05]" : "bg-white/[0.06]"
              )}
            >
              <Link
                href="/artisan/onboarding/states"
                onClick={() => {
                  try {
                    sessionStorage.setItem(ARTISAN_STEP_KEY, "essentials");
                  } catch {
                    /* */
                  }
                }}
                className="flex w-full items-center gap-2 border-0 px-3 py-3 no-underline"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px] font-bold", ink)}>
                    Service area states
                    <ReqStar />
                  </span>
                  <span className={cn("block text-[11px] font-medium", muted)}>
                    {profile.serviceArea.states[0] || "Pick one state"}
                  </span>
                </span>
                <ChevronRight
                  className={cn("h-4 w-4 shrink-0", muted)}
                />
              </Link>
              <Link
                href="/artisan/onboarding/cities"
                onClick={() => {
                  try {
                    sessionStorage.setItem(ARTISAN_STEP_KEY, "essentials");
                  } catch {
                    /* */
                  }
                }}
                className="flex w-full items-center gap-2 border-0 px-3 py-3 no-underline"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px] font-bold", ink)}>
                    Cities
                    <ReqStar />
                  </span>
                  <span className={cn("block text-[11px] font-medium", muted)}>
                    {profile.serviceArea.cities.length
                      ? profile.serviceArea.cities.join(", ")
                      : profile.serviceArea.states[0]
                        ? "Pick cities you serve"
                        : "Choose a state first"}
                  </span>
                </span>
                <ChevronRight
                  className={cn("h-4 w-4 shrink-0", muted)}
                />
              </Link>
              {supportsLga(profile.serviceArea.countryCode || "NG") ? (
                <Link
                  href="/artisan/onboarding/lgas"
                  onClick={() => {
                    try {
                      sessionStorage.setItem(ARTISAN_STEP_KEY, "essentials");
                    } catch {
                      /* */
                    }
                  }}
                  className="flex w-full items-center gap-2 border-0 px-3 py-3 no-underline"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13px] font-bold", ink)}>
                      LGA
                    </span>
                    <span className={cn("block text-[11px] font-medium", muted)}>
                      {profile.serviceArea.lgas.length
                        ? profile.serviceArea.lgas.join(", ")
                        : profile.serviceArea.states[0]
                          ? "Pick LGAs (optional)"
                          : "Choose a state first"}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn("h-4 w-4 shrink-0", muted)}
                  />
                </Link>
              ) : null}
            </div>

            <div>
              <p className={cn("mb-1.5 text-[11px] font-bold", soft)}>
                Tools
                <ReqStar />
              </p>
              <div className="flex gap-2">
                <input
                  value={toolDraft}
                  onChange={(e) => setToolDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const t = toolDraft.trim();
                      if (!t) return;
                      if (!profile.toolsOwned.includes(t)) {
                        patch({ toolsOwned: [...profile.toolsOwned, t] });
                      }
                      setToolDraft("");
                    }
                  }}
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
                  className="h-10 rounded-md border-0 bg-[#FF6B35] px-3 text-[12px] font-bold text-white"
                >
                  Add
                </button>
              </div>
              {profile.toolsOwned.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profile.toolsOwned.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-md bg-[#FF6B35] px-2 py-1 text-[11px] font-bold text-white"
                    >
                      {t}
                      <button
                        type="button"
                        aria-label={`Remove ${t}`}
                        onClick={() =>
                          patch({
                            toolsOwned: profile.toolsOwned.filter((x) => x !== t),
                          })
                        }
                        className="border-0 bg-transparent p-0 text-white"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={panelClass}>
              <p className={cn("mb-2 text-[12px] font-bold", ink)}>
                Guarantor
                <ReqStar />
              </p>
              <label className={cn("mb-2 block text-[11px] font-bold", soft)}>
                Full name
                <ReqStar />
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
                <ReqStar />
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
                Portfolio
                <ReqStar />
              </h2>
            </div>
            <p className={cn("text-[12px]", muted)}>
              Upload {PORTFOLIO_MIN}–{PORTFOLIO_MAX} clear photos of previous
              jobs. Each image max {formatMb(IMAGE_MAX_BYTES)}.
            </p>
            <label
              className={cn(
                "flex h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed",
                isLight ? "border-black/15 bg-black/[0.06]" : "border-white/20 bg-white/[0.08]"
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
              Optional. Max {INTRO_VIDEO_MAX_SEC}s and{" "}
              {formatMb(INTRO_VIDEO_MAX_BYTES)}. A short video of you and your
              tools helps admins approve you faster.
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
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  setErr(null);
                  try {
                    if (f.size > INTRO_VIDEO_MAX_BYTES) {
                      setErr(
                        `Video must be ${formatMb(INTRO_VIDEO_MAX_BYTES)} or less. This file is ${formatMb(f.size)}.`
                      );
                      return;
                    }
                    const dur = await getVideoDurationSec(f);
                    if (dur > INTRO_VIDEO_MAX_SEC + 0.25) {
                      setErr(
                        `Video must be ${INTRO_VIDEO_MAX_SEC} seconds or less. This one is ${Math.ceil(dur)}s.`
                      );
                      return;
                    }
                    if (dur < INTRO_VIDEO_MIN_SEC) {
                      setErr("Video is too short to use.");
                      return;
                    }
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
                    setMsg("Intro video saved.");
                  } catch {
                    setErr("Could not read video. Try another file.");
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

        {/* —— OPTIONAL TIERS 2–4 (strict order) —— */}
        {(step === "optional_tiers" || mode === "settings") && (
          <section className="space-y-4">
            <div className={cn("rounded-md px-3 py-2.5 text-[11px] font-medium leading-snug", tipBox)}>
              <p className="font-bold">Verification order</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Government ID (Tier 2) — submit anytime for review</li>
                <li>Face liveness (Tier 3) after ID</li>
                <li>BVN (Tier 3) after ID — with liveness before skill</li>
                <li>Proof of skill (Tier 4) — upload then submit for review</li>
              </ol>
              <p className="mt-2 font-medium">
                Profile Submit does not require Tier 2–4
              </p>
            </div>

            {/* Status strip — complete = submitted or approved / passed */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["Phone", profile.tiers.tier1_phone],
                  ["Gov ID", isGovIdComplete(profile)],
                  ["BVN", isBvnComplete(profile)],
                  ["Liveness", isLivenessComplete(profile)],
                  ["Skill", isSkillComplete(profile)],
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
                        : "bg-white/[0.08] text-[#a1a1a6]"
                  )}
                >
                  {ok ? "✓" : "·"} {label}
                </span>
              ))}
            </div>

            {/* Soft grey square lock popup */}
            {gatePopup ? (
              <div
                className="absolute inset-0 z-[120] flex items-center justify-center px-6"
                role="dialog"
                aria-modal="true"
              >
                <button
                  type="button"
                  className="absolute inset-0 border-0 bg-black/20"
                  aria-label="Close"
                  onClick={() => setGatePopup(null)}
                />
                <div
                  className={cn(
                    "relative z-[1] flex aspect-square w-[min(100%,260px)] max-h-[260px]",
                    "flex-col items-center justify-center rounded-[0.65rem] px-5 py-6 text-center",
                    "border-0 shadow-none",
                    // Match phone shell grey exactly
                    isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-[#f2f2f7]"
                  )}
                >
                  <p className="text-[14px] font-bold leading-snug">{gatePopup}</p>
                  <button
                    type="button"
                    onClick={() => setGatePopup(null)}
                    className="mt-5 h-10 w-full rounded-[0.5rem] border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
                  >
                    Got it
                  </button>
                </div>
              </div>
            ) : null}

            {hideGovIdTiers ? (
              <div
                className={cn(
                  "rounded-md px-3 py-2.5 text-[11px] font-medium leading-snug",
                  isLight
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-emerald-950/40 text-emerald-200"
                )}
              >
                <p className="font-bold">Tier 2 already complete</p>
                <p className="mt-0.5">
                  Your Customer government ID is verified — no re-upload for
                  Repair Pro.
                </p>
              </div>
            ) : null}

            <div
              className={cn(
                panelClass,
                "space-y-2.5",
                hideGovIdTiers && "hidden"
              )}
            >
              <div>
                <p className={cn("flex items-center gap-2 text-[13px] font-bold", ink)}>
                  <FileText className="h-4 w-4 shrink-0 text-[#FF6B35]" />{" "}
                  Government ID
                </p>
                <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                  {profile.tiers.tier2_govId
                    ? "Approved by admin / care"
                    : reviewLabel(profile.govIdReviewStatus)}
                </p>
              </div>
              <select
                value={profile.govIdType || ""}
                onChange={(e) =>
                  patch({
                    govIdType: (e.target.value || null) as GovIdType | null,
                    govIdFront: null,
                    govIdBack: null,
                    tiers: { ...profile.tiers, tier2_govId: false },
                    govIdReviewStatus: "none",
                  })
                }
                className={selectClass}
                disabled={
                  profile.tiers.tier2_govId ||
                  profile.govIdReviewStatus === "submitted"
                }
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
                onChange={(e) => {
                  let v = e.target.value;
                  if (profile.govIdType === "nin") {
                    v = v.replace(/\D/g, "").slice(0, 11);
                  }
                  patch({
                    govIdNumber: v,
                    tiers: { ...profile.tiers, tier2_govId: false },
                    govIdReviewStatus: "none",
                  });
                }}
                placeholder={
                  profile.govIdType === "nin"
                    ? "11-digit NIN"
                    : "ID number on the document"
                }
                className={fieldClass}
                inputMode={profile.govIdType === "nin" ? "numeric" : "text"}
                maxLength={profile.govIdType === "nin" ? 11 : undefined}
                disabled={
                  profile.tiers.tier2_govId ||
                  profile.govIdReviewStatus === "submitted"
                }
              />
              {/* Front (always) + Back (licence / voters only) */}
              {(
                [
                  {
                    side: "front" as const,
                    label: govIdNeedsBack(profile.govIdType)
                      ? "Upload front of ID"
                      : "Upload photo of selected ID",
                    media: profile.govIdFront,
                    kind: "id_front" as const,
                  },
                  ...(govIdNeedsBack(profile.govIdType)
                    ? [
                        {
                          side: "back" as const,
                          label: "Upload back of ID",
                          media: profile.govIdBack,
                          kind: "id_back" as const,
                        },
                      ]
                    : []),
                ] as const
              ).map((slot) => (
                <label
                  key={slot.side}
                  className={cn(
                    "flex w-full min-h-[48px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-3 py-3",
                    isLight
                      ? "bg-black/[0.06] text-slate-800"
                      : "bg-white/[0.08] text-white",
                    (profile.tiers.tier2_govId ||
                      profile.govIdReviewStatus === "submitted") &&
                      "pointer-events-none opacity-60"
                  )}
                >
                  <span className="flex items-center gap-2 text-[12px] font-bold">
                    <Upload className="h-4 w-4 shrink-0 text-[#FF6B35]" />
                    {slot.media
                      ? `Uploaded: ${slot.media.name || slot.side}`
                      : slot.label}
                  </span>
                  <span className={cn("text-[10px] font-medium", muted)}>
                    Max {formatMb(IMAGE_MAX_BYTES)} · image only
                    {govIdNeedsBack(profile.govIdType)
                      ? ` · ${slot.side}`
                      : " · front only"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={
                      profile.tiers.tier2_govId ||
                      profile.govIdReviewStatus === "submitted"
                    }
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (f.size > IMAGE_MAX_BYTES) {
                        setErr(
                          `ID photo must be ${formatMb(IMAGE_MAX_BYTES)} or less.`
                        );
                        return;
                      }
                      setBusy(true);
                      try {
                        const url = await fileToDataUrl(f);
                        const media = {
                          id: uid(),
                          url,
                          kind: slot.kind,
                          name: f.name,
                          mime: f.type,
                          createdAt: new Date().toISOString(),
                        };
                        patch({
                          ...(slot.side === "front"
                            ? { govIdFront: media }
                            : { govIdBack: media }),
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
              ))}
              <button
                type="button"
                disabled={
                  idBusy === "gov" ||
                  profile.tiers.tier2_govId ||
                  profile.govIdReviewStatus === "submitted" ||
                  profile.govIdReviewStatus === "approved"
                }
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white disabled:opacity-60"
                onClick={submitGovIdForReview}
              >
                {idBusy === "gov" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : profile.tiers.tier2_govId ||
                  profile.govIdReviewStatus === "approved" ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> ID approved
                  </>
                ) : profile.govIdReviewStatus === "submitted" ? (
                  "ID currently in review"
                ) : (
                  "Submit ID for review"
                )}
              </button>
            </div>

            {/* Face liveness — Tier 3 (after Government ID) */}
            <div
              className={cn(
                "relative",
                !canAccessLiveness(profile) && "opacity-45"
              )}
            >
              {!canAccessLiveness(profile) ? (
                <button
                  type="button"
                  className="absolute inset-0 z-[2] border-0 bg-transparent"
                  aria-label={lockMessageForSection("liveness")}
                  onClick={() =>
                    setGatePopup(lockMessageForSection("liveness"))
                  }
                />
              ) : null}
              <div
                className={cn(
                  panelClass,
                  !canAccessLiveness(profile) && "pointer-events-none"
                )}
              >
                <p className={cn("text-[13px] font-bold", ink)}>
                  Face liveness · Tier 3
                </p>
                <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                  {profile.tiers.tier3_liveness
                    ? `Passed${profile.livenessPassedAt ? ` ${new Date(profile.livenessPassedAt).toLocaleString()}` : ""}`
                    : "Live video check · 5–8s · no recording saved"}
                </p>
                {showLiveness ? (
                  <div className="mt-2">
                    <FaceLiveness
                      isLight={isLight}
                      userKey={
                        backendUserId ||
                        userProfile?.email ||
                        userProfile?.phone ||
                        "guest"
                      }
                      userId={backendUserId || undefined}
                      onCancel={() => setShowLiveness(false)}
                      onPassed={() => {
                        const passedAt = new Date().toISOString();
                        patch({
                          livenessPassed: true,
                          livenessPassedAt: passedAt,
                          tiers: { ...profile.tiers, tier3_liveness: true },
                          selfie: profile.selfie || {
                            id: uid(),
                            url: "",
                            kind: "selfie",
                            name: "liveness-pass",
                            createdAt: passedAt,
                          },
                        });
                        setShowLiveness(false);
                        setMsg(
                          "Face liveness passed. Complete BVN (Tier 3) for full T3 search reach."
                        );
                        setErr(null);
                        // Persist liveness + auto-promote visibility T3 on server
                        void (async () => {
                          try {
                            if (backendUserId) {
                              const { authFetch } = await import(
                                "@/lib/api-auth-headers"
                              );
                              await authFetch("/api/artisan/profile", {
                                method: "PATCH",
                                body: JSON.stringify({
                                  userId: backendUserId,
                                  livenessPassedAt: passedAt,
                                }),
                              });
                              await authFetch("/api/profile/update", {
                                method: "POST",
                                body: JSON.stringify({
                                  faceLivenessVerified: true,
                                }),
                              }).catch(() => null);
                            }
                          } catch {
                            /* local still saved */
                          }
                        })();
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
            </div>

            {/* BVN — Tier 3 (after Government ID; not part of T2) */}
            <div
              className={cn(
                "relative",
                !canAccessBvn(profile) && "opacity-45"
              )}
            >
              {!canAccessBvn(profile) ? (
                <button
                  type="button"
                  className="absolute inset-0 z-[2] border-0 bg-transparent"
                  aria-label={lockMessageForSection("bvn")}
                  onClick={() =>
                    setGatePopup(lockMessageForSection("bvn"))
                  }
                />
              ) : null}
              <div
                className={cn(
                  panelClass,
                  !canAccessBvn(profile) && "pointer-events-none"
                )}
              >
                <p className={cn("flex items-center gap-2 text-[13px] font-bold", ink)}>
                  <FileText className="h-4 w-4 shrink-0 text-[#FF6B35]" /> BVN
                  · Tier 3
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
                  pattern="[0-9]{11}"
                />
                <button
                  type="button"
                  disabled={
                    idBusy === "nin" ||
                    profile.tiers.tier2_nin ||
                    profile.ninReviewStatus === "submitted"
                  }
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
                  ) : profile.ninReviewStatus === "submitted" ? (
                    "BVN currently in review"
                  ) : (
                    "Submit"
                  )}
                </button>
              </div>
            </div>

            {/* Proof of skill — after BVN + liveness */}
            <div
              ref={skillSectionRef}
              className={cn(
                "relative",
                !canAccessSkillProof(profile) && "opacity-45"
              )}
            >
              {!canAccessSkillProof(profile) ? (
                <button
                  type="button"
                  className="absolute inset-0 z-[2] border-0 bg-transparent"
                  aria-label={lockMessageForSection("skill")}
                  onClick={() =>
                    setGatePopup(lockMessageForSection("skill"))
                  }
                />
              ) : null}
              <div
                className={cn(
                  panelClass,
                  "space-y-2.5",
                  !canAccessSkillProof(profile) && "pointer-events-none"
                )}
              >
                <div>
                  <p className={cn("text-[13px] font-bold", ink)}>
                    Proof of skill
                  </p>
                  <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                    {profile.skillProof
                      ? profile.skillProofStatus === "under_review" ||
                        profile.tiers.tier4_skillProof
                        ? "Submitted for review"
                        : `Ready: ${profile.skillProof.name || "file"}`
                      : "Upload certificate, then submit for review"}
                  </p>
                </div>
                <select
                  value={profile.skillProofType || ""}
                  onChange={(e) =>
                    patch({
                      skillProofType: (e.target.value ||
                        null) as SkillProofType | null,
                    })
                  }
                  className={selectClass}
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
                <label
                  className={cn(
                    "flex w-full min-h-[48px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-3 py-3",
                    isLight
                      ? "bg-black/[0.06] text-slate-800"
                      : "bg-white/[0.08] text-white"
                  )}
                >
                  <span className="flex items-center gap-2 text-[12px] font-bold">
                    <Upload className="h-4 w-4 shrink-0 text-[#FF6B35]" />
                    {profile.skillProof
                      ? `File: ${profile.skillProof.name || "certificate"}`
                      : "Upload certificate"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (!canAccessSkillProof(profile)) {
                        setGatePopup(lockMessageForSection("skill"));
                        return;
                      }
                      if (!profile.skillProofType) {
                        setErr("Pick a certificate type first.");
                        return;
                      }
                      if (
                        f.type.startsWith("image/") &&
                        f.size > IMAGE_MAX_BYTES
                      ) {
                        setErr(
                          `Image must be ${formatMb(IMAGE_MAX_BYTES)} or less.`
                        );
                        return;
                      }
                      setBusy(true);
                      try {
                        const url = await fileToDataUrl(f);
                        // Draft only — submit button sends for review
                        patch({
                          skillProof: {
                            id: uid(),
                            url,
                            kind: "skill_proof",
                            name: f.name,
                            mime: f.type,
                            createdAt: new Date().toISOString(),
                          },
                          skillProofStatus: "uploaded",
                          tiers: {
                            ...profile.tiers,
                            tier4_skillProof: false,
                          },
                        });
                        setMsg("Certificate saved. Submit for review below.");
                        setErr(null);
                      } catch {
                        setErr("Could not read file.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !profile.skillProof ||
                    profile.tiers.tier4_skillProof ||
                    profile.skillProofStatus === "under_review"
                  }
                  className="flex h-11 w-full items-center justify-center rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white disabled:opacity-60"
                  onClick={() => {
                    if (!canAccessSkillProof(profile)) {
                      setGatePopup(lockMessageForSection("skill"));
                      return;
                    }
                    if (!profile.skillProof || !profile.skillProofType) {
                      setErr("Upload a certificate first.");
                      return;
                    }
                    void (async () => {
                      setBusy(true);
                      setErr(null);
                      const apiErr = await postProVerify({
                        kind: "skill_docs",
                        skillProofType: profile.skillProofType,
                        skillProofName: profile.skillProof?.name,
                        skillProofUrl: profile.skillProof?.url,
                        primaryService: profile.trade?.service,
                      });
                      if (apiErr) {
                        setErr(apiErr);
                        setBusy(false);
                        return;
                      }
                      patch({
                        skillProofStatus: "under_review",
                        tiers: { ...profile.tiers, tier4_skillProof: true },
                      });
                      setMsg("Skill proof submitted for review.");
                      setBusy(false);
                    })();
                  }}
                >
                  {profile.tiers.tier4_skillProof ||
                  profile.skillProofStatus === "under_review"
                    ? "Skill currently in review"
                    : "Submit skill for review"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* —— REVIEW —— single clean summary card */}
        {step === "review" && (
          <section className="space-y-4">
            <div>
              <h2 className={cn("text-[17px] font-bold tracking-tight", ink)}>
                Review & submit
              </h2>
              <p className={cn("mt-1 text-[12px] font-medium", muted)}>
                Confirm your details, then send for admin approval
              </p>
            </div>

            <div
              className={cn(
                "overflow-hidden rounded-md",
                isLight ? "bg-black/[0.05]" : "bg-white/[0.06]"
              )}
            >
              {(
                [
                  [
                    "Trade",
                    `${trade?.label || "Trade"}${
                      profile.trade.specialty
                        ? ` · ${profile.trade.specialty}`
                        : ""
                    }`,
                  ],
                  [
                    "Skills",
                    professionAnswersValid(
                      profile.trade.service,
                      profile.professionAnswers || {}
                    )
                      ? "Complete"
                      : "Incomplete",
                  ],
                  [
                    "Phone",
                    profile.tiers.tier1_phone ? "Verified" : "Not verified",
                  ],
                  ["Experience", `${profile.yearsExperience} yr`],
                  [
                    "Service area",
                    [
                      profile.serviceArea.countryName ||
                        profile.serviceArea.countryCode,
                      ...profile.serviceArea.states,
                      ...profile.serviceArea.cities,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Not set",
                  ],
                  ["Tools", String(profile.toolsOwned.length)],
                  [
                    "Guarantor",
                    [profile.guarantor.fullName, profile.guarantor.phone]
                      .filter(Boolean)
                      .join(" · ") || "Not set",
                  ],
                  ["Portfolio", `${profile.portfolio.length} photos`],
                  ["Intro video", profile.introVideo ? "Yes" : "No"],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-3 px-3.5 py-2.5"
                >
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-semibold uppercase tracking-wide",
                      muted
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 text-right text-[13px] font-semibold leading-snug",
                      ink
                    )}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Verification chips — compact */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["ID", isGovIdComplete(profile)],
                  ["BVN", isBvnComplete(profile)],
                  ["Liveness", isLivenessComplete(profile)],
                  ["Skill", isSkillComplete(profile)],
                ] as const
              ).map(([label, ok]) => (
                <span
                  key={label}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[10px] font-bold",
                    ok
                      ? "bg-[#FF6B35]/15 text-[#FF6B35]"
                      : isLight
                        ? "bg-black/8 text-slate-600"
                        : "bg-white/10 text-white/55"
                  )}
                >
                  {ok ? "✓" : "·"} {label}
                </span>
              ))}
            </div>

            <p className={cn("text-center text-[11px] font-medium leading-snug", muted)}>
              Status becomes Pending Review. An admin must approve before Go
              Live.
            </p>

            <button
              type="button"
              disabled={busy}
              onClick={submitReview}
              className="h-12 w-full rounded-md border-0 bg-[#FF6B35] text-[14px] font-bold text-white disabled:opacity-50"
            >
              Submit for review
            </button>
          </section>
        )}
      </div>

      {/* Trade lock sheet — portal; outside scroll so page can always scroll */}
      {mode === "full" ? (
        <BottomSheet
          open={tradeLockOpen}
          onClose={() => setTradeLockOpen(false)}
          titleId="trade-lock-title"
        >
          <p id="trade-lock-title" className={cn("text-[16px] font-bold", ink)}>
            Primary trade locked
          </p>
          <p className={cn("mt-2 text-[13px] font-medium leading-relaxed", muted)}>
            You can&apos;t change primary trade. Contact Customer care at{" "}
            <a
              href="mailto:witcowavers@gmail.com"
              className="font-bold text-[#FF6B35] no-underline"
            >
              witcowavers@gmail.com
            </a>
          </p>
        </BottomSheet>
      ) : null}

      {/* Apple footer — primary Continue, text Back */}
      {mode === "full" ? (
        <div
          className="flex shrink-0 flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
          style={{ backgroundColor: sheetBg }}
        >
          <button
            type="button"
            disabled={stepIndex >= STEPS.length - 1}
            onClick={goNext}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border-0 bg-[#323231] text-[16px] font-semibold text-white disabled:opacity-40"
          >
            Continue
          </button>
          <button
            type="button"
            disabled={stepIndex <= 0}
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
            className={cn(
              "h-10 w-full border-0 bg-transparent text-[15px] font-semibold disabled:opacity-40",
              navBack
            )}
          >
            Back
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
