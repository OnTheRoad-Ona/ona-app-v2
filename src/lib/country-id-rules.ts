/**
 * Motorist identity documents by phone-country (ISO 3166-1 alpha-2).
 * Only shows docs that apply to that country. Driver’s licence is one option
 * whose length / charset / photo rules change per country.
 */

import { Country } from "country-state-city";

export type IdDocKind =
  | "national_id"
  | "drivers_licence"
  | "passport"
  | "bank_id"
  | "tax_id"
  | "voters_card"
  | "residence_permit";

export type CharsetMode = "digits" | "alnum" | "alnum_dash" | "any";

export type CountryIdDoc = {
  kind: IdDocKind;
  /** Short plain label for the user */
  label: string;
  /** Needed to finish identity verification for this country */
  requiredForVerify: boolean;
  minLen: number;
  maxLen: number;
  charset: CharsetMode;
  /** Optional regex after charset filter */
  pattern?: RegExp;
  needsFront: boolean;
  needsBack: boolean;
  /** Server check when available */
  api?: "nin" | "bvn" | null;
  placeholder: string;
  /** One-line plain hint */
  hint: string;
};

export type CountryIdPack = {
  iso: string;
  countryName: string;
  docs: CountryIdDoc[];
  /** Simple “how it works” lines (plain English) */
  howItWorks: string[];
};

function nameForIso(iso: string): string {
  try {
    return Country.getCountryByCode(iso)?.name || iso;
  } catch {
    return iso;
  }
}

/** Shared driver’s licence factory rules vary by country */
function driversLicence(opts: {
  minLen: number;
  maxLen: number;
  charset: CharsetMode;
  pattern?: RegExp;
  needsBack?: boolean;
  placeholder?: string;
  hint?: string;
  requiredForVerify?: boolean;
}): CountryIdDoc {
  return {
    kind: "drivers_licence",
    label: "Driver’s licence",
    requiredForVerify: opts.requiredForVerify ?? false,
    minLen: opts.minLen,
    maxLen: opts.maxLen,
    charset: opts.charset,
    pattern: opts.pattern,
    needsFront: true,
    needsBack: opts.needsBack ?? true,
    api: null,
    placeholder: opts.placeholder || "Licence number",
    hint:
      opts.hint ||
      "Use the licence for the same country as your phone number. Photo of front and back.",
  };
}

function passportDoc(required = false): CountryIdDoc {
  return {
    kind: "passport",
    label: "International passport",
    requiredForVerify: required,
    minLen: 6,
    maxLen: 12,
    charset: "alnum",
    needsFront: true,
    needsBack: false,
    api: null,
    placeholder: "Passport number",
    hint: "Photo of the main page with your picture and number.",
  };
}

/** Default pack for any country without a special rule set */
function defaultPack(iso: string): CountryIdPack {
  const countryName = nameForIso(iso);
  return {
    iso,
    countryName,
    docs: [
      {
        kind: "national_id",
        label: "National ID",
        requiredForVerify: true,
        minLen: 5,
        maxLen: 20,
        charset: "alnum_dash",
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "ID number",
        hint: `Government ID issued in ${countryName}. Photos of front and back.`,
      },
      driversLicence({
        minLen: 5,
        maxLen: 20,
        charset: "alnum_dash",
        needsBack: true,
      }),
      passportDoc(false),
    ],
    howItWorks: [
      "We use the country on your phone number.",
      "Pick an ID that is valid in that country only.",
      "Type the number carefully, then add clear photos.",
      "If your country uses a bank ID, we may ask for that too.",
      "When checks pass, you can book without limits.",
    ],
  };
}

