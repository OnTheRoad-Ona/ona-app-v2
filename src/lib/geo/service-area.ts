/**
 * Service area helpers for artisan onboarding.
 * Countries / states: country-state-city (no City the ~8MB dataset)
 * Nigeria LGAs: nigeria-state-lga-data
 */

import { Country, State } from "country-state-city";
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
  fallback = "NG",
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
  stateName: string,
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
        s.name.toLowerCase().includes("federal capital")),
  );
  return fuzzy?.code ?? null;
}

/**
 * Curated major cities / areas per Nigerian state replaces the ~8MB
 * country-state-city city dataset (the app's operating region is Nigeria).
 * Keys are the country-state-city state names used by listStates().
 */
const NG_CITIES_BY_STATE: Readonly<Record<string, readonly string[]>> = {
  Abia: ["Aba", "Umuahia", "Ohafia", "Arochukwu", "Bende", "Uzuakoli"],
  "Abuja Federal Capital Territory": [
    "Garki",
    "Wuse",
    "Gwarinpa",
    "Maitama",
    "Asokoro",
    "Kubwa",
    "Nyanya",
    "Karu",
    "Lugbe",
    "Bwari",
  ],
  Adamawa: ["Yola", "Jimeta", "Mubi", "Numan", "Gombi", "Michika"],
  "Akwa Ibom": ["Uyo", "Eket", "Ikot Ekpene", "Oron", "Abak", "Ikot Abasi"],
  Anambra: ["Onitsha", "Awka", "Nnewi", "Ekwulobia", "Agulu", "Ogidi"],
  Bauchi: ["Bauchi", "Azare", "Misau", "Katagum", "Jama'are"],
  Bayelsa: ["Yenagoa", "Sagbama", "Brass", "Ogbia", "Nembe"],
  Benue: ["Makurdi", "Otukpo", "Gboko", "Katsina-Ala", "Vandeikya"],
  Borno: ["Maiduguri", "Bama", "Biu", "Gwoza", "Dikwa"],
  "Cross River": ["Calabar", "Ugep", "Ogoja", "Ikom", "Obudu"],
  Delta: ["Asaba", "Warri", "Effurun", "Sapele", "Ughelli", "Agbor"],
  Ebonyi: ["Abakaliki", "Afikpo", "Onueke", "Ishielu", "Ezzamgbo"],
  Edo: ["Benin City", "Ekpoma", "Auchi", "Uromi", "Irrua", "Ubiaja"],
  Ekiti: ["Ado-Ekiti", "Ikere", "Ijero", "Ise-Ekiti", "Aramoko"],
  Enugu: ["Enugu", "Nsukka", "Awgu", "Udi", "Oji River", "Ezeagu"],
  Gombe: ["Gombe", "Kumo", "Billiri", "Dukku", "Bajoga"],
  Imo: ["Owerri", "Orlu", "Okigwe", "Oguta", "Mbaise"],
  Jigawa: ["Dutse", "Hadejia", "Gumel", "Birnin Kudu", "Kazaure"],
  Kaduna: ["Kaduna", "Zaria", "Kafanchan", "Saminaka", "Birnin Gwari"],
  Kano: ["Kano", "Wudil", "Rano", "Gaya", "Bichi", "Dambatta"],
  Katsina: ["Katsina", "Funtua", "Daura", "Malumfashi", "Dutsin-Ma"],
  Kebbi: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru", "Jega"],
  Kogi: ["Lokoja", "Okene", "Idah", "Kabba", "Ankpa", "Anyigba"],
  Kwara: ["Ilorin", "Offa", "Omu-Aran", "Ijagbo", "Patigi"],
  Lagos: [
    "Ikeja",
    "Victoria Island",
    "Lekki",
    "Ajah",
    "Surulere",
    "Yaba",
    "Maryland",
    "Gbagada",
    "Ikoyi",
    "Festac",
    "Alimosho",
    "Epe",
    "Badagry",
    "Ikorodu",
  ],
  Nasarawa: ["Lafia", "Keffi", "Akwanga", "Karu", "Nasarawa"],
  Niger: ["Minna", "Bida", "Suleja", "Kontagora", "Mokwa", "New Bussa"],
  Ogun: ["Abeokuta", "Ijebu-Ode", "Sango Ota", "Sagamu", "Ilaro", "Ayetoro"],
  Ondo: ["Akure", "Ondo", "Okitipupa", "Owo", "Ikare", "Ore"],
  Osun: ["Osogbo", "Ile-Ife", "Ilesa", "Ede", "Ikirun", "Iwo"],
  Oyo: ["Ibadan", "Oyo", "Ogbomoso", "Iseyin", "Eruwa", "Shaki"],
  Plateau: ["Jos", "Bukuru", "Pankshin", "Shendam", "Vom", "Barkin Ladi"],
  Rivers: ["Port Harcourt", "Obio-Akpor", "Eleme", "Ahoada", "Bonny", "Omoku"],
  Sokoto: ["Sokoto", "Tambuwal", "Gwadabawa", "Wurno", "Rabah"],
  Taraba: ["Jalingo", "Wukari", "Bali", "Mutum-Biyu", "Takum"],
  Yobe: ["Damaturu", "Potiskum", "Gashua", "Nguru", "Geidam"],
  Zamfara: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka", "Bakura"],
};

/** Map a picked state label to a canonical curated-list key (NG only). */
function canonicalNgStateKey(stateName: string): string | null {
  const lower = stateName.trim().toLowerCase();
  if (
    lower === "fct" ||
    lower === "federal capital territory" ||
    lower === "abuja" ||
    lower === "abuja federal capital territory"
  ) {
    return "Abuja Federal Capital Territory";
  }
  const stripped = stateName
    .replace(/\s+State$/i, "")
    .trim()
    .toLowerCase();
  return (
    Object.keys(NG_CITIES_BY_STATE).find(
      (k) => k.toLowerCase() === lower || k.toLowerCase() === stripped,
    ) ?? null
  );
}

/** All curated cities across Nigeria (search / edge cases). */
function allNgCities(): string[] {
  return Array.from(new Set(Object.values(NG_CITIES_BY_STATE).flat()));
}

/**
 * Curated cities for a Nigerian state (the app's operating region).
 * Other countries return [] the full country-state-city dataset is not
 * bundled. Falls back to the full curated list when the state is unknown.
 */
export function listCities(countryIso: string, stateName: string): string[] {
  if (countryIso.toUpperCase() !== "NG" || !stateName) return [];
  const key = canonicalNgStateKey(stateName);
  const cities = key ? (NG_CITIES_BY_STATE[key] ?? []) : [];
  const source = cities.length ? cities : allNgCities();
  return Array.from(new Set(source)).sort((a, b) => a.localeCompare(b));
}

/** Every curated city in Nigeria (no state filter) other countries: [] */
export function listCitiesOfCountry(countryIso: string): string[] {
  if (countryIso.toUpperCase() !== "NG") return [];
  return allNgCities().sort((a, b) => a.localeCompare(b));
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

export function listLgas(countryIso: string, stateName: string): string[] {
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
