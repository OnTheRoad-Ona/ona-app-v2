/**
 * Mock persistence for artisan verification (localStorage).
 * TODO(api): Replace with Supabase artisan_profiles + storage buckets.
 */

import { emptyTiers } from "@/lib/artisan/status";
import type { ArtisanVerificationProfile } from "@/lib/artisan/types";

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

export function getArtisanProfile(
  userId: string
): ArtisanVerificationProfile | null {
  return readAll()[userId] ?? null;
}

export function listArtisanProfiles(): ArtisanVerificationProfile[] {
  return Object.values(readAll()).sort(
    (a, b) =>
      Date.parse(b.updatedAt || b.createdAt) -
      Date.parse(a.updatedAt || a.createdAt)
  );
}

export function saveArtisanProfile(
  profile: ArtisanVerificationProfile
): ArtisanVerificationProfile {
  const map = readAll();
  const next = { ...profile, updatedAt: new Date().toISOString() };
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
}): ArtisanVerificationProfile {
  const existing = getArtisanProfile(input.userId);
  if (existing) return existing;
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
    serviceArea: { states: [], cities: [], lgas: [] },
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