/** Country-specific packs (only documents that apply there) */
const OVERRIDES: Record<string, () => CountryIdPack> = {
  NG: () => ({
    iso: "NG",
    countryName: "Nigeria",
    docs: [
      {
        kind: "national_id",
        label: "NIN",
        requiredForVerify: true,
        minLen: 11,
        maxLen: 11,
        charset: "digits",
        needsFront: true,
        needsBack: false,
        api: "nin",
        placeholder: "11-digit NIN",
        hint: "National Identification Number from NIMC.",
      },
      {
        kind: "bank_id",
        label: "BVN",
        requiredForVerify: true,
        minLen: 11,
        maxLen: 11,
        charset: "digits",
        needsFront: false,
        needsBack: false,
        api: "bvn",
        placeholder: "11-digit BVN",
        hint: "Bank Verification Number linked to your bank account.",
      },
      driversLicence({
        minLen: 5,
        maxLen: 20,
        charset: "alnum_dash",
        needsBack: true,
        placeholder: "e.g. ABC12345AA12",
        hint: "Nigerian driver’s licence number. Front and back photos.",
      }),
      {
        kind: "voters_card",
        label: "Voter’s card",
        requiredForVerify: false,
        minLen: 8,
        maxLen: 20,
        charset: "alnum",
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "VIN / card number",
        hint: "INEC permanent voter’s card.",
      },
      passportDoc(false),
    ],
    howItWorks: [
      "Your phone is a Nigerian number, so we use Nigerian IDs only.",
      "NIN and BVN are required to finish verification.",
      "You can also add a driver’s licence or passport.",
      "We check the numbers, then you can book without limits.",
    ],
  }),

  GH: () => ({
    iso: "GH",
    countryName: "Ghana",
    docs: [
      {
        kind: "national_id",
        label: "Ghana Card",
        requiredForVerify: true,
        minLen: 10,
        maxLen: 15,
        charset: "alnum_dash",
        pattern: /^GHA-\d{9}-\d$/i,
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "GHA-XXXXXXXXX-X",
        hint: "Ghana Card number. Front and back photos.",
      },
      driversLicence({
        minLen: 6,
        maxLen: 16,
        charset: "alnum",
        needsBack: true,
      }),
      passportDoc(false),
    ],
    howItWorks: [
      "Your phone is a Ghana number, so we use Ghana IDs only.",
      "Ghana Card is required. Licence or passport is optional.",
      "Add clear photos of the front and back where asked.",
      "When checks pass, you can book without limits.",
    ],
  }),

  KE: () => ({
    iso: "KE",
    countryName: "Kenya",
    docs: [
      {
        kind: "national_id",
        label: "National ID",
        requiredForVerify: true,
        minLen: 6,
        maxLen: 10,
        charset: "digits",
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "ID number",
        hint: "Kenyan national ID. Front and back photos.",
      },
      driversLicence({
        minLen: 6,
        maxLen: 12,
        charset: "alnum",
        needsBack: true,
      }),
      passportDoc(false),
    ],
    howItWorks: [
      "Your phone is a Kenya number, so we use Kenyan IDs only.",
      "National ID is required. Licence or passport is optional.",
      "When checks pass, you can book without limits.",
    ],
  }),

  ZA: () => ({
    iso: "ZA",
    countryName: "South Africa",
    docs: [
      {
        kind: "national_id",
        label: "SA ID number",
        requiredForVerify: true,
        minLen: 13,
        maxLen: 13,
        charset: "digits",
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "13-digit ID",
        hint: "South African green barcoded ID or Smart ID number.",
      },
      driversLicence({
        minLen: 8,
        maxLen: 16,
        charset: "alnum",
        needsBack: true,
      }),
      passportDoc(false),
    ],
    howItWorks: [
      "Your phone is a South Africa number, so we use SA IDs only.",
      "Your 13-digit ID number is required.",
      "When checks pass, you can book without limits.",
    ],
  }),

  US: () => ({
    iso: "US",
    countryName: "United States",
    docs: [
      driversLicence({
        minLen: 5,
        maxLen: 20,
        charset: "alnum_dash",
        needsBack: true,
        requiredForVerify: true,
        placeholder: "Licence number",
        hint: "State driver’s licence. Front and back photos.",
      }),
      {
        kind: "national_id",
        label: "State ID",
        requiredForVerify: false,
        minLen: 5,
        maxLen: 20,
        charset: "alnum_dash",
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "State ID number",
        hint: "Non-driver state ID card.",
      },
      passportDoc(false),
      {
        kind: "tax_id",
        label: "SSN (last 4 only)",
        requiredForVerify: false,
        minLen: 4,
        maxLen: 4,
        charset: "digits",
        needsFront: false,
        needsBack: false,
        api: null,
        placeholder: "Last 4 digits",
        hint: "Optional. We only store the last 4 digits.",
      },
    ],
    howItWorks: [
      "Your phone is a US number, so we use US IDs only.",
      "A driver’s licence (or state ID / passport) is used to verify you.",
      "Upload clear front and back photos of the card.",
      "When checks pass, you can book without limits.",
    ],
  }),

  GB: () => ({
    iso: "GB",
    countryName: "United Kingdom",
    docs: [
      driversLicence({
        minLen: 16,
        maxLen: 18,
        charset: "alnum",
        needsBack: true,
        requiredForVerify: true,
        placeholder: "Driving licence number",
        hint: "UK photocard driving licence. Front and back.",
      }),
      passportDoc(false),
      {
        kind: "national_id",
        label: "National Insurance (optional)",
        requiredForVerify: false,
        minLen: 9,
        maxLen: 9,
        charset: "alnum",
        needsFront: false,
        needsBack: false,
        api: null,
        placeholder: "QQ123456C",
        hint: "Optional National Insurance number.",
      },
    ],
    howItWorks: [
      "Your phone is a UK number, so we use UK documents only.",
      "Driving licence or passport is used to verify you.",
      "When checks pass, you can book without limits.",
    ],
  }),

  CA: () => ({
    iso: "CA",
    countryName: "Canada",
    docs: [
      driversLicence({
        minLen: 5,
        maxLen: 20,
        charset: "alnum_dash",
        needsBack: true,
        requiredForVerify: true,
      }),
      passportDoc(false),
      {
        kind: "tax_id",
        label: "SIN (last 4 only)",
        requiredForVerify: false,
        minLen: 4,
        maxLen: 4,
        charset: "digits",
        needsFront: false,
        needsBack: false,
        api: null,
        placeholder: "Last 4 digits",
        hint: "Optional. We only store the last 4 digits.",
      },
    ],
    howItWorks: [
      "Your phone is a Canada number, so we use Canadian IDs only.",
      "A provincial driver’s licence is the main check.",
      "When checks pass, you can book without limits.",
    ],
  }),

  IN: () => ({
    iso: "IN",
    countryName: "India",
    docs: [
      {
        kind: "national_id",
        label: "Aadhaar",
        requiredForVerify: true,
        minLen: 12,
        maxLen: 12,
        charset: "digits",
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "12-digit Aadhaar",
        hint: "Aadhaar number. Front and back photos of the card.",
      },
      {
        kind: "tax_id",
        label: "PAN",
        requiredForVerify: false,
        minLen: 10,
        maxLen: 10,
        charset: "alnum",
        pattern: /^[A-Z]{5}\d{4}[A-Z]$/i,
        needsFront: true,
        needsBack: false,
        api: null,
        placeholder: "ABCDE1234F",
        hint: "Permanent Account Number card.",
      },
      driversLicence({
        minLen: 8,
        maxLen: 20,
        charset: "alnum",
        needsBack: true,
      }),
      passportDoc(false),
    ],
    howItWorks: [
      "Your phone is an India number, so we use Indian IDs only.",
      "Aadhaar is required. PAN, licence, or passport are optional extras.",
      "When checks pass, you can book without limits.",
    ],
  }),

  AE: () => ({
    iso: "AE",
    countryName: "United Arab Emirates",
    docs: [
      {
        kind: "national_id",
        label: "Emirates ID",
        requiredForVerify: true,
        minLen: 15,
        maxLen: 18,
        charset: "digits",
        needsFront: true,
        needsBack: true,
        api: null,
        placeholder: "784-XXXX-XXXXXXX-X",
        hint: "Emirates ID number. Front and back photos.",
      },
      driversLicence({
        minLen: 6,
        maxLen: 20,
        charset: "alnum",
        needsBack: true,
      }),
      passportDoc(false),
    ],
    howItWorks: [
      "Your phone is a UAE number, so we use UAE documents only.",
      "Emirates ID is required.",
      "When checks pass, you can book without limits.",
    ],
  }),
};

