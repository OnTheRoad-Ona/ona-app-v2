/**
 * Customer → Repair Pro (Tap to Switch) onboarding rules.
 *
 * - Carry Customer T1 (phone) + T2 (gov ID Care-approved) so Pro is not re-asked.
 * - Force remaining Pro setup in bottom panel until full T1–T4 ladder done
 *   (one tier at a time; after Care T2 advances to T3/T4).
 * - Settings: Continue verification until ladder done, then View Verification.
 * - Progress flag persisted per user (localStorage) so sheet returns after refresh.
 */

import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import {
  isProVerificationLadderComplete,
  nextProEmbedTierStep,
} from "@/lib/artisan/verification-order";
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
  if (artisan?.govIdReviewStatus === "approved") return true;
  if (Boolean(artisan?.tiers?.tier2_govId)) return true;
  return false;
}

/** @deprecated prefer proT2CareApproved for product gates */
export function proT2Satisfied(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  return proT2CareApproved(profile, artisan);
}

/** Pure Pro: always; dual: View Verification only when T1–T4 complete. */
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
  if (!dual) return true;
  return isProLadderDone(opts.userProfile, opts.artisan);
}

/** Dual (or pro) incomplete ladder: Settings “Continue verification”. */
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
  return !isProLadderDone(opts.userProfile, opts.artisan);
}

/** Dual complete: Settings “View Verification” (read-only). */
export function shouldShowProViewVerification(opts: {
  hasMotoristAccount: boolean;
  hasProAccount: boolean;
  accountType: string | null | undefined;
  primaryAccountType?: string | null;
  userProfile: UserProfile | null | undefined;
  artisan?: Partial<ArtisanVerificationProfile> | null;
}): boolean {
  if (opts.accountType !== "professional") return false;
  if (!isCustomerToProDualPath(opts)) return false;
  return isProLadderDone(opts.userProfile, opts.artisan);
}

function isProLadderDone(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  const merged = artisan
    ? applyCustomerTiersToArtisan(
        artisan as ArtisanVerificationProfile,
        profile
      )
    : null;
  return isProVerificationLadderComplete(merged || artisan, {
    phoneOk: proT1Satisfied(profile, artisan),
  });
}

export function proT1Satisfied(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  if (customerHasT1(profile)) return true;
  if (artisan?.tiers?.tier1_phone) return true;
  return false;
}

/**
 * Dual lower panel done only when full ladder complete (T1–T4).
 * After Care T2, panel advances to T3/T4 instead of dismissing.
 */
export function isProSwitchMandatoryOnboardingDone(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  if (!proT1Satisfied(profile, artisan)) return false;
  return isProLadderDone(profile, artisan);
}

/** Label for lower-panel header from next open tier. */
export function proSetupSheetTitle(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): string {
  const merged = artisan
    ? applyCustomerTiersToArtisan(
        artisan as ArtisanVerificationProfile,
        profile
      )
    : artisan;
  const step = nextProEmbedTierStep(merged, {
    hidePhone: proT1Satisfied(profile, artisan),
    hideGovId: proT2CareApproved(profile, artisan),
  });
  switch (step) {
    case "phone":
      return "Complete Tier 1 setup for Repair Pro";
    case "gov_id":
      return "Complete Tier 2 setup for Repair Pro";
    case "liveness":
    case "bvn":
      return "Complete Tier 3 setup for Repair Pro";
    case "skill":
      return "Complete Tier 4 setup for Repair Pro";
    default:
      return "Repair Pro verification complete";
  }
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
