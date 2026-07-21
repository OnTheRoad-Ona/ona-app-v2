/**
 * Controllable app config — source of truth for Super Admin backend.
 * Defaults match current OgaMecho behaviour; DB overrides via app_settings.
 */

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
  warnFrom: number;
  blockAt: number;
  requireNin: boolean;
  requireBvn: boolean;
};

export type ContentSection = {
  homeSearchPlaceholder: string;
  requestProblems: string[];
  homeBanner: string;
  loginSubtitle: string;
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
    supportEmail: "support@ogamecho.com",
    supportPhone: "",
    maintenanceMode: false,
    maintenanceMessage:
      "Ona is updating. Please try again in a short while.",
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
    maxRadiusKm: 10,
    defaultRadiusKm: 5,
    maxTechnicians: 50,
    minRatingFilter: 0,
  },
  verification: {
    warnFrom: 3,
    /** 7th request blocked → 6 free with phone-only (Tier 1) */
    blockAt: 7,
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
      "wash",
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
  rows: Array<{ key: string; value: unknown }>
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
    ])
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
