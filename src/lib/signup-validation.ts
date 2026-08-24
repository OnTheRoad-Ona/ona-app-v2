/**
 * Shared signup field security checks (Motorist + Repair Pro).
 * Field errors are meant to show on blur (when leaving a field), not only on Next.
 */

export type FieldError = string | null;

export function isValidFullName(name: string): boolean {
  return name.trim().length >= 2;
}

/**
 * Email must include @ and a domain with a TLD (e.g. .com, .ng, .org).
 */
export function isValidEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  // user@domain.tld TLD at least 2 letters
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);
}

/**
 * @param emptyOk when true (on blur of empty field), skip "required"
 * until the user has typed something or left a required field intentionally.
 * Use emptyOk=false when field was touched and left empty.
 */
export function emailError(email: string, emptyOk = false): FieldError {
  const e = email.trim();
  if (!e) return emptyOk ? null : "Please enter your email.";
  if (!e.includes("@")) return "Email must have @ (example: name@gmail.com).";
  if (!/\.[a-z]{2,}$/i.test(e)) {
    return "Email must end with something like .com or .ng.";
  }
  if (!isValidEmail(e)) return "Enter a correct email address.";
  return null;
}

/** Digits only, exactly 11 (Nigeria NIN / BVN). */
export function isValidIdDigits(value: string, len = 11): boolean {
  return /^\d+$/.test(value) && value.length === len;
}

/** Optional NIN if provided, digits only, exactly 11. */
export function ninError(nin: string): FieldError {
  if (!nin.trim()) return null;
  if (/[a-zA-Z]/.test(nin)) return "NIN should not have letters.";
  if (/\D/.test(nin)) return "NIN should be numbers only.";
  if (nin.length !== 11) return "NIN must be 11 numbers.";
  return null;
}

/** Optional BVN if provided, digits only, exactly 11. */
export function bvnError(bvn: string): FieldError {
  if (!bvn.trim()) return null;
  if (/[a-zA-Z]/.test(bvn)) return "BVN should not have letters.";
  if (/\D/.test(bvn)) return "BVN should be numbers only.";
  if (bvn.length !== 11) return "BVN must be 11 numbers.";
  return null;
}

export function confirmPasswordError(
  password: string,
  confirm: string,
  emptyOk = false,
): FieldError {
  if (!confirm) return emptyOk ? null : "Type your password again.";
  if (confirm !== password) return "The two passwords are not the same.";
  return null;
}

/**
 * Password: 8+ chars, 1 uppercase, 1 number.
 * Symbols are allowed.
 */
export function passwordError(password: string, emptyOk = false): FieldError {
  if (!password) return emptyOk ? null : "Please create a password.";
  if (password.length < 8) return "Password needs at least 8 characters.";
  if (!/[A-Z]/.test(password)) {
    return "Add at least one capital letter (A to Z).";
  }
  if (!/[0-9]/.test(password)) {
    return "Add at least one number (0 to 9).";
  }
  return null;
}

export function isValidPassword(password: string): boolean {
  return passwordError(password) === null;
}

export function phoneNationalError(
  national: string,
  emptyOk = false,
): FieldError {
  const d = national.replace(/\D/g, "");
  if (!d) return emptyOk ? null : "Please enter your phone number.";
  if (d.length < 7) return "That phone number looks too short.";
  if (d.length > 15) return "That phone number looks too long.";
  return null;
}

export function fullNameError(name: string, emptyOk = false): FieldError {
  if (!name.trim()) return emptyOk ? null : "Please enter your full name.";
  if (name.trim().length < 2) return "Please enter your full name.";
  return null;
}

export type SignupGender = "male" | "female" | "prefer_not_to_say";

export const SIGNUP_GENDER_OPTIONS: {
  value: SignupGender;
  label: string;
}[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export function genderError(gender: string, emptyOk = false): FieldError {
  if (!gender.trim()) return emptyOk ? null : "Please select your gender.";
  if (!["male", "female", "prefer_not_to_say"].includes(gender)) {
    return "Please select a valid gender option.";
  }
  return null;
}

/** Minimum age for signup (customers + pros). */
export const SIGNUP_MIN_AGE = 16;

/** Local YYYY-MM-DD (avoids UTC day shift from toISOString). */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isValidDob(isoDate: string, minAge = SIGNUP_MIN_AGE): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const dob = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  // Reject rolled calendar dates (e.g. 2020-02-30 → Mar 1)
  const [y, month, day] = isoDate.split("-").map(Number);
  if (
    dob.getFullYear() !== y ||
    dob.getMonth() + 1 !== month ||
    dob.getDate() !== day
  ) {
    return false;
  }
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  if (age < minAge) return false;
  if (age > 120) return false;
  // No future dates
  if (dob.getTime() > today.getTime()) return false;
  return true;
}

export function dobError(
  isoDate: string,
  emptyOk = false,
  minAge = SIGNUP_MIN_AGE,
): FieldError {
  if (!isoDate.trim())
    return emptyOk ? null : "Please enter your date of birth.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "Use a valid date of birth.";
  }
  const dob = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return "Use a valid date of birth.";
  const [y, month, day] = isoDate.split("-").map(Number);
  if (
    dob.getFullYear() !== y ||
    dob.getMonth() + 1 !== month ||
    dob.getDate() !== day
  ) {
    return "Use a valid date of birth.";
  }
  if (dob.getTime() > Date.now())
    return "Date of birth cannot be in the future.";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const mo = today.getMonth() - dob.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < dob.getDate())) age -= 1;
  if (age > 120) return "Use a valid date of birth.";
  if (age < minAge) {
    return `You must be at least ${minAge} years old to sign up.`;
  }
  if (!isValidDob(isoDate, minAge)) {
    return `You must be at least ${minAge} years old to sign up.`;
  }
  return null;
}

export function formatGenderLabel(gender?: string | null): string {
  if (gender === "male") return "Male";
  if (gender === "female") return "Female";
  if (gender === "prefer_not_to_say") return "Prefer not to say";
  return "Not set";
}

/** Always store/display as YYYY-MM-DD (or empty). */
export function normalizeDobIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/** Human-readable DOB for UI (consistent across app + admin). */
export function formatDobLabel(raw: string | null | undefined): string {
  const iso = normalizeDobIso(raw);
  if (!iso) return "Not set";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * Max attribute for date inputs: latest allowed birth date (today − minAge).
 * Prevents picking under-16 dates that would only fail on submit.
 */
export function dobInputMax(minAge = SIGNUP_MIN_AGE): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return localIsoDate(d);
}

/** Min attribute (~120 years ago) for date inputs. */
export function dobInputMin(_minAge = SIGNUP_MIN_AGE): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 120);
  return localIsoDate(d);
}

export type PasswordRuleId = "length" | "upper" | "digit";

export function passwordRules(
  password: string,
): Record<PasswordRuleId, boolean> {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
  };
}
