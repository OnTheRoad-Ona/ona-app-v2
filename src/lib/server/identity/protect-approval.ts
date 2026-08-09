/**
 * Permanent protection for Care-approved T2 verification.
 *
 * Rules:
 * - Once Customer or Pro T2 is approved, client re-submit / skill / profile
 *   patches MUST NOT demote review status or verified flags.
 * - Only Care may demote: reject → rejected, or request_resubmit → none + needs_resubmit.
 * - Dual-role mirror may only upgrade (or re-assert) approved, never demote.
 *
 * DB triggers (migration 052) enforce the same rules so bulk transfer/import
 * cannot wipe approvals either.
 */

export type ProApprovalRow = {
  status?: string | null;
  gov_id_review_status?: string | null;
  verified?: boolean | null;
  nin_verified?: boolean | null;
  bvn_verified?: boolean | null;
  tier2_approved_at?: string | null;
  pipeline_status?: string | null;
  rejection_reason?: string | null;
  pipeline_notes?: string | null;
  docs_status?: string | null;
};

export type MotoristApprovalRow = {
  identity_review_status?: string | null;
  identity_verified_at?: string | null;
  nin_verified?: boolean | null;
  bvn_verified?: boolean | null;
};

function lc(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

/** Care explicitly opened a re-submit window (only then may client re-enter review). */
export function isCareResubmitOpen(row: {
  pipeline_status?: string | null;
  rejection_reason?: string | null;
  pipeline_notes?: string | null;
  identity_review_status?: string | null;
  identity_rejection_reason?: string | null;
}): boolean {
  if (lc(row.pipeline_status) === "needs_resubmit") return true;
  if (/re-?\s*submit/i.test(String(row.rejection_reason || ""))) return true;
  if (/re-?\s*submit/i.test(String(row.pipeline_notes || ""))) return true;
  if (/re-?\s*submit/i.test(String(row.identity_rejection_reason || "")))
    return true;
  // Rejected ID is allowed to re-submit for a new Care review
  if (lc(row.identity_review_status) === "rejected") return true;
  return false;
}

/** Pro T2 (gov ID) is locked after Care approval. */
export function isProT2ApprovedLocked(row: ProApprovalRow | null | undefined): boolean {
  if (!row) return false;
  if (lc(row.gov_id_review_status) === "approved") return true;
  if (Boolean(row.tier2_approved_at) && Boolean(row.verified)) return true;
  if (
    Boolean(row.verified) &&
    Boolean(row.nin_verified) &&
    Boolean(row.bvn_verified) &&
    lc(row.status) === "approved"
  ) {
    return true;
  }
  return false;
}

/** Pro account status is locked as approved (marketplace gate). */
export function isProAccountApprovedLocked(
  row: ProApprovalRow | null | undefined
): boolean {
  if (!row) return false;
  return lc(row.status) === "approved";
}

/** Customer T2 is locked after Care approval. */
export function isMotoristT2ApprovedLocked(
  row: MotoristApprovalRow | null | undefined
): boolean {
  if (!row) return false;
  if (lc(row.identity_review_status) === "approved") return true;
  if (Boolean(row.identity_verified_at) && Boolean(row.nin_verified)) return true;
  return false;
}

const PRO_DEMOTE_KEYS = [
  "gov_id_review_status",
  "gov_id_reviewed_at",
  "nin_verified",
  "bvn_verified",
  "verified",
  "tier2_approved_at",
  "approved_at",
  "rejection_reason",
  "rejected_at",
  "status",
  "visibility_tier",
  "is_new_artisan",
  "pipeline_status",
] as const;

/**
 * Strip / rewrite demotion fields from a client-built pro patch when T2 is locked.
 * Media / skill docs / profile text may still update.
 */
export function protectProClientPatch(
  existing: ProApprovalRow | null | undefined,
  patch: Record<string, unknown>
): {
  patch: Record<string, unknown>;
  locked: boolean;
  preserved: string[];
} {
  const resubmitOpen = isCareResubmitOpen(existing || {});
  const t2Locked = isProT2ApprovedLocked(existing) && !resubmitOpen;
  const accountLocked =
    isProAccountApprovedLocked(existing) && !resubmitOpen;
  const preserved: string[] = [];

  if (!t2Locked && !accountLocked) {
    return { patch, locked: false, preserved };
  }

  const out = { ...patch };

  if (t2Locked) {
    // Never demote T2 from client
    for (const key of [
      "gov_id_review_status",
      "gov_id_reviewed_at",
      "nin_verified",
      "bvn_verified",
      "verified",
      "tier2_approved_at",
      "approved_at",
      "rejection_reason",
      "rejected_at",
    ] as const) {
      if (key in out) {
        delete out[key];
        preserved.push(key);
      }
    }
    // Force re-assert approved stamps so accidental false cannot stick
    out.gov_id_review_status = "approved";
    out.verified = true;
    if (existing?.nin_verified !== false) out.nin_verified = true;
    if (existing?.bvn_verified !== false) out.bvn_verified = true;
    if (existing?.tier2_approved_at) {
      out.tier2_approved_at = existing.tier2_approved_at;
    }
    // Don't push pipeline back to pending_verification over live care state
    if (
      out.pipeline_status === "pending_verification" ||
      out.pipeline_status === "draft"
    ) {
      delete out.pipeline_status;
      preserved.push("pipeline_status");
    }
  }

  if (accountLocked || t2Locked) {
    // Account approved stays approved (skill/docs re-upload must not set pending)
    if (out.status === "pending" || out.status === "draft") {
      out.status = "approved";
      preserved.push("status");
    } else if (!("status" in out) && accountLocked) {
      out.status = "approved";
    }
  }

  // Skill docs: allow under_review without demoting account/T2
  if (out.docs_status === "under_review" && t2Locked) {
    out.status = "approved";
  }

  void PRO_DEMOTE_KEYS;
  return { patch: out, locked: t2Locked || accountLocked, preserved };
}

/**
 * Strip demotion fields from customer identity submit when already approved.
 */
export function protectMotoristClientPatch(
  existing: MotoristApprovalRow | null | undefined,
  patch: Record<string, unknown>,
  opts?: { identityRejectionReason?: string | null }
): {
  patch: Record<string, unknown>;
  locked: boolean;
  preserved: string[];
} {
  const resubmitOpen = isCareResubmitOpen({
    identity_review_status: existing?.identity_review_status,
    identity_rejection_reason: opts?.identityRejectionReason,
  });
  const locked = isMotoristT2ApprovedLocked(existing) && !resubmitOpen;
  const preserved: string[] = [];
  if (!locked) return { patch, locked: false, preserved };

  const out = { ...patch };
  for (const key of [
    "identity_review_status",
    "identity_verified_at",
    "identity_reviewed_at",
    "identity_reviewed_by",
    "identity_rejection_reason",
    "nin_verified",
    "bvn_verified",
  ] as const) {
    if (key in out) {
      delete out[key];
      preserved.push(key);
    }
  }
  out.identity_review_status = "approved";
  out.nin_verified = true;
  if (existing?.bvn_verified) out.bvn_verified = true;
  if (existing?.identity_verified_at) {
    out.identity_verified_at = existing.identity_verified_at;
  } else {
    out.identity_verified_at = new Date().toISOString();
  }
  // Keep prior review stamp if present
  return { patch: out, locked: true, preserved };
}
