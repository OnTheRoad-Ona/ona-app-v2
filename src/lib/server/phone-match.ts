import { normalizeNgPhone } from "@/lib/server/africastalking";

/**
 * Canonical phone for storage + login compare (E.164-ish +234…).
 */
export function canonicalPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return normalizeNgPhone(String(raw).trim());
}

/** True when two numbers are the same account after normalization. */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = canonicalPhone(a);
  const nb = canonicalPhone(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * PostgREST OR filter variants so we still find rows stored as 080… / 234… / +234…
 * Final match must always use phonesMatch — never pick an arbitrary OR hit.
 */
export function phoneLookupVariants(e164: string): string[] {
  const phone = canonicalPhone(e164);
  if (!phone) return [];
  const local0 = phone.startsWith("+234")
    ? `0${phone.slice(4)}`
    : phone.startsWith("+")
      ? phone.slice(1)
      : phone;
  const bare = phone.replace(/\D/g, "");
  const barePlus = bare.startsWith("+") ? bare : `+${bare}`;
  return Array.from(new Set([phone, local0, bare, barePlus].filter(Boolean)));
}

export function phoneOrFilter(e164: string): string {
  return phoneLookupVariants(e164)
    .map((v) => `phone.eq.${v}`)
    .join(",");
}
