/**
 * Ona Complete Profiles System — types, badges, tiers, constants.
 */

import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from "@/lib/matching";
import type { AccountType, ProService, UserProfile } from "@/lib/types";

export const BIO_MAX = 144;

export const EXP_YEARS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10+",
] as const;
export type ExpYear = (typeof EXP_YEARS)[number];

export function formatExperience(years?: string | null): string {
  if (!years) return "Not set";
  if (years === "10+") return "10+ years";
  if (years === "1") return "1 year";
  return `${years} years`;
}

/** True when years of experience was never set (pro may set once from My Profile). */
export function isExperienceUnset(years?: string | null): boolean {
  if (years == null) return true;
  const t = String(years).trim();
  if (!t) return true;
  if (t === "—" || t === "-" || t === "–" || t === "0" || t.toLowerCase() === "n/a")
    return true;
  return false;
}

/**
 * Service radius options in km for Repair Pro My Profile.
 * Hard max is 5 km for every pro (same as marketplace discovery).
 */
export const PRO_MAX_SERVICE_RADIUS_KM = MAX_RADIUS_KM;
export const SERVICE_RADIUS_OPTIONS_KM = [1, 3, 5] as const;

/** Clamp pro coverage radius to 1–5 km */
export function clampProServiceRadiusKm(
  km: number | null | undefined
): number {
  const n = typeof km === "number" && Number.isFinite(km) ? km : DEFAULT_RADIUS_KM;
  return Math.min(PRO_MAX_SERVICE_RADIUS_KM, Math.max(1, n));
}

// ── Verification tiers ───────────────────────────────────────────────

export type VerificationTier = 1 | 2 | 3;

export type VerificationTierState = {
  /** Phone + email OTP */
  phoneVerified: boolean;
  emailVerified: boolean;
  /** NIN + BVN + face liveness */
  ninVerified: boolean;
  bvnVerified: boolean;
  faceLivenessVerified: boolean;
  faceLivenessAt?: string;
  /** In-person validation */
  inPersonVerified: boolean;
  inPersonVerifiedAt?: string;
};

export function resolveVerificationTier(
  profile: UserProfile | null | undefined
): VerificationTier {
  if (!profile) return 1;
  if (profile.inPersonVerified) return 3;
  if (
    profile.ninVerified &&
    profile.bvnVerified &&
    (profile.faceLivenessVerified || profile.identityVerifiedAt)
  ) {
    return 2;
  }
  // Phone/email verified after signup OTP flows
  if (profile.phoneVerified && profile.emailVerified) return 1;
  // Default: registered phone/email count as tier 1 progress
  if (profile.phone && profile.email) return 1;
  return 1;
}

export function verificationTierLabel(tier: VerificationTier): string {
  return `Tier ${tier}`;
}

/**
 * Blue tick / verification mark:
 * - Repair Pros: Tier 4 only (skill docs approved)
 * - Customers: in-person / high identity tier (unchanged ladder)
 */
export function hasVerificationMark(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.accountType === "professional") {
    return profile.docsStatus === "approved";
  }
  return Boolean(profile.inPersonVerified) || resolveVerificationTier(profile) >= 3;
}

// ── Achievement badges (completed jobs for Motorists / pro jobs done) ─

export type AchievementBadgeId =
  | "bronze"
  | "silver"
  | "gold"
  | "diamond"
  | "diamond_elite"
  | "special";

export type AchievementBadge = {
  id: AchievementBadgeId;
  label: string;
  minJobs: number;
  /** Tailwind-ish color tokens for chip */
  bg: string;
  fg: string;
  ring: string;
};

export const ACHIEVEMENT_BADGES: AchievementBadge[] = [
  {
    id: "bronze",
    label: "Bronze",
    minJobs: 30,
    bg: "#cd7f32",
    fg: "#1a0f05",
    ring: "#e8a85a",
  },
  {
    id: "silver",
    label: "Silver",
    minJobs: 66,
    bg: "#c0c0c0",
    fg: "#1a1a1a",
    ring: "#e8e8e8",
  },
  {
    id: "gold",
    label: "Gold",
    minJobs: 144,
    bg: "#d4af37",
    fg: "#1a1405",
    ring: "#f0d77a",
  },
  {
    id: "diamond",
    label: "Diamond",
    minJobs: 270,
    bg: "#7dd3fc",
    fg: "#0c2a3a",
    ring: "#bae6fd",
  },
  {
    id: "diamond_elite",
    label: "Diamond Elite",
    minJobs: 1000,
    bg: "#38bdf8",
    fg: "#082f49",
    ring: "#e0f2fe",
  },
  {
    id: "special",
    label: "Special",
    minJobs: 1440,
    bg: "#FF6B35",
    fg: "#fff7ed",
    ring: "#fdba74",
  },
];

/** All badges earned up to completedJobs (cumulative). */
export function badgesForJobs(completedJobs: number): AchievementBadge[] {
  const n = Math.max(0, completedJobs | 0);
  return ACHIEVEMENT_BADGES.filter((b) => n >= b.minJobs);
}

/** Highest badge only (for compact map pin). */
export function topBadgeForJobs(
  completedJobs: number
): AchievementBadge | null {
  const earned = badgesForJobs(completedJobs);
  return earned.length ? earned[earned.length - 1]! : null;
}

// ── Extended profile shapes ──────────────────────────────────────────

export type MotoristVehicle = {
  photo?: string;
  make?: string;
  model?: string;
  year?: string;
  plate?: string;
  commonIssues?: string[];
};

export type SavedLocation = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

export type EmergencyContact = {
  name: string;
  phone: string;
};

export type ServiceOffer = {
  service: ProService;
  priceLabel?: string;
};

export type ProfileReview = {
  id: string;
  authorName: string;
  authorPhoto?: string;
  rating: number;
  date: string;
  comment: string;
};

export type JobHistoryItem = {
  id: string;
  proName: string;
  proPhoto?: string;
  serviceType: string;
  status: string;
  date: string;
  ratingGiven?: number;
};

export const COMMON_VEHICLE_ISSUES = [
  "Won't start",
  "Flat tyre",
  "Battery",
  "Overheating",
  "Brakes",
  "AC not cooling",
  "Strange noise",
  "Check engine",
  "Towing needed",
  "Lockout",
] as const;

export type ProfileThemeTokens = {
  sheet: string;
  sheetBg: string;
  card: string;
  cardBg: string;
  inset: string;
  insetBg: string;
  ink: string;
  muted: string;
  soft: string;
  border: string;
  isLight: boolean;
};

export function profileTheme(isLight: boolean): ProfileThemeTokens {
  return {
    isLight,
    sheet: isLight ? "bg-[#c8c9cd]" : "bg-black",
    sheetBg: isLight ? "#c8c9cd" : "#000000",
    // Flat profile: no elevated cards (X-style). Inputs use transparent stage.
    card: "rounded-none border-0 bg-transparent",
    cardBg: "transparent",
    inset: "bg-transparent",
    insetBg: "transparent",
    ink: isLight ? "text-slate-900" : "text-white",
    muted: isLight ? "text-slate-600" : "text-[#a1a1a6]",
    soft: isLight ? "text-slate-700" : "text-[#d1d1d6]",
    border: isLight ? "border-black/10" : "border-white/10",
  };
}

export function canViewMotoristProfile(
  viewer: AccountType | null | undefined
): boolean {
  // Repair Pros must never see Motorist profiles
  return viewer !== "professional";
}

export function memberSinceLabel(iso?: string): string {
  if (!iso) return "Not set";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Not set";
  }
}
