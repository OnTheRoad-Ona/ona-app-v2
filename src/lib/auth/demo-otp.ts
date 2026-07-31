/**
 * Demo / fallback OTP until real SMS (Africa's Talking) and email delivery are live.
 * Accepted for every user on phone and email OTP login & verify.
 */
export const DEMO_OTP_CODE = "336699";

export function isDemoOtp(code: string | null | undefined): boolean {
  return String(code || "").replace(/\D/g, "") === DEMO_OTP_CODE;
}

/** Demo codes are only acceptable outside production or when explicitly opted in. */
export function isDemoOtpAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.OTP_DEMO_MODE === "true";
}

/** Destination key stored in phone_otps.phone for email channel */
export function emailOtpKey(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

export function isEmailOtpKey(dest: string): boolean {
  return dest.startsWith("email:");
}
