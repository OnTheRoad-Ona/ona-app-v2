/**
 * Customer → Repair Pro (Tap to Switch) onboarding rules.
 *
 * - Carry Customer T1 (phone) + T2 (gov ID approved) so Pro is not re-asked.
 * - Force remaining Pro setup in a 60% bottom panel until T2 is satisfied
 *   (from Customer or completed as Pro).
 * - Settings → Verification for dual C→Pro only after T2 is done.
 */

import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import { isGovIdComplete } from "@/lib/artisan/verification-order";
import {
  isIdentityVerified,
  isPhoneVerified,
} from "@/lib/verification-gate";
import type { UserProfile } from "@/lib/types";

/** Customer Tier 1 = phone OTP verified on identity */
export function customerHasT1(
  profile: UserProfile | null | undefined
): boolean {
  return isPhoneVerified(profile);
}

/** Customer Tier 2 = government ID approved by Care */
export function customerHasT2(
  profile: UserProfile | null | undefined
): boolean {
  return isIdentityVerified(profile);
}

/**
 * Dual-role path: had / has Customer + acting (or switching) as Pro.
 * Used to scope Settings Verification visibility.
 */
export function isCustomerToProDualPath(opts: {
  hasMotoristAccount: boolean;
  hasProAccount: boolean;
  accountType: string | null | undefined;
  primaryAccountType?: string | null;
}): boolean {
  if (!opts.hasMotoristAccount) return false;
  if (opts.accountType === "professional") return true;
  // Primary was customer, later added pro
  if (
    opts.hasProAccount &&
    (opts.primaryAccountType === "motorist" || !opts.primaryAccountType)
  ) {
    return true;
  }
  return opts.hasProAccount && opts.hasMotoristAccount;
}

/** Whether Pro should see Settings → Verification (C→Pro dual only after T2). */
export function shouldShowProSettingsVerification(opts: {
  hasMotoristAccount: boolean;
  hasProAccount: boolean;
  accountType: string | null | undefined;
  primaryAccountType?: string | null;
  userProfile: UserProfile | null | undefined;
  artisan?: Partial<ArtisanVerificationProfile> | null;
}): boolean {
  const isPro = opts.accountType === "professional";
  if (!isPro) return true; // Customer uses Verification for their own tiers

  const dual = isCustomerToProDualPath(opts);
  if (!dual) {
    // Pure Pro signup — keep Verification available for their ladder
    return true;
  }
  // Tap-to-switch Customer → Pro: only after T2 done (customer or pro)
  return proT2Satisfied(opts.userProfile, opts.artisan);
}

/** T2 satisfied from Customer identity or Pro artisan gov-id path */
export function proT2Satisfied(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  if (customerHasT2(profile)) return true;
  if (artisan && isGovIdComplete(artisan)) return true;
  if (profile?.govIdVerified && profile.identityReviewStatus === "approved") {
    return true;
  }
  // Pro nin/gov flags from switch payload
  if (profile?.ninVerified && profile?.govIdVerified) return true;
  return false;
}

/** T1 satisfied from Customer or artisan phone tier */
export function proT1Satisfied(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  if (customerHasT1(profile)) return true;
  if (artisan?.tiers?.tier1_phone) return true;
  return false;
}

/**
 * Mandatory bottom-sheet onboarding after C→Pro switch is done when T2 is
 * satisfied (inherited or completed). T3/T4 can continue in Settings later.
 */
export function isProSwitchMandatoryOnboardingDone(
  profile: UserProfile | null | undefined,
  artisan?: Partial<ArtisanVerificationProfile> | null
): boolean {
  return proT1Satisfied(profile, artisan) && proT2Satisfied(profile, artisan);
}

/** Apply Customer T1/T2 onto artisan local profile so UI skips those steps */
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
