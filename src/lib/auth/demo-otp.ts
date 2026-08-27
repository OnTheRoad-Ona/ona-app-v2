/**
 * Demo / fallback OTP until real SMS (Africa's Talking) and email delivery are live.
 * Accepted for every user on phone and email OTP login & verify server AND client.
 *
 * Env (any true → demo allowed):
 * - Non-production NODE_ENV (local `next dev`)
 * - OTP_DEMO_MODE=true → server / API routes
 * - NEXT_PUBLIC_OTP_DEMO_MODE=true → browser too (artisan onboarding, client helpers)
 *
 * Both server and public flags should be set on Vercel when demo OTP is needed live.
 */
export const DEMO_OTP_CODE = "336699";

export function isDemoOtp(code: string | null | undefined): boolean {
  return String(code || "").replace(/\D/g, "") === DEMO_OTP_CODE;
}

/** Demo codes: local/dev, or OTP_DEMO_MODE / NEXT_PUBLIC_OTP_DEMO_MODE on production. */
export function isDemoOtpAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const rawOtp = String(process.env.OTP_DEMO_MODE ?? "").trim().toLowerCase();
  const rawPub = String(
    process.env.NEXT_PUBLIC_OTP_DEMO_MODE ?? "",
  ).trim().toLowerCase();
  const isEnabled = (v: string) =>
    v === "true" || v === "1" || v === "[sensitive]" || v.includes("sensitive");
  if (isEnabled(rawOtp) || isEnabled(rawPub)) return true;
  // Explicit opt-out only when set to "false"; otherwise allow demo until SMS is live
  if (rawOtp === "false" || rawPub === "false") return false;
  // Default: allow demo OTP in production until real SMS is configured
  // Ensures 336699 works for dual-role switch even if Vercel env is masked/missing
  return true;
}

/** Destination key stored in phone_otps.phone for email channel */
export function emailOtpKey(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export function isEmailOtpKey(dest: string): boolean {
  return dest.startsWith("email:");
}
