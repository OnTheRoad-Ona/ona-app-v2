/**
 * Mock persistence for artisan verification (localStorage).
 * TODO(api): Replace with Supabase artisan_profiles + storage buckets.
 */

import { emptyTiers } from "@/lib/artisan/status";
import type {
  ArtisanVerificationProfile,
  TierCompletion,
} from "@/lib/artisan/types";

const KEY = "ona-artisan-profiles-v1";

function readAll(): Record<string, ArtisanVerificationProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ArtisanVerificationProfile>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, ArtisanVerificationProfile>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/** Migrate older drafts that used tier2_bvn / live Prembly flags */
function normalizeProfile(
  p: ArtisanVerificationProfile
): ArtisanVerificationProfile {
  const raw = p.tiers as TierCompletion & { tier2_bvn?: boolean };
  const tier2_nin =
    typeof raw.tier2_nin === "boolean"
      ? raw.tier2_nin
      : Boolean(raw.tier2_bvn);
  return {
    ...p,
    tiers: {
      tier1_phone: Boolean(raw.tier1_phone),
      tier2_govId: Boolean(raw.tier2_govId),
      tier2_nin,
      tier3_liveness: Boolean(raw.tier3_liveness),
      tier4_skillProof: Boolean(raw.tier4_skillProof),
    },
    govIdReviewStatus: p.govIdReviewStatus || "none",
    ninReviewStatus: p.ninReviewStatus || "none",
  };
}

export function getArtisanProfile(
  userId: string
): ArtisanVerificationProfile | null {
  const p = readAll()[userId];
  return p ? normalizeProfile(p) : null;
}

export function listArtisanProfiles(): ArtisanVerificationProfile[] {
  return Object.values(readAll())
    .map(normalizeProfile)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.createdAt) -
        Date.parse(a.updatedAt || a.createdAt)
    );
}

export function saveArtisanProfile(
  profile: ArtisanVerificationProfile
): ArtisanVerificationProfile {
  const map = readAll();
  const next = normalizeProfile({
    ...profile,
    updatedAt: new Date().toISOString(),
  });
  map[profile.userId] = next;
  writeAll(map);
  return next;
}

export function ensureArtisanDraft(input: {
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  service?: ArtisanVerificationProfile["trade"]["service"];
  countryCode?: string;
  countryName?: string;
}): ArtisanVerificationProfile {
  const existing = getArtisanProfile(input.userId);
  if (existing) {
    // Lock country from signup if missing on older drafts
    if (!existing.serviceArea?.countryCode && input.countryCode) {
      const next = {
        ...existing,
        serviceArea: {
          ...existing.serviceArea,
          countryCode: input.countryCode,
          countryName: input.countryName,
        },
      };
      return saveArtisanProfile(next);
    }
    return existing;
  }
  const now = new Date().toISOString();
  const draft: ArtisanVerificationProfile = {
    userId: input.userId,
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    status: "draft",
    tiers: emptyTiers(),
    trade: {
      service: input.service || "mechanic",
      specialty: null,
    },
    yearsExperience: 1,
    serviceArea: {
      countryCode: input.countryCode || "NG",
      countryName: input.countryName || "Nigeria",
      states: [],
      cities: [],
      lgas: [],
    },
    toolsOwned: [],
    guarantor: { fullName: "", phone: "" },
    portfolio: [],
    introVideo: null,
    isNewArtisan: true,
    successfulJobsCount: 0,
    visibilityTier: 1,
    tier2ApprovedAt: null,
    tier3ApprovedAt: null,
    tier4ApprovedAt: null,
    goLiveWindowEndsAt: null,
    tier4OneStarSeeded: false,
    createdAt: now,
    updatedAt: now,
  };
  return saveArtisanProfile(draft);
}

/** @deprecated Use sendArtisanOtp / verifyArtisanOtp from verification.ts */
export { sendArtisanOtp as mockSendOtp, verifyArtisanOtp as mockVerifyOtp } from "@/lib/artisan/verification";
