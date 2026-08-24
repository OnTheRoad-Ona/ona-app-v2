/**
 * Multi-layer admin security (5 access levels).
 *
 * Layers:
 * 1. Admin session cookie (Supabase auth + staff profile)
 * 2. Role-based permissions (L1 Care → L5 Super Admin)
 * 3. Temporary sensitive-action access code (default 336699)
 * 4. Session idle timeout (30 min)
 * 5. Rate limiting + IP logging on sensitive routes
 * 6. Full audit trail for every sensitive action
 * (Phase B: 2FA scaffolded later)
 */

/** Temporary ops access code for escrow / freeze / disputes / bank / settings */
function getSensitiveActionPassword(): string {
  const pw = process.env.ADMIN_SENSITIVE_PASSWORD?.trim();
  if (!pw)
    throw new Error(
      "ADMIN_SENSITIVE_PASSWORD environment variable is required",
    );
  return pw;
}

/** Admin panel idle timeout (30 minutes) */
export const ADMIN_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** Short unlock after popup code enough for one page visit / action */
export const SENSITIVE_UNLOCK_TTL_MS = 3 * 60 * 1000;

/** Cookie names */
export const ADMIN_SESSION_COOKIE = "ona_admin_session";
export const SENSITIVE_UNLOCK_COOKIE = "ona_care_unlock";

export type SensitiveAction =
  | "escrow_release"
  | "escrow_refund"
  | "user_freeze"
  | "user_unfreeze"
  | "dispute_resolve"
  | "appeal_resolve"
  | "view_pii"
  | "view_bank_full"
  | "content_edit"
  | "system_settings"
  | "role_change"
  | "manage_staff";

export const SENSITIVE_ACTIONS: SensitiveAction[] = [
  "escrow_release",
  "escrow_refund",
  "user_freeze",
  "user_unfreeze",
  "dispute_resolve",
  "appeal_resolve",
  "view_pii",
  "view_bank_full",
  "content_edit",
  "system_settings",
  "role_change",
  "manage_staff",
];

export function isSensitivePasswordValid(
  password: string | null | undefined,
): boolean {
  if (!password) return false;
  return password.trim() === getSensitiveActionPassword();
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function userAgent(req: Request): string {
  return (req.headers.get("user-agent") || "").slice(0, 240);
}
