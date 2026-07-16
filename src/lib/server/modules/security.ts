/**
 * Multi-layer admin / Customer Care security.
 *
 * Layers:
 *  1. Admin session cookie (Supabase auth + profiles.role admin|care)
 *  2. Role-based permissions (super_admin | customer_care | support)
 *  3. Temporary sensitive-action password (default 336699)
 *  4. Session idle timeout
 *  5. Rate limiting + IP logging on sensitive routes
 *  6. Full audit trail for every sensitive action
 */

/** Temporary ops password for escrow / freeze / disputes / PII / settings */
export const SENSITIVE_ACTION_PASSWORD =
  process.env.ADMIN_SENSITIVE_PASSWORD?.trim() || "336699";

/** Admin panel idle timeout (30 minutes) */
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Short unlock after popup password — enough for one page visit / action */
export const SENSITIVE_UNLOCK_TTL_MS = 3 * 60 * 1000;

/** Cookie names */
export const ADMIN_SESSION_COOKIE = "ogamecho_admin_session";
export const SENSITIVE_UNLOCK_COOKIE = "ogamecho_care_unlock";

export type SensitiveAction =
  | "escrow_release"
  | "escrow_refund"
  | "user_freeze"
  | "user_unfreeze"
  | "dispute_resolve"
  | "appeal_resolve"
  | "view_pii"
  | "system_settings"
  | "role_change";

export const SENSITIVE_ACTIONS: SensitiveAction[] = [
  "escrow_release",
  "escrow_refund",
  "user_freeze",
  "user_unfreeze",
  "dispute_resolve",
  "appeal_resolve",
  "view_pii",
  "system_settings",
  "role_change",
];

export function isSensitivePasswordValid(password: string | null | undefined): boolean {
  if (!password) return false;
  return password.trim() === SENSITIVE_ACTION_PASSWORD;
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
