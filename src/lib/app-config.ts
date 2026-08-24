/**
 * Controllable app config source of truth for Super Admin backend.
 * Defaults match current Ona behaviour; DB overrides via app_settings.
 */

import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from "@/lib/matching";

export type AppSection = {
  name: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  defaultTheme: "light" | "dark";
  forceTheme: "light" | "dark" | null;
};

export type FeaturesSection = {
  signupMotorist: boolean;
  signupPro: boolean;
  mapsLive: boolean;
  paymentsEnabled: boolean;
  chatEnabled: boolean;
  reviewsEnabled: boolean;
  bookingsEnabled: boolean;
  proOnlineToggle: boolean;
  identityVerifyEnabled: boolean;
};

export type MatchingSection = {
  maxRadiusKm: number;
  defaultRadiusKm: number;
  maxTechnicians: number;
  minRatingFilter: number;
};

export type VerificationSection = {
  /** @deprecated count-based; use trialDays */
  warnFrom: number;
  /** @deprecated count-based; use trialDays */
  blockAt: number;
  /** Free booking days from first request (Tier 1) until Tier 2 */
  trialDays: number;
  requireNin: boolean;
  requireBvn: boolean;
};

/**
 * Whitelist-override for one sidebar row (see src/lib/nav-schema.ts).
 * The compiled nav defines which rows exist; the backend may only hide,
 * reorder, or relabel known rows. Unknown ids are ignored by the app.
 */
export type MenuItemOverride = {
  hidden?: boolean;
  order?: number;
  label?: string;
};

export type ContentSection = {
  homeSearchPlaceholder: string;
  requestProblems: string[];
  homeBanner: string;
  loginSubtitle: string;
  /** App display name override (soft brand) */
  appTitle?: string;
  /** Motorist sidebar overrides (hide / reorder / relabel known rows) */
  mainMenuOverrides?: Record<string, MenuItemOverride>;
  /** Pro sidebar overrides */
  proMenuOverrides?: Record<string, MenuItemOverride>;
  /** Extra marketing / empty-state strings */
  strings?: Record<string, string>;
};

export type ServicesSection = {
  enabled: string[];
  labels: Record<string, string>;
};

export type AppConfig = {
  app: AppSection;
  features: FeaturesSection;
  matching: MatchingSection;
  verification: VerificationSection;
  content: ContentSection;
  services: ServicesSection;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  app: {
    name: "Ona",
    tagline: "Help for your car when you need it",
    supportEmail: "witcowavers@gmail.com",
    supportPhone: "",
    maintenanceMode: false,
    maintenanceMessage: "Ona is updating. Please try again in a short while.",
    defaultTheme: "light",
    forceTheme: null,
  },
  features: {
    signupMotorist: true,
    signupPro: true,
    mapsLive: true,
    paymentsEnabled: true,
    chatEnabled: true,
    reviewsEnabled: true,
    bookingsEnabled: true,
    proOnlineToggle: true,
    identityVerifyEnabled: true,
  },
  matching: {
    maxRadiusKm: MAX_RADIUS_KM,
    defaultRadiusKm: DEFAULT_RADIUS_KM,
    maxTechnicians: 50,
    minRatingFilter: 0,
  },
  verification: {
    warnFrom: 1,
    blockAt: 31,
    /** 30 free days from first request (Tier 1 phone only) */
    trialDays: 30,
    requireNin: true,
    requireBvn: true,
  },
  content: {
    homeSearchPlaceholder: "Search problem, repair person or service...",
    requestProblems: [
      "Flat tyre or puncture",
      "Engine problem",
      "Battery dead",
      "Brake problem",
      "Car stuck or need towing",
      "Other roadside help",
    ],
    homeBanner: "",
    loginSubtitle: "Car owner and Repair Pro",
    appTitle: "Ona",
    mainMenuOverrides: {},
    proMenuOverrides: {},
    strings: {
      releaseCta: "I am Satisfied · Release",
      disputeCta: "Open a dispute",
      autoReleaseNote: "Auto-releases after 6 hours if no dispute",
    },
  },
  services: {
    enabled: [
      "mechanic",
      "vulcanizer",
      "towing",
      "battery",
      "ac",
      "body",
      "electrical",
      "diagnostics",
      "fashion",
      "plumber",
      "carpenter",
      "painter",
      "solar",
      "generator",
    ],
    labels: {},
  },
};

export const APP_SETTING_KEYS = [
  "app",
  "features",
  "matching",
  "verification",
  "content",
  "services",
] as const;

export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];

export function mergeConfig(
  rows: Array<{ key: string; value: unknown }>,
): AppConfig {
  const base: AppConfig = structuredClone(DEFAULT_APP_CONFIG);
  for (const row of rows) {
    if (!(APP_SETTING_KEYS as readonly string[]).includes(row.key)) continue;
    const key = row.key as AppSettingKey;
    const val = row.value;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      base[key] = { ...base[key], ...(val as object) } as never;
    }
  }
  // Always keep every default trade enabled (union with any DB overrides)
  base.services.enabled = Array.from(
    new Set([
      ...DEFAULT_APP_CONFIG.services.enabled,
      ...(base.services.enabled ?? []),
    ]),
  );
  // Ensure time-based trial exists even if DB still has count-only verification
  if (
    typeof base.verification.trialDays !== "number" ||
    !Number.isFinite(base.verification.trialDays)
  ) {
    base.verification.trialDays = DEFAULT_APP_CONFIG.verification.trialDays;
  }
  // Marketplace radius is hard-capped at 5 km ignore stale DB values above that
  const maxR = Number(base.matching.maxRadiusKm);
  base.matching.maxRadiusKm = Math.min(
    MAX_RADIUS_KM,
    Math.max(1, Number.isFinite(maxR) ? maxR : MAX_RADIUS_KM),
  );
  const defR = Number(base.matching.defaultRadiusKm);
  base.matching.defaultRadiusKm = Math.min(
    MAX_RADIUS_KM,
    Math.max(0.5, Number.isFinite(defR) ? defR : DEFAULT_RADIUS_KM),
  );
  return base;
}

/** In-memory snapshot for non-React code (store, matching). */
let runtimeConfig: AppConfig = structuredClone(DEFAULT_APP_CONFIG);

export function setRuntimeAppConfig(config: AppConfig) {
  runtimeConfig = config;
}

export function getRuntimeAppConfig(): AppConfig {
  return runtimeConfig;
}
