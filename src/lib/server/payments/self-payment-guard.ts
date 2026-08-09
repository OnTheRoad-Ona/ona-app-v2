/**
 * Anti self-payment guard.
 * A Repair Pro can never be paid for their own job — if the payer (motorist)
 * and the payout recipient (repair pro) share the identity name *and*
 * matching BVN/NIN, the payment must be rejected before any session is created.
 */

export interface IdentityCheck {
  /** Normalized full name from profiles.full_name */
  fullName: string;
  /** Last-4 of NIN (or null if not verified) */
  ninLast4: string | null;
  /** Last-4 of BVN (or null if not verified) */
  bvnLast4: string | null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * True when two accounts are run by the same person: same name AND both the
 * BVN and NIN match. A name alone is not enough — it must be corroborated by
 * identity numbers to reduce false positives.
 */
export function isSamePerson(
  motorist: IdentityCheck | null | undefined,
  pro: IdentityCheck | null | undefined
): boolean {
  if (!motorist || !pro) return false;

  const sameName =
    normalizeName(motorist.fullName || "") ===
      normalizeName(pro.fullName || "") && normalizeName(motorist.fullName) !== "";

  // Both identity numbers must be present and equal.
  const sameNin =
    Boolean(motorist.ninLast4) &&
    motorist.ninLast4 === pro.ninLast4;
  const sameBvn =
    Boolean(motorist.bvnLast4) &&
    motorist.bvnLast4 === pro.bvnLast4;

  return sameName && sameNin && sameBvn;
}