const packCache = new Map<string, CountryIdPack>();

/**
 * Product photo rules (all countries):
 * - Passport + national ID (NIN / Ghana Card / Aadhaar / etc.) → front only
 * - Driver’s licence + voter’s card → front and back
 * - Bank / tax IDs with no photo requirement stay unchanged
 */
export function applyPhotoSideRules(doc: CountryIdDoc): CountryIdDoc {
  if (doc.kind === "drivers_licence" || doc.kind === "voters_card") {
    return {
      ...doc,
      needsFront: true,
      needsBack: true,
      hint:
        doc.hint?.includes("front") || doc.hint?.includes("back")
          ? doc.hint
          : `${doc.hint || doc.label}. Front and back photos.`,
    };
  }
  if (doc.kind === "passport") {
    return {
      ...doc,
      needsFront: true,
      needsBack: false,
      hint: doc.hint || "Photo of the main page with your picture and number.",
    };
  }
  if (doc.kind === "national_id") {
    // Keep number-only national IDs (e.g. UK NI) with no photo slots
    if (!doc.needsFront && !doc.needsBack) return doc;
    return {
      ...doc,
      needsFront: true,
      needsBack: false,
      hint:
        (doc.hint || doc.label)
          .replace(/\s*[Ff]ront and back photos?\.?/g, "")
          .replace(/\s*[Pp]hotos of front and back\.?/g, "")
          .trim()
          .replace(/\.$/, "") + ". Front photo only.",
    };
  }
  return doc;
}

