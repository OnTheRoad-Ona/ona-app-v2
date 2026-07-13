import type { AccountType } from "@/lib/types";

/**
 * Cross-account identity registry (local demo store).
 * Prevents the same phone, email, NIN, or BVN from being used
 * on two different accounts (Motorist or Repair Pro).
 */

const REGISTRY_KEY = "oga-mecho-account-registry";

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
  | { ok: true }
  | { ok: false; field: IdentityConflictField; message: string };

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
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
 * Check whether identity fields are free.
 * @param excludeId — allow updating the same account (e.g. re-login)
 */
export function checkIdentityAvailable(
  input: {
    phone: string;
    email: string;
    nin?: string;
    bvn?: string;
  },
  excludeId?: string
): IdentityCheckResult {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const nin = input.nin ? normalizeNin(input.nin) : "";
  const bvn = input.bvn ? normalizeBvn(input.bvn) : "";

  if (phone.length < 10) {
    return {
      ok: false,
      field: "phone",
      message: "Enter a valid phone number (at least 10 digits).",
    };
  }
  if (!email.includes("@")) {
    return {
      ok: false,
      field: "email",
      message: "Enter a valid email address.",
    };
  }

  const list = readRegistry().filter((c) => c.id !== excludeId);

  for (const c of list) {
    if (normalizePhone(c.phone) === phone) {
      return {
        ok: false,
        field: "phone",
        message: `This phone number is already registered as a ${
          c.accountType === "professional" ? "Repair Pro" : "Motorist"
        }. Use a different number.`,
      };
    }
    if (normalizeEmail(c.email) === email) {
      return {
        ok: false,
        field: "email",
        message: `This email is already registered as a ${
          c.accountType === "professional" ? "Repair Pro" : "Motorist"
        }. Use a different email.`,
      };
    }
    if (nin && c.nin && normalizeNin(c.nin) === nin) {
      return {
        ok: false,
        field: "nin",
        message: `This NIN is already linked to a ${
          c.accountType === "professional" ? "Repair Pro" : "Motorist"
        } account. One NIN cannot open two accounts.`,
      };
    }
    if (bvn && c.bvn && normalizeBvn(c.bvn) === bvn) {
      return {
        ok: false,
        field: "bvn",
        message: `This BVN is already linked to a ${
          c.accountType === "professional" ? "Repair Pro" : "Motorist"
        } account. One BVN cannot open two accounts.`,
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
    },
    claim.id
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
