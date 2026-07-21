/**
 * Service area helpers for artisan onboarding.
 * Countries / states / cities: country-state-city
 * Nigeria LGAs: nigeria-state-lga-data
 */

import { City, Country, State } from "country-state-city";
import {
  getLgas as getNgLgasRaw,
  getStates as getNgStatesRaw,
} from "nigeria-state-lga-data";

export type GeoOption = { code: string; name: string };

export function countryName(iso: string): string {
  try {
    return Country.getCountryByCode(iso.toUpperCase())?.name || iso;
  } catch {
    return iso;
  }
}

/** Prefer signup identity country, else phone dial inference default NG */
export function resolveSignupCountryIso(
  identityCountryIso?: string | null,
  fallback = "NG"
): string {
  const c = (identityCountryIso || fallback || "NG").toUpperCase();
  return Country.getCountryByCode(c) ? c : "NG";
}

export function listStates(countryIso: string): GeoOption[] {
  const iso = countryIso.toUpperCase();
  try {
    return State.getStatesOfCountry(iso)
      .map((s) => ({ code: s.isoCode, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function findStateCode(
  countryIso: string,
  stateName: string
): string | null {
  const needle = stateName.trim().toLowerCase();
  const states = listStates(countryIso);
  const exact = states.find((s) => s.name.toLowerCase() === needle);
  if (exact) return exact.code;
  // Fuzzy: "Abuja Federal Capital Territory" ↔ "Federal Capital Territory"
  const fuzzy = states.find(
    (s) =>
      s.name.toLowerCase().includes(needle) ||
      needle.includes(s.name.toLowerCase()) ||
      (needle.includes("abuja") && s.name.toLowerCase().includes("abuja")) ||
      (needle.includes("federal capital") &&
        s.name.toLowerCase().includes("federal capital"))
  );
  return fuzzy?.code ?? null;
}

/**
 * All cities for a state in any country (country-state-city dataset).
 * Falls back to country-wide cities when state code is missing / empty.
 */
export function listCities(
  countryIso: string,
  stateName: string
): string[] {
  const iso = countryIso.toUpperCase();
  try {
    const code = findStateCode(iso, stateName);
    let cities: string[] = [];
    if (code) {
      cities = (City.getCitiesOfState(iso, code) || [])
        .map((c) => c.name)
        .filter(Boolean);
    }
    // Some countries return empty for a state — fall back to full country list
    if (cities.length === 0) {
      cities = (City.getCitiesOfCountry(iso) || [])
        .map((c) => c.name)
        .filter(Boolean);
    }
    return Array.from(new Set(cities)).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Every city in a country (no state filter) — for search / edge cases */
export function listCitiesOfCountry(countryIso: string): string[] {
  const iso = countryIso.toUpperCase();
  try {
    return Array.from(
      new Set(
        (City.getCitiesOfCountry(iso) || [])
          .map((c) => c.name)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Map CSC state names → nigeria-state-lga-data names */
function normalizeNgStateName(name: string): string {
  const n = name.trim();
  if (/abuja|federal capital/i.test(n)) return "Federal Capital Territory";
  return n.replace(/\s+State$/i, "").trim();
}

export function supportsLga(countryIso: string): boolean {
  return countryIso.toUpperCase() === "NG";
}

export function listLgas(
  countryIso: string,
  stateName: string
): string[] {
  if (!supportsLga(countryIso) || !stateName) return [];
  const key = normalizeNgStateName(stateName);
  try {
    // Package expects exact state names from getStates()
    const states: string[] = getNgStatesRaw();
    const match =
      states.find((s) => s.toLowerCase() === key.toLowerCase()) ||
      states.find((s) => key.toLowerCase().includes(s.toLowerCase())) ||
      states.find((s) => s.toLowerCase().includes(key.toLowerCase()));
    if (!match) return [];
    const lgas: string[] = getNgLgasRaw(match) || [];
    return Array.from(new Set(lgas)).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export const ARTISAN_STEP_KEY = "ona-artisan-onboarding-step";
