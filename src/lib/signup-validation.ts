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
  // user@domain.tld — TLD at least 2 letters
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);
}

/**
 * @param emptyOk — when true (on blur of empty field), skip "required"
 *   until the user has typed something or left a required field intentionally.
 *   Use emptyOk=false when field was touched and left empty.
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

/** Optional NIN — if provided, digits only, exactly 11. */
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
  emptyOk = false
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
  emptyOk = false
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

export type PasswordRuleId = "length" | "upper" | "digit";

export function passwordRules(
  password: string
): Record<PasswordRuleId, boolean> {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
  };
}
