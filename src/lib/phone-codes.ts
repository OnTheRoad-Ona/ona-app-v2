/**
 * International dial codes for all countries (Nigeria first).
 * Built from country-state-city.
 */

import { Country } from "country-state-city";

export type PhoneCodeOption = {
  iso: string;
  name: string;
  /** Digits only, no + */
  dial: string;
  /** Display e.g. +234 */
  label: string;
};

let _cache: PhoneCodeOption[] | null = null;

function normalizeDial(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function getPhoneCodeOptions(): PhoneCodeOption[] {
  if (_cache) return _cache;
  const all = Country.getAllCountries();
  const mapped = all
    .map((c) => {
      const dial = normalizeDial(c.phonecode || "");
      if (!dial) return null;
      return {
        iso: c.isoCode,
        name: c.name,
        dial,
        label: `+${dial}`,
      } satisfies PhoneCodeOption;
    })
    .filter((x): x is PhoneCodeOption => x != null);

  // Dedupe by dial+iso, Nigeria first, then A–Z by name
  const nigeria = mapped.filter((c) => c.iso === "NG");
  const rest = mapped
    .filter((c) => c.iso !== "NG")
    .sort((a, b) => a.name.localeCompare(b.name));

  _cache = [...nigeria, ...rest];
  return _cache;
}

export const DEFAULT_PHONE_ISO = "NG";
export const DEFAULT_PHONE_DIAL = "234";

export function dialForIso(iso: string): string {
  const hit = getPhoneCodeOptions().find((c) => c.iso === iso);
  return hit?.dial ?? DEFAULT_PHONE_DIAL;
}

/** Combine country dial + national number → E.164-ish storage string. */
export function formatInternationalPhone(
  dial: string,
  national: string
): string {
  const d = normalizeDial(dial);
  let n = national.replace(/\D/g, "");
  // Drop leading 0 on national numbers (common in NG, UK, etc.)
  if (n.startsWith("0")) n = n.slice(1);
  return `+${d}${n}`;
}
