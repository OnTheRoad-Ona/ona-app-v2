import type { AccountType } from "@/lib/types";

/**
 * Cross-account identity registry (local demo store).
 *
 * Phone, email, NIN, and BVN may each match:
 *   • one Motorist account, and
 *   • one Repair Pro account
 * at the same time (same person can run both).
 * They cannot match two Motorist accounts or two Repair Pro accounts.
 */

const REGISTRY_KEY = "ona-account-registry";

export type IdentityClaim = {
  id: string;
  accountType: AccountType;
  phone: string;
  email: string;
  nin?: string;
  bvn?: string;
  fullName: string;
  createdAt: string;
};

export type IdentityConflictField = "phone" | "email" | "nin" | "bvn";

export type IdentityCheckResult =
  { ok: true } | { ok: false; field: IdentityConflictField; message: string };

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

function accountLabel(type: AccountType): string {
  return type === "professional" ? "Repair Pro" : "Customer";
}

/** Normalize NG phone for comparison (strip country code / leading 0). */
export function normalizePhone(phone: string): string {
  let d = digitsOnly(phone);
  if (d.startsWith("234") && d.length >= 13) d = d.slice(3);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeNin(nin: string): string {
  return digitsOnly(nin);
}

export function normalizeBvn(bvn: string): string {
  return digitsOnly(bvn);
}

/** Nigeria NIN is exactly 11 digits. */
export function isValidNinFormat(nin: string): boolean {
  return normalizeNin(nin).length === 11;
}

/** Nigeria BVN is exactly 11 digits. */
export function isValidBvnFormat(bvn: string): boolean {
  return normalizeBvn(bvn).length === 11;
}

export const IDENTITY_RULE_COPY =
  "One person can hold Customer and Repair Pro with the same phone, email, NIN and BVN. You cannot open two Customer accounts or two Repair Pro accounts.";

export function readRegistry(): IdentityClaim[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IdentityClaim[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRegistry(list: IdentityClaim[]) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Check whether identity fields are free for this account type.
 * Same phone/email/NIN/BVN may exist once as Customer and once as Repair Pro.
 */
export function checkIdentityAvailable(
  input: {
    phone: string;
    email: string;
    nin?: string;
    bvn?: string;
    accountType: AccountType;
  },
  excludeId?: string,
): IdentityCheckResult {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const nin = input.nin ? normalizeNin(input.nin) : "";
  const bvn = input.bvn ? normalizeBvn(input.bvn) : "";
  const type = input.accountType;
  const label = accountLabel(type);

  if (phone.length < 10) {
    return {
      ok: false,
      field: "phone",
      message: "Enter a correct phone number (at least 10 digits).",
    };
  }
  if (!email.includes("@") || email.length < 5) {
    return {
      ok: false,
      field: "email",
      message: "Enter a correct email address.",
    };
  }
  if (input.nin && input.nin.trim() && !isValidNinFormat(input.nin)) {
    return {
      ok: false,
      field: "nin",
      message: "NIN must be 11 numbers only.",
    };
  }
  if (input.bvn && input.bvn.trim() && !isValidBvnFormat(input.bvn)) {
    return {
      ok: false,
      field: "bvn",
      message: "BVN must be 11 numbers only.",
    };
  }

  // Only compare against the same account type (motorist vs motorist, pro vs pro)
  const list = readRegistry().filter(
    (c) => c.id !== excludeId && c.accountType === type,
  );

  for (const c of list) {
    if (normalizePhone(c.phone) === phone) {
      return {
        ok: false,
        field: "phone",
        message: `This phone is already used on a ${label} account. Use another number or log in instead.`,
      };
    }
    if (normalizeEmail(c.email) === email) {
      return {
        ok: false,
        field: "email",
        message: `This email is already used on a ${label} account. Use another email or log in instead.`,
      };
    }
    if (nin && c.nin && normalizeNin(c.nin) === nin) {
      return {
        ok: false,
        field: "nin",
        message: `This NIN is already used on a ${label} account.`,
      };
    }
    if (bvn && c.bvn && normalizeBvn(c.bvn) === bvn) {
      return {
        ok: false,
        field: "bvn",
        message: `This BVN is already used on a ${label} account.`,
      };
    }
  }

  return { ok: true };
}

export function registerIdentity(claim: IdentityClaim): IdentityCheckResult {
  const check = checkIdentityAvailable(
    {
      phone: claim.phone,
      email: claim.email,
      nin: claim.nin,
      bvn: claim.bvn,
      accountType: claim.accountType,
    },
    claim.id,
  );
  if (!check.ok) return check;

  const list = readRegistry().filter((c) => c.id !== claim.id);
  list.push({
    ...claim,
    phone: normalizePhone(claim.phone),
    email: normalizeEmail(claim.email),
    nin: claim.nin ? normalizeNin(claim.nin) : undefined,
    bvn: claim.bvn ? normalizeBvn(claim.bvn) : undefined,
  });
  writeRegistry(list);
  return { ok: true };
}

export function unregisterIdentity(id: string) {
  writeRegistry(readRegistry().filter((c) => c.id !== id));
}
