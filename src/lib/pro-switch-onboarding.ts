/**
 * Customer → Repair Pro (Tap to Switch) onboarding rules.
 *
 * - Carry Customer T1 (phone) + T2 (gov ID Care-approved) so Pro is not re-asked.
 * - Force remaining Pro setup in a bottom panel until Care-approved T2
 *   (collapses to a tiny fracture; one tier at a time).
 * - Settings → Verification for dual C→Pro only after Care approves T2.
 * - Progress flag persisted per user (localStorage) so sheet returns after refresh.
 */

import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import {
  isIdentityVerified,
  isPhoneVerified,
} from "@/lib/verification-gate";
import type { UserProfile } from "@/lib/types";

const SHEET_FLAG_PREFIX = "ona-pro-onboarding-sheet:";
const SETUP_STARTED_PREFIX = "ona-pro-setup-started:";

/** Customer Tier 1 = phone OTP verified on identity */
export function customerHasT1(
  profile: UserProfile | null | undefined
): boolean {
  return isPhoneVerified(profile);
}

/** Customer Tier 2 = government ID Care-approved only */
export function customerHasT2(
  profile: UserProfile | null | undefined
): boolean {
  return isIdentityVerified(profile);
}

/**
 * Dual-role path: had / has Customer + acting (or switching) as Pro.
 */
export function isCustomerToProDualPath(opts: {
  hasMotoristAccount: boolean;
  hasProAccount: boolean;
  accountType: string | null | undefined;
  primaryAccountType?: string | null;
}): boolean {
  if (!opts.hasMotoristAccount) return false;
  if (opts.accountType === "professional") return true;
  if (
    opts.hasProAccount &&
    (opts.primaryAccountType === "motorist" || !opts.primaryAccountType)
  ) {
    return true;
  }
  return opts.hasProAccount && opts.hasMotoristAccount;
}

/**
 * Care-approved T2 only (not mere submit). Used for Settings Verification
 * and for dismissing the mandatory dual onboarding sheet.
 */
export function proT2CareApproved(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  if (customerHasT2(profile)) return true;
  if (profile?.identityReviewStatus === "approved") return true;
  if (
    artisan?.govIdReviewStatus === "approved" &&
    Boolean(artisan?.tiers?.tier2_govId)
  ) {
    return true;
  }
  return false;
}

/** @deprecated prefer proT2CareApproved for product gates */
export function proT2Satisfied(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  return proT2CareApproved(profile, artisan);
}

/** Whether Pro should see Settings → Verification (dual only after Care T2). */
export function shouldShowProSettingsVerification(opts: {
  hasMotoristAccount: boolean;
  hasProAccount: boolean;
  accountType: string | null | undefined;
  primaryAccountType?: string | null;
  userProfile: UserProfile | null | undefined;
  artisan?: Partial<ArtisanVerificationProfile> | null;
}): boolean {
  const isPro = opts.accountType === "professional";
  if (!isPro) return true;

  const dual = isCustomerToProDualPath(opts);
  if (!dual) {
    // Pure Pro — Verification always available
    return true;
  }
  return proT2CareApproved(opts.userProfile, opts.artisan);
}

/** Dual incomplete: show Settings “Continue setup” (not Verification). */
export function shouldShowProContinueSetup(opts: {
  hasMotoristAccount: boolean;
  hasProAccount: boolean;
  accountType: string | null | undefined;
  primaryAccountType?: string | null;
  userProfile: UserProfile | null | undefined;
  artisan?: Partial<ArtisanVerificationProfile> | null;
}): boolean {
  if (opts.accountType !== "professional") return false;
  if (!isCustomerToProDualPath(opts)) return false;
  return !proT2CareApproved(opts.userProfile, opts.artisan);
}

export function proT1Satisfied(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  if (customerHasT1(profile)) return true;
  if (artisan?.tiers?.tier1_phone) return true;
  return false;
}

/** Mandatory sheet done = Care-approved T2 (T1 can be inherited). */
export function isProSwitchMandatoryOnboardingDone(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  // T1 still required (phone) before considering dual onboarding complete
  if (!proT1Satisfied(profile, artisan)) return false;
  return proT2CareApproved(profile, artisan);
}

export function applyCustomerTiersToArtisan(
  artisan: ArtisanVerificationProfile,
  profile: UserProfile | null | undefined
): ArtisanVerificationProfile {
  let next = { ...artisan, tiers: { ...artisan.tiers } };
  if (customerHasT1(profile)) {
    next.tiers.tier1_phone = true;
  }
  if (customerHasT2(profile)) {
    next.tiers.tier2_govId = true;
    next.tiers.tier2_nin = true;
    if (!next.govIdReviewStatus || next.govIdReviewStatus === "none") {
      next.govIdReviewStatus = "approved";
    }
    if (!next.ninReviewStatus || next.ninReviewStatus === "none") {
      next.ninReviewStatus = "approved";
    }
  }
  return next;
}

export function readProOnboardingSheetFlag(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SHEET_FLAG_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function writeProOnboardingSheetFlag(
  userId: string | null | undefined,
  required: boolean
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    if (required) {
      localStorage.setItem(SHEET_FLAG_PREFIX + userId, "1");
      localStorage.setItem(SETUP_STARTED_PREFIX + userId, "1");
    } else {
      localStorage.removeItem(SHEET_FLAG_PREFIX + userId);
    }
  } catch {
    /* ignore */
  }
}

export function readProSetupStarted(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SETUP_STARTED_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}
