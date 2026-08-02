/**
 * Nigeria bank details for escrow refunds (customer) and payouts (pro).
 * Flutterwave: bank code = account_bank on transfers / bank refunds.
 */

import type { UserProfile } from "@/lib/types";

export type BankOption = { name: string; code: string };

/** Offline / API-down fallback (Flutterwave-style codes) */
export const NG_BANKS: BankOption[] = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Globus Bank", code: "00103" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Opay", code: "999992" },
  { name: "PalmPay", code: "999991" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Suntrust Bank", code: "100" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "VFD Microfinance Bank", code: "566" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

function normalizeBankCode(code: string): string {
  return String(code || "").trim();
}

export function bankNameForCode(
  code: string | null | undefined,
  list: BankOption[] = NG_BANKS
): string {
  const c = normalizeBankCode(code || "");
  if (!c) return "";
  const exact = list.find((b) => normalizeBankCode(b.code) === c);
  if (exact) return exact.name;
  // Some lists pad codes differently (e.g. 057 vs 57)
  const stripped = c.replace(/^0+/, "") || c;
  const loose = list.find((b) => {
    const bc = normalizeBankCode(b.code);
    return bc === c || (bc.replace(/^0+/, "") || bc) === stripped;
  });
  return loose?.name || "";
}

export function bankCodeForName(
  name: string | null | undefined,
  list: BankOption[] = NG_BANKS
): string {
  const n = (name || "").trim().toLowerCase();
  if (!n) return "";
  const exact = list.find((b) => b.name.toLowerCase() === n);
  if (exact) return exact.code;
  const partial = list.find(
    (b) =>
      b.name.toLowerCase().includes(n) || n.includes(b.name.toLowerCase())
  );
  return partial?.code || "";
}

export function hasCompleteBankDetails(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile) return false;
  const name = (profile.bankAccountName || "").trim();
  const num = (profile.bankAccountNumber || "").replace(/\D/g, "");
  const code = (profile.bankCode || "").trim();
  const bank =
    (profile.bankName || "").trim() || bankNameForCode(code);
  return Boolean(bank && name && num.length === 10 && code);
}

/**
 * Any signed-in user with incomplete bank — lower panel (not full-app block).
 * Code is auto-filled when they select a bank from Flutterwave list.
 */
export function requiresBankSetup(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile) return false;
  return !hasCompleteBankDetails(profile);
}

/** Titles / noise ignored when matching signup vs bank account name */
const NAME_NOISE = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "prof",
  "sir",
  "eng",
  "chief",
  "alhaji",
  "alhaja",
  "barr",
  "hon",
  "jr",
  "sr",
  "ii",
  "iii",
]);