/** All ISO codes we know (from phone / world list) */
export function getAllCountryIsos(): string[] {
  try {
    return Country.getAllCountries().map((c) => c.isoCode);
  } catch {
    return Object.keys(OVERRIDES);
  }
}

/** ID rules for this phone-country ISO */
export function getCountryIdPack(iso: string): CountryIdPack {
  const code = (iso || "NG").toUpperCase();
  const hit = packCache.get(code);
  if (hit) return hit;
  const build = OVERRIDES[code];
  const raw = build ? build() : defaultPack(code);
  const pack: CountryIdPack = {
    ...raw,
    docs: raw.docs.map(applyPhotoSideRules),
  };
  packCache.set(code, pack);
  return pack;
}

export function getDoc(
  pack: CountryIdPack,
  kind: IdDocKind,
): CountryIdDoc | undefined {
  return pack.docs.find((d) => d.kind === kind);
}

export function requiredDocs(pack: CountryIdPack): CountryIdDoc[] {
  return pack.docs.filter((d) => d.requiredForVerify);
}

/** Filter raw input to allowed characters */
export function filterIdInput(raw: string, doc: CountryIdDoc): string {
  let v = raw;
  switch (doc.charset) {
    case "digits":
      v = v.replace(/\D/g, "");
      break;
    case "alnum":
      v = v.replace(/[^a-zA-Z0-9]/g, "");
      break;
    case "alnum_dash":
      v = v.replace(/[^a-zA-Z0-9\-]/g, "");
      break;
    default:
      break;
  }
  return v.slice(0, doc.maxLen);
}

export type IdFormatResult = { ok: true } | { ok: false; message: string };

export function validateIdFormat(
  value: string,
  doc: CountryIdDoc,
): IdFormatResult {
  const v = value.trim();
  if (!v) {
    return { ok: false, message: `Enter your ${doc.label}.` };
  }
  if (v.length < doc.minLen) {
    return {
      ok: false,
      message: `${doc.label} looks too short (need at least ${doc.minLen} characters).`,
    };
  }
  if (v.length > doc.maxLen) {
    return {
      ok: false,
      message: `${doc.label} looks too long (max ${doc.maxLen} characters).`,
    };
  }
  if (doc.pattern && !doc.pattern.test(v)) {
    return {
      ok: false,
      message: `${doc.label} format looks wrong. Check and try again.`,
    };
  }
  if (doc.charset === "digits" && /^(\d)\1+$/.test(v) && v.length >= 6) {
    return {
      ok: false,
      message: `Enter a real ${doc.label} (not the same digit repeated).`,
    };
  }
  return { ok: true };
}

export function needsPhotos(doc: CountryIdDoc): boolean {
  return doc.needsFront || doc.needsBack;
}