/** Split a person name into comparable tokens (min 2 letters). */
export function nameTokens(full: string | null | undefined): string[] {
  return String(full || "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !NAME_NOISE.has(t));
}

/**
 * Bank account name must share at least 2 name parts with signup full name
 * (or all parts if signup has fewer than 2 names).
 */
export function bankAccountMatchesSignupName(
  bankAccountName: string | null | undefined,
  signupFullName: string | null | undefined
): { ok: true; matches: number } | { ok: false; matches: number; error: string } {
  const signup = nameTokens(signupFullName);
  const bank = nameTokens(bankAccountName);
  if (!signup.length) {
    return {
      ok: false,
      matches: 0,
      error: "Your signup name is missing. Update your profile name first.",
    };
  }
  if (!bank.length) {
    return {
      ok: false,
      matches: 0,
      error: "Account name is required.",
    };
  }

  let matches = 0;
  const usedBank = new Set<number>();
  for (const s of signup) {
    const idx = bank.findIndex(
      (b, i) =>
        !usedBank.has(i) &&
        (b === s || (s.length >= 3 && b.startsWith(s)) || (b.length >= 3 && s.startsWith(b)))
    );
    if (idx >= 0) {
      matches += 1;
      usedBank.add(idx);
    }
  }

  const required = Math.min(2, signup.length);
  if (matches < required) {
    return {
      ok: false,
      matches,
      error:
        required >= 2
          ? "Bank name on file must match at least 2 parts of your Ona name."
          : "Bank name on file must match your Ona name.",
    };
  }
  return { ok: true, matches };
}

export function validateBankDetailsInput(
  input: {
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankCode?: string;
  },
  list: BankOption[] = NG_BANKS,
  /** Signup full name — bank account name must match ≥2 parts */
  signupFullName?: string | null
): string | null {
  const code = (input.bankCode || "").trim();
  const bank =
    (input.bankName || "").trim() || bankNameForCode(code, list);
  const name = (input.bankAccountName || "").trim();
  const num = (input.bankAccountNumber || "").replace(/\D/g, "");
  if (!code) return "Pick your bank. The bank code fills itself.";
  if (!bank) return "Bank name is required.";
  if (!name) return "Account name is required.";
  if (num.length !== 10) return "Account number must be 10 digits.";
  if (signupFullName != null && String(signupFullName).trim()) {
    const match = bankAccountMatchesSignupName(name, signupFullName);
    if (!match.ok) return match.error;
  }
  return null;
}

/** Client: load banks for a country (geo-fenced Flutterwave list). */
export async function fetchCountryBanks(
  countryIso: string = "NG"
): Promise<{
  banks: BankOption[];
  source: string;
  country: string;
}> {
  const iso = (countryIso || "NG").toUpperCase().slice(0, 2);
  try {
    const res = await fetch(
      `/api/payments/banks?country=${encodeURIComponent(iso)}`,
      { cache: "default" }
    );
    const json = (await res.json()) as {
      ok?: boolean;
      data?: { banks?: BankOption[]; source?: string; country?: string };
    };
    if (json?.ok && Array.isArray(json.data?.banks) && json.data.banks.length) {
      return {
        banks: json.data.banks,
        source: json.data.source || "api",
        country: json.data.country || iso,
      };
    }
  } catch {
    /* fallback */
  }
  return {
    banks: iso === "NG" ? NG_BANKS : NG_BANKS,
    source: "static_fallback",
    country: iso,
  };
}

/** @deprecated Prefer fetchCountryBanks — kept for older imports */
export async function fetchNigeriaBanks(): Promise<{
  banks: BankOption[];
  source: string;
}> {
  const r = await fetchCountryBanks("NG");
  return { banks: r.banks, source: r.source };
}

/**
 * Resolve NUBAN account name (like bank apps) via Flutterwave.
 * Requires bank code + 10-digit account number.
 */
/**
 * Client check: is this bank already linked to another Ona user?
 * Server still enforces on save.
 */
export async function checkBankAccountAvailable(input: {
  accountNumber: string;
  bankCode: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountNumber = input.accountNumber.replace(/\D/g, "");
  const bankCode = input.bankCode.trim();
  if (accountNumber.length !== 10 || !bankCode) {
    return { ok: true };
  }
  try {
    let access_token: string | undefined;
    try {
      const { getAppSupabase } = await import("@/lib/supabase/app-client");
      const sb = getAppSupabase();
      if (sb) {
        const { data } = await sb.auth.getSession();
        access_token = data.session?.access_token;
      }
    } catch {
      /* optional */
    }
    const res = await fetch("/api/payments/check-bank-unique", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access_token
          ? {
              Authorization: `Bearer ${access_token}`,
              "x-access-token": access_token,
            }
          : {}),
      },
      body: JSON.stringify({ accountNumber, bankCode, access_token }),
      credentials: "include",
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { available?: boolean };
      error?: { message?: string };
    } | null;
    if (json?.ok && json.data?.available === false) {
      return {
        ok: false,
        error:
          (json.data as { message?: string })?.message ||
          json.error?.message ||
          "This bank is already used on another Ona account.",
      };
    }
    if (json?.ok) return { ok: true };
    // If endpoint fails open for UX; server still blocks save
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

export async function resolveNigeriaAccountName(input: {
  accountNumber: string;
  bankCode: string;
}): Promise<{ ok: true; accountName: string } | { ok: false; error: string }> {
  const accountNumber = input.accountNumber.replace(/\D/g, "");
  const bankCode = input.bankCode.trim();
  if (accountNumber.length !== 10) {
    return { ok: false, error: "Enter a 10-digit account number." };
  }
  if (!bankCode) {
    return { ok: false, error: "Select a bank first." };
  }
  try {
    const { authFetch } = await import("@/lib/api-auth-headers");
    const res = await authFetch("/api/payments/resolve-account", {
      method: "POST",
      body: JSON.stringify({ accountNumber, bankCode }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { accountName?: string };
      error?: { message?: string };
    } | null;
    if (json?.ok && json.data?.accountName) {
      return { ok: true, accountName: String(json.data.accountName).trim() };
    }
    return {
      ok: false,
      error:
        json?.error?.message ||
        "Could not find account name. Check bank and number.",
    };
  } catch {
    return { ok: false, error: "Network error looking up account." };
  }
}
