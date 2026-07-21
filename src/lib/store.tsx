"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_USER_LOCATION,
  LAST_GPS_KEY,
} from "@/lib/data/technicians";
import { registerIdentity } from "@/lib/account-registry";
import {
  DEFAULT_RADIUS_KM,
  filterAndRankTechnicians,
  MAX_RADIUS_KM,
} from "@/lib/matching";
import {
  getVaultProfile,
  LEGACY_PROFILE_KEY,
  readProfilesVault,
  saveProfileToVault,
} from "@/lib/profiles-vault";
import { isExperienceUnset } from "@/lib/profile-system";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import type {
  AccountType,
  AppFilters,
  Booking,
  ChatMessage,
  MessageThread,
  ProService,
  RegisteredAs,
  ServiceCategory,
  ServiceRequest,
  Technician,
  UserLocation,
  UserMode,
  UserProfile,
} from "@/lib/types";
import { getRuntimeAppConfig } from "@/lib/app-config";
import { resetNavStack } from "@/lib/navigation";
import { playAppSound } from "@/lib/sound-tone";
import { evaluateServiceGate } from "@/lib/verification-gate";
import {
  backendCreateJob,
  backendEnsureConversation,
  backendFetchConversations,
  backendFetchJobsForUser,
  backendFetchPros,
  backendGetProOnline,
  backendGetSessionUserId,
  backendLoadUserProfile,
  backendMarkMessagesRead,
  backendSendMessage,
  backendSetProOnline,
  backendDualRoleFlags,
  backendSaveIdentityVerification,
  backendUpdateProfile,
  backendSendPhoneOtp,
  backendSignIn,
  backendSignInWithPhoneOtp,
  backendLogout,
  backendSignOut,
  backendSignUp,
  backendSwitchRole,
  backendSubscribeJobs,
  backendUpdateJobStatus,
  isAppBackendOnline,
} from "@/lib/supabase/app-api";
import { isSpecialtyPickerTrade } from "@/lib/artisan/catalog";
import { getVehiclesServedLock } from "@/lib/profile-edit";
import { playPersonTone } from "@/lib/sound-tone";
import { haversineKm } from "@/lib/supabase/mappers";

/** Result of book (motorist) or accept (pro) with progressive verification. */
export type ServiceActionResult =
  | {
      ok: true;
      request?: ServiceRequest;
      warning: string | null;
      actionCount: number;
    }
  | {
      ok: false;
      code: "verification_required" | "not_found" | "invalid" | "skill_mismatch";
      message: string;
      actionCount: number;
    };

export type AppTheme = "light" | "dark";

const ROLE_KEY = "oga-mecho-role";
const SERVICES_KEY = "oga-mecho-pro-services";
const MODE_KEY = "oga-mecho-mode";
const AUTH_KEY = "oga-mecho-auth";
const AUTH_NAME_KEY = "oga-mecho-auth-name";
const AUTH_ACCOUNT_KEY = "oga-mecho-account-type";
/** Original signup role — never overwritten by Motorist ↔ Pro switch */
const PRIMARY_ACCOUNT_KEY = "oga-mecho-primary-account";
const PROFILE_KEY = LEGACY_PROFILE_KEY;

function readStoredPrimaryAccount(): AccountType | null {
  try {
    const v = localStorage.getItem(PRIMARY_ACCOUNT_KEY);
    if (v === "motorist" || v === "professional") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredPrimaryAccount(type: AccountType) {
  try {
    localStorage.setItem(PRIMARY_ACCOUNT_KEY, type);
  } catch {
    /* ignore */
  }
}

/** Public directory id for the signed-in Repair Pro (motorists can open this profile). */
export const SELF_PRO_TECH_ID = "pro-self";

function isRegisteredAs(v: string | null): v is RegisteredAs {
  return v === "client" || (v != null && isProService(v));
}

/** Map a Repair Pro UserProfile into a directory Technician card. */
export function profileToTechnician(profile: UserProfile): Technician | null {
  if (profile.accountType !== "professional") return null;
  const services = (profile.services ?? []).filter(isProService);
  const primary = services[0] ?? "mechanic";
  const name = profile.fullName.trim() || "Repair Professional";
  const short =
    name.split(/\s+/).length >= 2
      ? `${name.split(/\s+/)[0]} ${name.split(/\s+/).at(-1)?.[0] ?? ""}.`
      : name;
  const label = PRO_SERVICE_LABELS[primary] ?? "Repair Pro";
  const brand = profile.servedBrand || profile.servedMake;
  const focusBits = [
    profile.servedVehicleType,
    brand && brand !== "Any" ? brand : null,
    profile.servedModel && profile.servedModel !== "Any"
      ? profile.servedModel
      : null,
    profile.servedCountry && profile.servedCountry !== "Any"
      ? profile.servedCountry
      : null,
  ].filter(Boolean);
  const focusLine =
    focusBits.length > 0
      ? `Serves ${focusBits.join(" · ")}.`
      : "Roadside repair professional.";
  const specialtyAns = profile.skillAnswers?.specialties;
  const specialtiesFromSignup = Array.isArray(specialtyAns)
    ? specialtyAns.filter((s): s is string => typeof s === "string")
    : typeof specialtyAns === "string"
      ? [specialtyAns]
      : [];
  return {
    id: SELF_PRO_TECH_ID,
    name,
    shortName: short,
    serviceType: primary,
    roleLabel: label,
    photo: profile.avatarUrl || "/technicians/t1.jpg",
    rating: profile.averageRating ?? 5,
    reviewCount: profile.jobsCompleted ?? 0,
    jobsCompleted: profile.jobsCompleted ?? 0,
    distanceKm: 0.2,
    etaMinutes: 6,
    status: "available",
    verified: Boolean(
      profile.inPersonVerified ||
        (profile.ninVerified && profile.bvnVerified)
    ),
    fastResponse: true,
    specialties:
      specialtiesFromSignup.length > 0
        ? specialtiesFromSignup
        : [PRO_SERVICE_LABELS[primary] ?? primary],
    description:
      profile.bio?.trim() ||
      `${focusLine} Based in ${[profile.area, profile.city].filter(Boolean).join(", ") || "Lagos"}.`,
    phone: profile.phone || "+234 800 000 0000",
    serviceRadiusKm:
      profile.docsStatus === "under_review" ||
      profile.docsStatus === "rejected"
        ? Math.min(profile.serviceRadiusKm ?? 8, 2)
        : profile.serviceRadiusKm ?? 8,
    location: DEFAULT_USER_LOCATION.coordinates,
    markerLabel: "You",
    responseSpeedScore: 0.95,
    currentLoad: 0,
    servedVehicleType: profile.servedVehicleType,
    servedBrand: profile.servedBrand || profile.servedMake,
    servedMake: profile.servedBrand || profile.servedMake,
    servedModel: profile.servedModel,
    servedCountry: profile.servedCountry,
    servedLocation: profile.servedLocation ?? profile.area,
    businessName: profile.businessName,
    yearsExperience: profile.yearsExperience,
    bio: profile.bio,
    servicePrices: profile.servicePrices,
    pricingCurrency: profile.pricingCurrency,
    docsStatus: profile.docsStatus,
    docsRatingBoostApplied: profile.docsRatingBoostApplied,
    skillAnswers: profile.skillAnswers,
  };
}

interface AppState {
  theme: AppTheme;
  toggleTheme: () => void;
  setTheme: (t: AppTheme) => void;
  /** Ready after localStorage role hydrate */
  roleReady: boolean;
  /** Auth + role hydrate finished */
  authReady: boolean;
  isAuthenticated: boolean;
  /** Supabase auth user id when online */
  backendUserId: string | null;
  displayName: string;
  accountType: AccountType | null;
  /**
   * Main account = role they originally signed up as.
   * Stays fixed when switching Motorist ↔ Repair Pro.
   */
  primaryAccountType: AccountType | null;
  /** Full signup profile (persisted) */
  userProfile: UserProfile | null;
  /** What user registered as — drives first open screen */
  registeredAs: RegisteredAs;
  /** Current Client vs Professional view */
  userMode: UserMode;
  /** All services this pro offers (includes primary registration service) */
  proServices: ProService[];
  setRegisteredAs: (role: RegisteredAs) => void;
  setUserMode: (mode: UserMode) => void;
  /** Dual vault: true if this device has a signed-up Motorist profile */
  hasMotoristAccount: boolean;
  /** Dual vault: true if this device has a signed-up Repair Pro profile */
  hasProAccount: boolean;
  /**
   * Repair Pro Live switch — when true, motorists can find this pro.
   * Synced to repair_pro_profiles.is_online.
   */
  proLive: boolean;
  /** Turn Live/Away on and push is_online to the server. Returns error message if failed. */
  setProLive: (live: boolean) => Promise<string | null>;
  /**
   * Motorist is helping someone else — service pin is the other person's place.
   * Nearby pros and bookings use this meet location.
   */
  helpingSomeoneElse: boolean;
  helpingSomeoneLabel: string | null;
  /** Set meet location for “help someone else” (or clear with null) */
  setHelpingSomeoneElse: (
    next:
      | null
      | {
          label: string;
          coordinates: { lat: number; lng: number };
        }
  ) => void;
  /**
   * Smooth switch Motorist ↔ Repair Pro for the signed-in user (server role flip).
   * Returns null on success, or an error / "needs_login" code.
   */
  switchAccount: (
    type: AccountType
  ) => Promise<null | "needs_signup" | "needs_login" | string>;
  /**
   * Log in with email + password against the dual vault.
   * Optionally prefer a specific account type when both match.
   */
  /** Server-only login. Never opens the app from local vault alone. */
  signInWithPassword: (
    email: string,
    password: string,
    preferType?: AccountType
  ) => Promise<string | null>;
  /** Request SMS OTP (Africa's Talking) for registered phone */
  sendPhoneOtp: (phone: string) => Promise<string | null>;
  /** Verify SMS OTP and open server session */
  signInWithPhoneOtp: (
    phone: string,
    code: string,
    preferType?: AccountType
  ) => Promise<string | null>;
  /** True only when Supabase session + profile are confirmed on the server */
  serverSessionReady: boolean;
  addProService: (service: ProService) => void;
  removeProService: (service: ProService) => void;
  /**
   * Complete Motorist or Repair Pro registration and sign in.
   * Each type is a separate account; one person may register both.
   * Requires live Supabase — fails if the database write does not succeed.
   */
  completeSignup: (profile: UserProfile) => Promise<string | null>;
  /**
   * Post-signup NIN + BVN verification. Unlocks unlimited book/accept.
   * Returns error message or null on success.
   */
  completeIdentityVerification: (input: {
    nin?: string;
    bvn?: string;
    primaryId?: string;
    bankId?: string;
    countryIso?: string;
    govIdKind?: string;
    govIdFrontUrl?: string;
    govIdBackUrl?: string;
    govIdVerified?: boolean;
    bankIdVerified?: boolean;
    mode?: "submit" | "approve";
  }) => Promise<string | null>;
  /** Customer Tier 1 — phone OTP (demo code 336699) */
  verifyCustomerPhoneOtp: (code: string) => Promise<string | null>;
  /**
   * Edit signed-in profile (name, bio, area, vehicles you serve, etc.).
   * Vehicles-you-serve fields may only change every 28 days.
   * Returns error message or null on success.
   */
  updateUserProfile: (
    patch: Partial<UserProfile> & {
      /** When true, patch includes vehicles-served fields (enforces 28-day lock) */
      vehiclesServedChange?: boolean;
    }
  ) => string | null;
  /** Legacy quick login (prefer completeSignup) */
  login: (opts: {
    accountType: AccountType;
    name?: string;
    proService?: ProService;
    proServices?: ProService[];
  }) => void;
  logout: () => void;
  location: UserLocation;
  radiusKm: number;
  category: ServiceCategory;
  /** Motorist specialty pick (Home / Office / …) for plumber etc. */
  specialtyFilter: string | null;
  /**
   * When true, home sheet shows specialty chips instead of radius
   * (plumber / carpenter / painter / solar / generator).
   */
  specialtyPickerOpen: boolean;
  query: string;
  filters: AppFilters;
  selectedTechId: string | null;
  technicians: Technician[];
  visibleTechnicians: Technician[];
  requests: ServiceRequest[];
  bookings: Booking[];
  messages: MessageThread[];
  /** Threads for active role only (motorist vs pro skill) — no mix-up */
  visibleMessageThreads: MessageThread[];
  locationError: string | null;
  isLocating: boolean;
  /** Re-fetch Live Repair Pros only (no location / filter changes) */
  refreshNearbyPros: () => void;
  setRadiusKm: (n: number) => void;
  setCategory: (c: ServiceCategory) => void;
  setSpecialtyFilter: (s: string | null) => void;
  /** Open specialty strip again for current trade (re-tap trade) */
  openSpecialtyPicker: () => void;
  setQuery: (q: string) => void;
  toggleFilter: (key: keyof AppFilters) => void;
  setSelectedTechId: (id: string | null) => void;
  /**
   * Motorist book help — gated after free trial requests.
   * Prefer this over raw createRequest for UI flows.
   */
  bookRequest: (
    tech: Technician,
    problem?: string,
    pricing?: {
      labourBaseMajor: number;
      labourAgreedMajor: number;
      discountPercent: number;
      pricingCurrency: import("@/lib/pricing").AppCurrency;
      negotiationStatus?: ServiceRequest["negotiationStatus"];
    }
  ) => ServiceActionResult;
  /** @deprecated use bookRequest — still creates without gate for internal/demo */
  createRequest: (
    tech: Technician,
    problem?: string,
    pricing?: {
      labourBaseMajor: number;
      labourAgreedMajor: number;
      discountPercent: number;
      pricingCurrency: import("@/lib/pricing").AppCurrency;
      negotiationStatus?: ServiceRequest["negotiationStatus"];
    }
  ) => ServiceRequest;
  /**
   * Pro accept (or other status). Accept is gated by verification funnel.
   * Pros can only accept jobs matching their registered skill.
   */
  updateRequestStatus: (
    id: string,
    status: ServiceRequest["status"]
  ) => ServiceActionResult;
  ensureChatForRequest: (req: ServiceRequest) => string;
  /**
   * Ensure cloud conversation exists and return the real conversation UUID
   * (required so both parties see each other's messages).
   */
  ensureChatForRequestAsync: (req: ServiceRequest) => Promise<string>;
  /** Re-fetch messages from server (other party + multi-device). */
  refreshCloudChats: () => void;
  sendChatMessage: (
    threadId: string,
    text: string,
    voice?: {
      url: string;
      durationSec?: number;
      mime?: string;
    } | null
  ) => void;
  /** Opened a chat — clear unread badge + persist read_at on server */
  markThreadRead: (threadId: string) => void;
  retryLocation: () => void;
  setManualLocation: (
    label: string,
    coords?: { lat: number; lng: number }
  ) => void;
}

const defaultFilters: AppFilters = {
  nearest: true,
  rating45: false,
  availableNow: false,
  verified: false,
  fastResponse: false,
};

const AppContext = createContext<AppState | null>(null);

function systemTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Default follows OS; may be overridden by double-click (stored)
  const [theme, setThemeState] = useState<AppTheme>("light");
  const [themeReady, setThemeReady] = useState(false);
  /** Device-level theme fallback when no account is active */
  const DEVICE_THEME_KEY = "oga-mecho-theme";
  const themeKeyForUser = (userId: string | null | undefined) =>
    userId ? `oga-mecho-theme-user-${userId}` : DEVICE_THEME_KEY;

  // Role / mode — registration drives first open
  const [roleReady, setRoleReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [displayName, setDisplayName] = useState("Guest");
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [primaryAccountType, setPrimaryAccountType] =
    useState<AccountType | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [registeredAs, setRegisteredAsState] = useState<RegisteredAs>("client");
  const [userMode, setUserModeState] = useState<UserMode>("client");
  const [proServices, setProServicesState] = useState<ProService[]>([]);
  const [hasMotoristAccount, setHasMotoristAccount] = useState(false);
  const [hasProAccount, setHasProAccount] = useState(false);
  /** Live = visible to motorists; Away = hidden (stays on until pro turns it off) */
  const [proLive, setProLiveState] = useState(false);
  const [helpingSomeoneElse, setHelpingSomeoneElseState] = useState(false);
  const [helpingSomeoneLabel, setHelpingSomeoneLabel] = useState<string | null>(
    null
  );
  const ownLocationBackup = useRef<UserLocation | null>(null);
  /** User manually pinned a place — don't overwrite with GPS until Retry */
  const manualPinRef = useRef(false);

  const [location, setLocation] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_USER_LOCATION;
    try {
      const raw = localStorage.getItem(LAST_GPS_KEY);
      if (!raw) return DEFAULT_USER_LOCATION;
      const p = JSON.parse(raw) as {
        lat?: number;
        lng?: number;
        label?: string;
        city?: string;
      };
      if (
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Math.abs(p.lat) > 0.1 &&
        Math.abs(p.lng) > 0.1
      ) {
        return {
          label: p.label || "Last known location",
          city: p.city || "",
          coordinates: { lat: p.lat, lng: p.lng },
        };
      }
    } catch {
      /* */
    }
    return DEFAULT_USER_LOCATION;
  });
  const [radiusKm, setRadiusKmState] = useState(DEFAULT_RADIUS_KM);
  const [category, setCategoryState] = useState<ServiceCategory>("mechanic");
  const [specialtyFilter, setSpecialtyFilterState] = useState<string | null>(
    null
  );
  const [specialtyPickerOpen, setSpecialtyPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AppFilters>(defaultFilters);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  // Start empty — no demo seed payload on first paint (faster load)
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [bookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<MessageThread[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  /** Live pros from Supabase (null = use demo seed) */
  const [cloudTechs, setCloudTechs] = useState<Technician[] | null>(null);
  /** Supabase auth.users id when backend session is active */
  const [backendUserId, setBackendUserId] = useState<string | null>(null);
  /** True only after server session is checked (and confirmed or cleared) */
  const [serverSessionReady, setServerSessionReady] = useState(false);

  const clearLocalAuth = useCallback(() => {
    setIsAuthenticated(false);
    setBackendUserId(null);
    setDisplayName("Guest");
    setAccountType(null);
    setPrimaryAccountType(null);
    setUserProfile(null);
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_NAME_KEY);
      localStorage.removeItem(AUTH_ACCOUNT_KEY);
      localStorage.removeItem(PRIMARY_ACCOUNT_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Initial: device theme until account session applies personal theme
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DEVICE_THEME_KEY) as AppTheme | null;
      if (saved === "light" || saved === "dark") {
        setThemeState(saved);
      } else {
        setThemeState(systemTheme());
      }
    } catch {
      setThemeState(systemTheme());
    }
    setThemeReady(true);
  }, []);

  // Hydrate role prefs from localStorage, then REQUIRE Supabase session for auth
  useEffect(() => {
    let cancelled = false;
    try {
      const rawRole = localStorage.getItem(ROLE_KEY);
      const role: RegisteredAs = isRegisteredAs(rawRole) ? rawRole : "client";
      setRegisteredAsState(role);

      let services: ProService[] = [];
      const rawServices = localStorage.getItem(SERVICES_KEY);
      if (rawServices) {
        try {
          const parsed = JSON.parse(rawServices) as unknown;
          if (Array.isArray(parsed)) {
            services = parsed.filter(isProService);
          }
        } catch {
          /* ignore */
        }
      }
      if (isProService(role) && !services.includes(role)) {
        services = [role, ...services];
      }
      setProServicesState(services);

      const rawMode = localStorage.getItem(MODE_KEY);
      if (rawMode === "client" || rawMode === "professional") {
        setUserModeState(rawMode);
      } else {
        setUserModeState(role === "client" ? "client" : "professional");
      }

      // Vault flags only (do NOT grant homepage access from local auth flag)
      const vault = readProfilesVault();
      setHasMotoristAccount(Boolean(vault.motorist));
      setHasProAccount(Boolean(vault.professional));
    } catch {
      setRegisteredAsState("client");
      setUserModeState("client");
      setProServicesState([]);
    }

    setRoleReady(true);

    // Hard gate: never trust local AUTH_KEY alone — ghosts like "Stephen King"
    // must not open the homepage without a real server session.
    // Cap wait so Supabase hang never leaves the app on a black splash forever.
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      new Promise((resolve, reject) => {
        const t = window.setTimeout(
          () => reject(new Error("session_timeout")),
          ms
        );
        p.then(
          (v) => {
            window.clearTimeout(t);
            resolve(v);
          },
          (e) => {
            window.clearTimeout(t);
            reject(e);
          }
        );
      });

    void (async () => {
      try {
        if (!isAppBackendOnline()) {
          clearLocalAuth();
          return;
        }
        // Tight timeouts + parallel profile/flags so boot is not 8s+8s+6s
        const uid = await withTimeout(backendGetSessionUserId(), 4000);
        if (cancelled) return;
        if (!uid) {
          clearLocalAuth();
          return;
        }
        setBackendUserId(uid);
        applyAccountTheme(uid);

        const [profile, flags] = await Promise.all([
          withTimeout(backendLoadUserProfile(uid), 4500),
          withTimeout(backendDualRoleFlags(uid), 3500).catch(() => ({
            hasMotorist: false,
            hasPro: false,
            primaryAccountType: undefined as AccountType | undefined,
          })),
        ]);
        if (cancelled) return;
        if (!profile) {
          clearLocalAuth();
          await backendSignOut().catch(() => undefined);
          return;
        }
        setHasMotoristAccount(
          flags.hasMotorist ||
            profile.accountType === "motorist" ||
            Boolean(readProfilesVault().motorist)
        );
        setHasProAccount(
          flags.hasPro ||
            profile.accountType === "professional" ||
            Boolean(readProfilesVault().professional)
        );

        // Last switched role (Use as) must survive reload — prefer local active
        // account when dual-role and it differs from server profile.role.
        let sessionProfile: UserProfile = {
          ...profile,
          primaryAccountType:
            profile.primaryAccountType ||
            flags.primaryAccountType ||
            undefined,
        };
        try {
          const preferred = localStorage.getItem(AUTH_ACCOUNT_KEY) as
            | AccountType
            | null;
          const canMotorist =
            flags.hasMotorist ||
            profile.accountType === "motorist" ||
            Boolean(readProfilesVault().motorist);
          const canPro =
            flags.hasPro ||
            profile.accountType === "professional" ||
            Boolean(readProfilesVault().professional);
          if (
            (preferred === "motorist" || preferred === "professional") &&
            preferred !== profile.accountType &&
            ((preferred === "motorist" && canMotorist) ||
              (preferred === "professional" && canPro))
          ) {
            const switched = await withTimeout(
              backendSwitchRole(preferred),
              4500
            ).catch(() => null);
            if (switched?.profile && switched.userId) {
              sessionProfile = {
                ...switched.profile,
                primaryAccountType:
                  switched.primaryAccountType ||
                  switched.profile.primaryAccountType ||
                  sessionProfile.primaryAccountType,
              };
              setBackendUserId(switched.userId);
            } else {
              // Keep last local role so reload still matches last Use as
              sessionProfile = {
                ...sessionProfile,
                accountType: preferred,
              };
            }
          }
        } catch {
          /* keep server profile */
        }
        applySession(sessionProfile);
      } catch {
        if (!cancelled) clearLocalAuth();
      } finally {
        if (!cancelled) {
          setServerSessionReady(true);
          setAuthReady(true);
        }
      }
    })();

    // Absolute safety: never block boot on slow mobile networks / WebViews
    const hardCap = window.setTimeout(() => {
      if (cancelled) return;
      setServerSessionReady(true);
      setAuthReady(true);
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(hardCap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep html[data-theme] + page stage in sync so full app flips light↔dark
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    // Explicit stage so body/html match phone shell outer (opposite themes)
    const stage = theme === "light" ? "#060d0a" : "#0a0605";
    root.style.backgroundColor = stage;
    if (document.body) document.body.style.backgroundColor = stage;
  }, [theme]);

  // Follow OS theme only when no device/account override is stored
  useEffect(() => {
    if (!themeReady) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        const uid = backendUserId;
        const key = themeKeyForUser(uid);
        const saved = localStorage.getItem(key);
        if (saved === "light" || saved === "dark") return;
        if (localStorage.getItem(DEVICE_THEME_KEY)) return;
      } catch {
        /* ignore */
      }
      setThemeState(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeReady, backendUserId]);

  /** Persist theme per logged-in account (+ device fallback). */
  const persistTheme = useCallback(
    (t: AppTheme, userId?: string | null) => {
      const uid = userId !== undefined ? userId : backendUserId;
      try {
        localStorage.setItem(DEVICE_THEME_KEY, t);
        if (uid) localStorage.setItem(themeKeyForUser(uid), t);
      } catch {
        /* ignore */
      }
    },
    [backendUserId]
  );

  const applyAccountTheme = useCallback((userId: string | null | undefined) => {
    try {
      if (userId) {
        const personal = localStorage.getItem(
          themeKeyForUser(userId)
        ) as AppTheme | null;
        if (personal === "light" || personal === "dark") {
          setThemeState(personal);
          return;
        }
      }
      const device = localStorage.getItem(DEVICE_THEME_KEY) as AppTheme | null;
      if (device === "light" || device === "dark") {
        setThemeState(device);
        return;
      }
      setThemeState(systemTheme());
    } catch {
      setThemeState(systemTheme());
    }
  }, []);

  const setTheme = useCallback(
    (t: AppTheme) => {
      setThemeState(t);
      persistTheme(t);
    },
    [persistTheme]
  );

  const toggleTheme = useCallback(() => {
    setThemeState((t) => {
      const next = t === "light" ? "dark" : "light";
      persistTheme(next);
      return next;
    });
  }, [persistTheme]);

  const setRegisteredAs = useCallback((role: RegisteredAs) => {
    setRegisteredAsState(role);
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* ignore */
    }
    if (isProService(role)) {
      setProServicesState((prev) => {
        const next = prev.includes(role) ? prev : [role, ...prev];
        try {
          localStorage.setItem(SERVICES_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      setUserModeState("professional");
      try {
        localStorage.setItem(MODE_KEY, "professional");
      } catch {
        /* ignore */
      }
    } else {
      setUserModeState("client");
      try {
        localStorage.setItem(MODE_KEY, "client");
      } catch {
        /* ignore */
      }
    }
  }, []);

  /** Activate a stored profile as the current session (after signup / switch / login). */
  const applySession = useCallback((profile: UserProfile) => {
    const name = profile.fullName.trim() || "User";
    // Main account = original signup. Prefer server primary, then stored, then
    // existing session primary — never replace a known primary with the active role.
    const storedPrimary = readStoredPrimaryAccount();
    const primary: AccountType =
      profile.primaryAccountType ||
      storedPrimary ||
      primaryAccountType ||
      profile.accountType;
    // Pros: keep only first/primary signup skill; clamp service radius to 10 km
    const proServicesLocked =
      profile.accountType === "professional"
        ? (profile.services ?? []).filter(isProService).slice(0, 1)
        : profile.services;
    const proRadiusLocked =
      profile.accountType === "professional"
        ? Math.min(
            MAX_RADIUS_KM,
            Math.max(1, profile.serviceRadiusKm ?? DEFAULT_RADIUS_KM)
          )
        : profile.serviceRadiusKm;
    const withPrimary: UserProfile = {
      ...profile,
      primaryAccountType: primary,
      ...(profile.accountType === "professional"
        ? {
            services: proServicesLocked?.length
              ? proServicesLocked
              : profile.services,
            serviceRadiusKm: proRadiusLocked,
          }
        : {}),
    };
    setUserProfile(withPrimary);
    setDisplayName(name);
    setAccountType(profile.accountType);
    setPrimaryAccountType(primary);
    setIsAuthenticated(true);
    writeStoredPrimaryAccount(primary);

    // Load this account's personal theme (full app theme per user)
    const uid = profile.identityId || null;
    if (uid) applyAccountTheme(uid);

    try {
      localStorage.setItem(AUTH_KEY, "1");
      localStorage.setItem(AUTH_NAME_KEY, name);
      localStorage.setItem(AUTH_ACCOUNT_KEY, profile.accountType);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(withPrimary));
    } catch {
      /* ignore */
    }

    if (profile.accountType === "motorist") {
      setRegisteredAsState("client");
      setUserModeState("client");
      try {
        localStorage.setItem(MODE_KEY, "client");
        localStorage.setItem(ROLE_KEY, "client");
      } catch {
        /* ignore */
      }
    } else {
      const primarySvc =
        (withPrimary.services ?? []).filter(isProService)[0] ?? "mechanic";
      setProServicesState([primarySvc]);
      setRegisteredAsState(primarySvc);
      setUserModeState("professional");
      try {
        localStorage.setItem(MODE_KEY, "professional");
        localStorage.setItem(ROLE_KEY, primarySvc);
        localStorage.setItem(SERVICES_KEY, JSON.stringify([primarySvc]));
      } catch {
        /* ignore */
      }
      setRadiusKmState(
        Math.min(
          MAX_RADIUS_KM,
          Math.max(1, withPrimary.serviceRadiusKm ?? DEFAULT_RADIUS_KM)
        )
      );
    }

    // Profile area is a label only — never overwrite live GPS with a fixed city
    if (profile.area || profile.city) {
      setLocation((prev) => ({
        ...prev,
        label:
          prev.label &&
          prev.label !== "Locating…" &&
          prev.label !== "Current location" &&
          prev.label !== "Last known location"
            ? prev.label
            : [profile.area, profile.city].filter(Boolean).join(", "),
        city: profile.city || profile.area || prev.city,
        // keep real coordinates from GPS / last-known — never force Ikeja
      }));
    }

    const vault = readProfilesVault();
    setHasMotoristAccount(Boolean(vault.motorist));
    setHasProAccount(Boolean(vault.professional));
  }, [applyAccountTheme, primaryAccountType]);

  const switchAccount = useCallback(
    async (
      type: AccountType
    ): Promise<null | "needs_signup" | "needs_login" | string> => {
      if (!backendUserId || !isAuthenticated) {
        return "needs_login";
      }
      if (!isAppBackendOnline()) {
        return "Server is unavailable. Cannot switch right now.";
      }

      // Same type already active — caller navigates; no server call
      if (
        (type === "motorist" && accountType === "motorist") ||
        (type === "professional" && accountType === "professional")
      ) {
        return null;
      }

      // Must have completed signup for the target role (side table on server)
      if (type === "motorist" && !hasMotoristAccount) {
        return "needs_signup";
      }
      if (type === "professional" && !hasProAccount) {
        return "needs_signup";
      }

      const res = await backendSwitchRole(type);
      if (res.error || !res.profile || !res.userId) {
        if (res.error === "needs_signup") {
          return "needs_signup";
        }
        // Do not fake a client-only switch — reload would restore the other role
        return res.error || res.message || "Could not switch account.";
      }

      setBackendUserId(res.userId);
      // Preserve original signup as primary when switching (never use active role)
      const primary: AccountType =
        res.primaryAccountType ||
        res.profile.primaryAccountType ||
        readStoredPrimaryAccount() ||
        primaryAccountType ||
        accountType ||
        "motorist";
      const switched: UserProfile = {
        ...res.profile,
        primaryAccountType: primary,
      };
      saveProfileToVault(switched);
      applySession(switched);
      if (res.hasMotorist != null) setHasMotoristAccount(res.hasMotorist);
      if (res.hasPro != null) setHasProAccount(res.hasPro);
      // Always Away after a role switch — pro must tap Live again
      setProLiveState(false);
      if (backendUserId && isAppBackendOnline()) {
        void backendSetProOnline(backendUserId, false);
      }
      // Fresh nav stack for this role only — Back must not hop to the other role
      resetNavStack(type === "professional" ? "/dashboard" : "/");
      return null;
    },
    [
      applySession,
      isAuthenticated,
      backendUserId,
      accountType,
      primaryAccountType,
      hasMotoristAccount,
      hasProAccount,
    ]
  );

  const setUserMode = useCallback(
    (mode: UserMode) => {
      const target: AccountType =
        mode === "professional" ? "professional" : "motorist";
      void (async () => {
        const result = await switchAccount(target);
        if (result === null) return;
        if (
          (mode === "professional" && accountType === "professional") ||
          (mode === "client" && accountType === "motorist")
        ) {
          setUserModeState(mode);
          try {
            localStorage.setItem(MODE_KEY, mode);
          } catch {
            /* ignore */
          }
        }
      })();
    },
    [switchAccount, accountType]
  );

  const signInWithPassword = useCallback(
    async (
      email: string,
      password: string,
      preferType?: AccountType
    ): Promise<string | null> => {
      if (!isAppBackendOnline()) {
        return "Server is unavailable. Log in requires a live OgaMecho account.";
      }
      if (preferType !== "motorist" && preferType !== "professional") {
        return "Pick Customer or Repair Pro.";
      }
      const res = await backendSignIn(email.trim().toLowerCase(), password);
      if (res.error || !res.profile || !res.userId) {
        return res.error || "Email or password is incorrect.";
      }

      const flags = await backendDualRoleFlags(res.userId).catch(() => ({
        hasMotorist: res.profile!.accountType === "motorist",
        hasPro: res.profile!.accountType === "professional",
        primaryAccountType: res.profile!.primaryAccountType,
      }));
      const hasMotorist =
        flags.hasMotorist || res.profile.accountType === "motorist";
      const hasPro =
        flags.hasPro || res.profile.accountType === "professional";

      if (preferType === "motorist" && !hasMotorist) {
        await backendSignOut().catch(() => undefined);
        return "No Customer account for this login.";
      }
      if (preferType === "professional" && !hasPro) {
        await backendSignOut().catch(() => undefined);
        return "No Repair Pro account for this login.";
      }

      let sessionProfile: UserProfile = {
        ...res.profile,
        primaryAccountType:
          res.profile.primaryAccountType ||
          flags.primaryAccountType ||
          res.profile.accountType,
      };
      let sessionUserId = res.userId;

      // Force session into the role they picked (dual-role safe)
      if (sessionProfile.accountType !== preferType) {
        const switched = await backendSwitchRole(preferType).catch(() => null);
        if (switched?.profile && switched.userId) {
          sessionProfile = {
            ...switched.profile,
            primaryAccountType:
              switched.primaryAccountType ||
              switched.profile.primaryAccountType ||
              sessionProfile.primaryAccountType,
          };
          sessionUserId = switched.userId;
        } else {
          sessionProfile = { ...sessionProfile, accountType: preferType };
        }
      }

      setBackendUserId(sessionUserId);
      saveProfileToVault(sessionProfile);
      applySession(sessionProfile);
      setServerSessionReady(true);
      setHasMotoristAccount(hasMotorist);
      setHasProAccount(hasPro);
      if (flags.primaryAccountType) {
        setPrimaryAccountType(flags.primaryAccountType);
        writeStoredPrimaryAccount(flags.primaryAccountType);
      }
      return null;
    },
    [applySession]
  );

  const sendPhoneOtp = useCallback(async (phone: string): Promise<string | null> => {
    if (!isAppBackendOnline()) {
      return "Server is unavailable.";
    }
    const res = await backendSendPhoneOtp(phone);
    return res.error;
  }, []);

  const signInWithPhoneOtp = useCallback(
    async (
      phone: string,
      code: string,
      preferType?: AccountType
    ): Promise<string | null> => {
      if (!isAppBackendOnline()) {
        return "Server is unavailable.";
      }
      if (preferType !== "motorist" && preferType !== "professional") {
        return "Pick Customer or Repair Pro.";
      }
      const res = await backendSignInWithPhoneOtp({
        phone,
        code,
        preferType,
      });
      if (res.error || !res.profile || !res.userId) {
        return res.error || "Invalid code.";
      }

      const flags = await backendDualRoleFlags(res.userId).catch(() => ({
        hasMotorist: res.profile!.accountType === "motorist",
        hasPro: res.profile!.accountType === "professional",
        primaryAccountType: res.profile!.primaryAccountType,
      }));
      const hasMotorist =
        flags.hasMotorist || res.profile.accountType === "motorist";
      const hasPro =
        flags.hasPro || res.profile.accountType === "professional";

      if (preferType === "motorist" && !hasMotorist) {
        await backendSignOut().catch(() => undefined);
        return "No Customer account for this login.";
      }
      if (preferType === "professional" && !hasPro) {
        await backendSignOut().catch(() => undefined);
        return "No Repair Pro account for this login.";
      }

      let sessionProfile: UserProfile = {
        ...res.profile,
        primaryAccountType:
          res.profile.primaryAccountType ||
          flags.primaryAccountType ||
          res.profile.accountType,
      };
      let sessionUserId = res.userId;

      if (sessionProfile.accountType !== preferType) {
        const switched = await backendSwitchRole(preferType).catch(() => null);
        if (switched?.profile && switched.userId) {
          sessionProfile = {
            ...switched.profile,
            primaryAccountType:
              switched.primaryAccountType ||
              switched.profile.primaryAccountType ||
              sessionProfile.primaryAccountType,
          };
          sessionUserId = switched.userId;
        } else {
          sessionProfile = { ...sessionProfile, accountType: preferType };
        }
      }

      setBackendUserId(sessionUserId);
      saveProfileToVault(sessionProfile);
      applySession(sessionProfile);
      setServerSessionReady(true);
      setHasMotoristAccount(hasMotorist);
      setHasProAccount(hasPro);
      if (flags.primaryAccountType) {
        setPrimaryAccountType(flags.primaryAccountType);
        writeStoredPrimaryAccount(flags.primaryAccountType);
      }
      return null;
    },
    [applySession]
  );

  const persistProfile = useCallback((profile: UserProfile) => {
    setUserProfile(profile);
    saveProfileToVault(profile);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
    const vault = readProfilesVault();
    setHasMotoristAccount(Boolean(vault.motorist));
    setHasProAccount(Boolean(vault.professional));
  }, []);

  const verifyCustomerPhoneOtp = useCallback(
    async (code: string): Promise<string | null> => {
      if (!userProfile) return "Sign in first.";
      if (userProfile.accountType !== "motorist") {
        return "Phone verify here is for Customer accounts.";
      }
      const dig = code.replace(/\D/g, "");
      // Demo default OTP until Africa's Talking SMS is wired for customers
      const { CUSTOMER_PHONE_OTP } = await import("@/lib/verification-gate");
      if (dig !== CUSTOMER_PHONE_OTP) {
        return `Invalid code. For now use ${CUSTOMER_PHONE_OTP}.`;
      }
      persistProfile({
        ...userProfile,
        phoneVerified: true,
      });
      return null;
    },
    [userProfile, persistProfile]
  );

  const completeIdentityVerification = useCallback(
    async (input: {
      nin?: string;
      bvn?: string;
      primaryId?: string;
      bankId?: string;
      countryIso?: string;
      govIdKind?: string;
      govIdFrontUrl?: string;
      govIdBackUrl?: string;
      govIdVerified?: boolean;
      bankIdVerified?: boolean;
      mode?: "submit" | "approve";
    }): Promise<string | null> => {
      if (!userProfile) return "Sign in to verify your identity.";
      if (userProfile.accountType !== "motorist") {
        return "This check is for Customer accounts only.";
      }

      const primary =
        (input.primaryId || input.nin || "").trim();
      const bank = (input.bankId || input.bvn || "").trim();
      const iso = (input.countryIso || userProfile.identityCountryIso || "NG").toUpperCase();
      const mode = input.mode || "submit";

      if (!primary) {
        return "Enter your ID number to continue.";
      }
      if (!input.govIdFrontUrl && !userProfile.govIdFrontUrl && mode === "submit") {
        return "Upload a clear photo of your ID.";
      }

      // Submit for review — do NOT mark verified until admin/care approves
      if (mode === "submit") {
        if (isAppBackendOnline() && backendUserId) {
          let accessToken: string | null = null;
          try {
            const { getAppSupabase } = await import("@/lib/supabase/app-client");
            const sb = getAppSupabase();
            if (sb) {
              const { data } = await sb.auth.getSession();
              accessToken = data.session?.access_token ?? null;
            }
          } catch {
            /* */
          }
          const err = await backendSaveIdentityVerification({
            userId: backendUserId,
            accountType: userProfile.accountType,
            primaryId: primary,
            bankId: bank || undefined,
            nin: iso === "NG" ? primary.replace(/\D/g, "") : undefined,
            bvn: iso === "NG" && bank ? bank.replace(/\D/g, "") : undefined,
            identityVerified: false,
            countryIso: iso,
            govIdKind: input.govIdKind || userProfile.govIdKind,
            govIdFrontUrl: input.govIdFrontUrl || userProfile.govIdFrontUrl,
            govIdBackUrl: input.govIdBackUrl || userProfile.govIdBackUrl,
            accessToken,
          });
          if (err) return err;
        } else if (isAppBackendOnline() && !backendUserId) {
          return "Session not linked to server. Sign in again, then verify.";
        }

        const saved: UserProfile = {
          ...userProfile,
          idNumber: primary,
          bvn: bank || userProfile.bvn,
          identityCountryIso: iso,
          govIdKind: input.govIdKind || userProfile.govIdKind,
          govIdFrontUrl: input.govIdFrontUrl || userProfile.govIdFrontUrl,
          govIdBackUrl: input.govIdBackUrl || userProfile.govIdBackUrl,
          govIdVerified: false,
          ninVerified: false,
          bvnVerified: false,
          identityReviewStatus: "submitted",
          identitySubmittedAt: new Date().toISOString(),
          identityVerifiedAt: undefined,
        };
        persistProfile(saved);
        return null;
      }

      // Admin/care approve path (local session mirror)
      const saved: UserProfile = {
        ...userProfile,
        idNumber: primary || userProfile.idNumber,
        bvn: bank || userProfile.bvn,
        identityCountryIso: iso,
        govIdKind: input.govIdKind || userProfile.govIdKind,
        govIdFrontUrl: input.govIdFrontUrl || userProfile.govIdFrontUrl,
        govIdBackUrl: input.govIdBackUrl || userProfile.govIdBackUrl,
        govIdVerified: true,
        ninVerified: true,
        bvnVerified: Boolean(bank) || userProfile.bvnVerified,
        identityReviewStatus: "approved",
        identityVerifiedAt: new Date().toISOString(),
      };
      persistProfile(saved);

      if (saved.identityId) {
        registerIdentity({
          id: saved.identityId,
          accountType: saved.accountType,
          phone: saved.phone,
          email: saved.email,
          nin: primary,
          bvn: bank || undefined,
          fullName: saved.fullName,
          createdAt: saved.registeredAt || new Date().toISOString(),
        });
      }
      return null;
    },
    [userProfile, persistProfile, backendUserId]
  );

  const updateUserProfile = useCallback(
    (
      patch: Partial<UserProfile> & { vehiclesServedChange?: boolean }
    ): string | null => {
      if (!userProfile) return "Sign in to edit your profile.";

      const { vehiclesServedChange, ...fields } = patch;

      if (vehiclesServedChange) {
        const lock = getVehiclesServedLock(userProfile.vehiclesServedUpdatedAt);
        if (lock.locked) return lock.message;
      }

      const next: UserProfile = {
        ...userProfile,
        ...fields,
        // Never allow account type flip via profile edit
        accountType: userProfile.accountType,
        password: userProfile.password,
        email: fields.email?.trim() || userProfile.email,
        fullName: (fields.fullName ?? userProfile.fullName).trim(),
        phone: fields.phone ?? userProfile.phone,
      };

      if (vehiclesServedChange) {
        next.vehiclesServedUpdatedAt = new Date().toISOString();
      }

      if (next.accountType === "professional") {
        // Locked after signup: personal name + single trade skill
        next.fullName = (userProfile.fullName || "").trim();
        // Years: allow set only once if unset at signup
        if (!isExperienceUnset(userProfile.yearsExperience)) {
          next.yearsExperience = userProfile.yearsExperience;
        } else if (
          fields.yearsExperience != null &&
          !isExperienceUnset(fields.yearsExperience)
        ) {
          next.yearsExperience = String(fields.yearsExperience).trim();
        } else {
          next.yearsExperience = userProfile.yearsExperience;
        }
        const lockedSkill =
          (userProfile.services ?? []).filter(isProService)[0] ??
          (next.services ?? []).filter(isProService)[0];
        next.services = lockedSkill ? [lockedSkill] : userProfile.services;
        // Service radius hard-cap 10 km
        if (next.serviceRadiusKm != null) {
          next.serviceRadiusKm = Math.min(
            MAX_RADIUS_KM,
            Math.max(1, next.serviceRadiusKm)
          );
        }
        if (next.services?.[0]) {
          setProServicesState([next.services[0]]);
          setRegisteredAsState(next.services[0]);
        }
      }

      if (!next.fullName) return "Name is required.";

      persistProfile(next);
      if (next.fullName) setDisplayName(next.fullName);

      // Sync new frontend fields to Supabase when online
      if (isAppBackendOnline()) {
        void (async () => {
          try {
            const sb = (await import("@/lib/supabase/app-client")).getAppSupabase();
            const session = sb
              ? (await sb.auth.getSession()).data.session
              : null;
            if (!session?.access_token) return;
            const isPro = next.accountType === "professional";
            await backendUpdateProfile(session.access_token, {
              // Pros cannot change full name via profile edit
              fullName: isPro ? undefined : next.fullName,
              phone: next.phone,
              city: next.city,
              area: next.area,
              avatarUrl: next.avatarUrl,
              businessName: next.businessName,
              bio: next.bio,
              // Pros: send years only when setting for the first time (or non-pro)
              yearsExperience: isPro
                ? isExperienceUnset(userProfile.yearsExperience) &&
                  !isExperienceUnset(next.yearsExperience)
                  ? next.yearsExperience
                  : undefined
                : next.yearsExperience,
              serviceRadiusKm: next.serviceRadiusKm,
              // Pros: only primary signup skill (server also enforces)
              services: isPro
                ? next.services?.slice(0, 1)
                : next.services,
              labourPrices: next.servicePrices,
              pricingCurrency: next.pricingCurrency,
              vehicleMake: next.vehicleMake,
              vehicleModel: next.vehicleModel,
              vehicleYear: next.vehicleYear,
              plateNumber: next.vehiclePlate,
              vehiclePhoto: next.vehiclePhoto,
              vehicleCommonIssues: next.vehicleCommonIssues,
              vehicles: next.vehicles,
              emergencyContact: next.emergencyContact ?? null,
              savedLocations: next.savedLocations,
              bankName: next.bankName,
              bankAccountName: next.bankAccountName,
              bankAccountNumber: next.bankAccountNumber,
              faceLivenessVerified: next.faceLivenessVerified,
              servedVehicleType: next.servedVehicleType,
              servedBrand: next.servedBrand,
              servedModel: next.servedModel,
              servedCountry: next.servedCountry,
              servedLocation: next.servedLocation,
              skillAnswers: next.skillAnswers,
            });
          } catch {
            /* local vault already saved */
          }
        })();
      }
      return null;
    },
    [userProfile, persistProfile]
  );

  const completeSignup = useCallback(
    async (profile: UserProfile): Promise<string | null> => {
      // Pros: enforce single skill on profile
      const normalized: UserProfile =
        profile.accountType === "professional"
          ? {
              ...profile,
              services: (profile.services ?? []).filter(isProService).slice(0, 1),
            }
          : profile;

      if (!normalized.email?.trim() || !normalized.password) {
        return "Email and password are required to create your account.";
      }

      // Hard requirement: live Supabase write — no silent local-only signup
      if (!isAppBackendOnline()) {
        return "Server is unavailable. Check your connection and try again — accounts must save to OgaMecho.";
      }

      const labourPrices = normalized.servicePrices;
      // Slim cert payload — full base64 in skills jsonb breaks vulcanizer/pro signup
      const rawSkills = (normalized.skillAnswers || {}) as Record<
        string,
        unknown
      >;
      const slimSkills: Record<string, unknown> = { ...rawSkills };
      if (
        slimSkills.certificationUpload &&
        typeof slimSkills.certificationUpload === "object"
      ) {
        const f = slimSkills.certificationUpload as {
          name?: string;
          mime?: string;
          dataUrl?: string;
        };
        slimSkills.certificationUpload = {
          name: f.name || "certificate",
          mime: f.mime,
          hasFile: Boolean(f.dataUrl || f.name),
        };
      }
      let certData = normalized.certificationFileDataUrl;
      if (
        (!certData || !String(certData).startsWith("data:")) &&
        rawSkills.certificationUpload &&
        typeof rawSkills.certificationUpload === "object"
      ) {
        const f = rawSkills.certificationUpload as { dataUrl?: string };
        if (typeof f.dataUrl === "string") certData = f.dataUrl;
      }
      // Cap body size so free-tier / Next body limits do not kill signup
      if (certData && certData.length > 400_000) {
        certData = undefined;
      }

      const res = await backendSignUp({
        email: normalized.email,
        password: normalized.password,
        fullName: normalized.fullName,
        phone: normalized.phone,
        accountType: normalized.accountType,
        city: normalized.city,
        area: normalized.area,
        businessName: normalized.businessName,
        primaryService: normalized.services?.[0],
        services: normalized.services,
        bio: normalized.bio,
        yearsExperience: normalized.yearsExperience,
        serviceRadiusKm: normalized.serviceRadiusKm,
        lat: location.coordinates.lat,
        lng: location.coordinates.lng,
        vehicleMake: normalized.vehicleMake,
        vehicleModel: normalized.vehicleModel,
        vehicleYear: normalized.vehicleYear,
        plateNumber: normalized.vehiclePlate,
        vehiclePhoto: normalized.vehiclePhoto,
        vehicleCommonIssues: normalized.vehicleCommonIssues,
        vehicles: normalized.vehicles,
        avatarUrl: normalized.avatarUrl,
        nin: normalized.idNumber,
        bvn: normalized.bvn,
        labourPrices,
        pricingCurrency: normalized.pricingCurrency,
        skillAnswers: slimSkills,
        servedVehicleType: normalized.servedVehicleType,
        servedBrand: normalized.servedBrand,
        servedModel: normalized.servedModel,
        servedCountry: normalized.servedCountry,
        servedLocation: normalized.servedLocation,
        emergencyContact: normalized.emergencyContact,
        bankName: normalized.bankName,
        bankAccountName: normalized.bankAccountName,
        bankAccountNumber: normalized.bankAccountNumber,
        docsStatus: normalized.docsStatus,
        certificationFileName: normalized.certificationFileName,
        certificationFileDataUrl: certData,
        // Dual role: keep motorist when adding Repair Pro (and vice versa)
        keepOtherRole: true,
      });

      if (res.error || !res.profile || !res.userId) {
        return (
          res.error ||
          "Could not save your account to the server. Please try again."
        );
      }

      // Only open the app after a real server user id exists
      setBackendUserId(res.userId);
      // Preserve original primary account when adding a second role
      const existingPrimary =
        readStoredPrimaryAccount() ||
        primaryAccountType ||
        userProfile?.primaryAccountType ||
        null;
      const primary: AccountType =
        existingPrimary && existingPrimary !== res.profile.accountType
          ? existingPrimary
          : res.profile.accountType;
      const signedUp: UserProfile = {
        ...normalized,
        ...res.profile,
        primaryAccountType: primary,
        // Merge vault extras the server may not echo yet
        servicePrices: normalized.servicePrices ?? res.profile.servicePrices,
        pricingCurrency:
          normalized.pricingCurrency ?? res.profile.pricingCurrency,
        skillAnswers: normalized.skillAnswers ?? res.profile.skillAnswers,
        docsStatus: normalized.docsStatus ?? res.profile.docsStatus,
        docsRatingBoostApplied:
          normalized.docsRatingBoostApplied ??
          res.profile.docsRatingBoostApplied,
        certificationFileName:
          normalized.certificationFileName ??
          res.profile.certificationFileName,
        certificationFileDataUrl:
          normalized.certificationFileDataUrl ??
          res.profile.certificationFileDataUrl,
        averageRating:
          normalized.averageRating ?? res.profile.averageRating ?? 5,
        servedVehicleType:
          normalized.servedVehicleType ?? res.profile.servedVehicleType,
        servedBrand: normalized.servedBrand ?? res.profile.servedBrand,
        servedModel: normalized.servedModel ?? res.profile.servedModel,
        servedCountry: normalized.servedCountry ?? res.profile.servedCountry,
        servedLocation:
          normalized.servedLocation ?? res.profile.servedLocation,
        vehicles: res.profile.vehicles ?? normalized.vehicles,
        vehicleMake: res.profile.vehicleMake ?? normalized.vehicleMake,
        vehicleModel: res.profile.vehicleModel ?? normalized.vehicleModel,
        vehicleYear: res.profile.vehicleYear ?? normalized.vehicleYear,
      };
      if (!existingPrimary) {
        writeStoredPrimaryAccount(res.profile.accountType);
      }
      saveProfileToVault(signedUp);
      applySession(signedUp);
      setServerSessionReady(true);
      if (res.profile.accountType === "motorist") {
        setHasMotoristAccount(true);
      } else {
        setHasProAccount(true);
        // Keep motorist flag if they already had it (dual)
        if (hasMotoristAccount || existingPrimary === "motorist") {
          setHasMotoristAccount(true);
        }
      }
      return null;
    },
    [
      applySession,
      location.coordinates.lat,
      location.coordinates.lng,
      primaryAccountType,
      userProfile?.primaryAccountType,
      hasMotoristAccount,
    ]
  );

  const login = useCallback(
    (_opts: {
      accountType: AccountType;
      name?: string;
      proService?: ProService;
      proServices?: ProService[];
    }) => {
      // Demo shortcut disabled — must use real server signup / login
      console.warn(
        "Quick demo login is disabled. Use Sign up or Log in against the server."
      );
    },
    []
  );

  const setProLive = useCallback(
    async (live: boolean): Promise<string | null> => {
      // Pro stays Live until they turn it off (or leave pro mode / log out)
      if (live && accountType !== "professional") {
        return "Switch to Repair Pro mode first.";
      }
      if (!backendUserId || !isAppBackendOnline()) {
        // Never flip local Away while server stays Live — require server for both
        return "Server offline. Connect to go Live or Away so motorists stay in sync.";
      }
      if (accountType !== "professional") {
        await backendSetProOnline(backendUserId, false);
        setProLiveState(false);
        return null;
      }

      // Local draft gate only when an onboarding profile exists in this browser.
      // Missing local artisan must NOT blank/block dashboard — server owns Live.
      if (live) {
        try {
          const { getArtisanProfile } = await import("@/lib/artisan/local-store");
          const { canGoLive } = await import("@/lib/artisan/status");
          const artisan = getArtisanProfile(backendUserId);
          if (artisan) {
            const gate = canGoLive(artisan);
            if (!gate.allowed) {
              return gate.message;
            }
          }
        } catch {
          /* fall through — server enforces */
        }
      }

      // Going Live: prefer fresh high-accuracy GPS so motorists see you nearby
      let lat = location.coordinates.lat;
      let lng = location.coordinates.lng;
      let gotGps = false;
      if (live && typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
              });
            }
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          gotGps = true;
          setLocation((prev) => ({
            ...prev,
            coordinates: { lat, lng },
          }));
        } catch {
          /* fall back to last known */
        }
      }

      if (
        live &&
        !gotGps &&
        (!Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          (lat === 0 && lng === 0) ||
          // Default Lagos seed without real GPS is weak for discovery
          false)
      ) {
        // still try last known
      }

      const err = await backendSetProOnline(backendUserId, live, {
        lat,
        lng,
      });
      if (err) {
        console.warn("setProLive:", err);
        if (live) {
          setProLiveState(false);
          try {
            localStorage.setItem("oga-mecho-pro-live", "0");
          } catch {
            /* ignore */
          }
        }
        return err;
      }
      setProLiveState(live);
      try {
        localStorage.setItem("oga-mecho-pro-live", live ? "1" : "0");
      } catch {
        /* ignore */
      }
      playAppSound(live ? "pro_live" : "pro_away");
      return null;
    },
    [
      backendUserId,
      accountType,
      location.coordinates.lat,
      location.coordinates.lng,
    ]
  );

  const setHelpingSomeoneElse = useCallback(
    (
      next:
        | null
        | {
            label: string;
            coordinates: { lat: number; lng: number };
          }
    ) => {
      if (next == null) {
        setHelpingSomeoneElseState(false);
        setHelpingSomeoneLabel(null);
        if (ownLocationBackup.current) {
          setLocation(ownLocationBackup.current);
          ownLocationBackup.current = null;
        }
        return;
      }
      if (!ownLocationBackup.current) {
        ownLocationBackup.current = location;
      }
      setHelpingSomeoneElseState(true);
      setHelpingSomeoneLabel(next.label);
      setLocation({
        label: next.label,
        city: next.label,
        coordinates: next.coordinates,
      });
    },
    [location]
  );

  const logout = useCallback(() => {
    // Server-side Live OFF + session clear (prevents ghost online / previous pro)
    void backendLogout();

    setBackendUserId(null);
    setIsAuthenticated(false);
    setAccountType(null);
    setPrimaryAccountType(null);
    setProLiveState(false);
    setDisplayName("Guest");
    setUserProfile(null);
    setCloudTechs([]);
    // Keep dual vault so both accounts remain for future login / switch after re-auth
    try {
      localStorage.setItem("oga-mecho-pro-live", "0");
      localStorage.removeItem("oga-mecho-pro-live");
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_NAME_KEY);
      localStorage.removeItem(AUTH_ACCOUNT_KEY);
      localStorage.removeItem(PRIMARY_ACCOUNT_KEY);
      localStorage.removeItem(PROFILE_KEY);
      const vault = readProfilesVault();
      setHasMotoristAccount(Boolean(vault.motorist));
      setHasProAccount(Boolean(vault.professional));
    } catch {
      /* ignore */
    }
  }, []);

  /** One professional skill only — ignore adds beyond the first. */
  const addProService = useCallback((service: ProService) => {
    setProServicesState((prev) => {
      if (prev.length >= 1) return prev;
      if (prev.includes(service)) return prev;
      const next = [service];
      try {
        localStorage.setItem(SERVICES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const removeProService = useCallback(
    (service: ProService) => {
      setProServicesState((prev) => {
        // Keep at least the primary registration service if pro
        if (isProService(registeredAs) && service === registeredAs) {
          return prev;
        }
        const next = prev.filter((s) => s !== service);
        try {
          localStorage.setItem(SERVICES_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [registeredAs]
  );

  /** Live marketplace pros only (no demo seed — keeps first paint light). */
  const technicians = useMemo(() => {
    // Marketplace: only server Live pros (is_online + repair_pro role).
    const base =
      accountType === "professional"
        ? []
        : cloudTechs !== null
          ? cloudTechs
          : [];

    // Always recompute distance/ETA from the active pin (my GPS or
    // “help someone else” meet location) so radius is correct for both.
    const origin = location.coordinates;
    const withDistance = base.map((t) => {
      const lat = t.location?.lat;
      const lng = t.location?.lng;
      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        // No coords → treat as out of range so they never appear in 10 km list
        return { ...t, distanceKm: Number.POSITIVE_INFINITY };
      }
      const d = haversineKm(origin, { lat, lng });
      // Prefer Google ETA from API when present; never force a 5–6 min floor
      const estimate =
        d <= 0.12 ? 1 : d <= 0.3 ? 2 : Math.max(1, Math.round((d / 28) * 60));
      const fromApi =
        typeof t.etaMinutes === "number" &&
        Number.isFinite(t.etaMinutes) &&
        t.etaMinutes > 0 &&
        t.etaMinutes < 90;
      return {
        ...t,
        distanceKm: Math.round(d * 10) / 10,
        etaMinutes: fromApi ? t.etaMinutes : estimate,
      };
    });

    // Motorist home: never inject the signed-in Repair Pro into discovery
    // (they look for other pros). Pro self-card stays for pro dashboard only.
    if (accountType === "motorist" || accountType == null) {
      return withDistance.filter(
        (t) => t.id !== SELF_PRO_TECH_ID && t.id !== backendUserId
      );
    }

    const self = userProfile ? profileToTechnician(userProfile) : null;
    if (!self) return withDistance;
    return [
      self,
      ...withDistance.filter(
        (t) => t.id !== SELF_PRO_TECH_ID && t.id !== self.id
      ),
    ];
  }, [
    userProfile,
    cloudTechs,
    location.coordinates.lat,
    location.coordinates.lng,
    accountType,
    backendUserId,
  ]);

  const visibleTechnicians = useMemo(
    () =>
      filterAndRankTechnicians(technicians, {
        radiusKm,
        category,
        query,
        filters,
        specialtyFilter,
      }),
    [technicians, radiusKm, category, query, filters, specialtyFilter]
  );

  const toggleFilter = useCallback((key: keyof AppFilters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const specialtyHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const clearSpecialtyHideTimer = useCallback(() => {
    if (specialtyHideTimerRef.current) {
      clearTimeout(specialtyHideTimerRef.current);
      specialtyHideTimerRef.current = null;
    }
  }, []);

  const setCategory = useCallback(
    (c: ServiceCategory) => {
      clearSpecialtyHideTimer();
      setCategoryState(c);
      setSpecialtyFilterState(null);
      // Plumber / Carpenter / etc. → show specialty strip instead of radius
      setSpecialtyPickerOpen(isSpecialtyPickerTrade(c));
    },
    [clearSpecialtyHideTimer]
  );

  const setSpecialtyFilter = useCallback(
    (s: string | null) => {
      clearSpecialtyHideTimer();
      setSpecialtyFilterState(s);
      if (s) {
        // Keep strip open so pick can highlight; hide after 2s, filter already applied
        setSpecialtyPickerOpen(true);
        specialtyHideTimerRef.current = setTimeout(() => {
          setSpecialtyPickerOpen(false);
          specialtyHideTimerRef.current = null;
        }, 2000);
      } else {
        setSpecialtyPickerOpen(false);
      }
    },
    [clearSpecialtyHideTimer]
  );

  const openSpecialtyPicker = useCallback(() => {
    clearSpecialtyHideTimer();
    setSpecialtyFilterState(null);
    setSpecialtyPickerOpen(true);
  }, [clearSpecialtyHideTimer]);

  const ensureChatForRequestAsync = useCallback(
    async (req: ServiceRequest): Promise<string> => {
      const localId = `chat-${req.id}`;

      // Prefer existing real server conversation
      let hitId: string | null = null;
      setMessages((prev) => {
        const existing = prev.find(
          (m) => m.requestId === req.id && m.id && !m.id.startsWith("chat-")
        );
        if (existing) hitId = existing.id;
        return prev;
      });
      if (hitId) return hitId;

      if (isAppBackendOnline() && backendUserId && accountType) {
        const motoristId =
          accountType === "motorist"
            ? backendUserId
            : req.motoristId || "";
        const repairProId =
          accountType === "professional"
            ? backendUserId
            : req.technicianId;
        if (motoristId && repairProId) {
          const res = await backendEnsureConversation({
            requestId: req.id,
            motoristId,
            repairProId,
          });
          if (res.conversationId) {
            const threads = await backendFetchConversations(
              backendUserId,
              accountType
            );
            if (threads.length) setMessages(threads);
            return res.conversationId;
          }
        }
      }

      setMessages((prev) => {
        if (prev.some((m) => m.requestId === req.id || m.id === localId)) {
          return prev;
        }
        const thread: MessageThread = {
          id: localId,
          requestId: req.id,
          technicianId: req.technicianId,
          technicianName: req.technicianName,
          motoristName:
            accountType === "motorist"
              ? displayName || "Customer"
              : "Customer",
          serviceType: req.serviceType,
          lastMessage: `Job: ${req.problem}`,
          time: "now",
          unread: 0,
          photo: "",
          messages: [
            {
              id: `${localId}-sys`,
              sender: "system",
              text: `Chat opened · ${req.problem}`,
              at: new Date().toISOString(),
            },
          ],
        };
        return [thread, ...prev];
      });
      return localId;
    },
    [displayName, backendUserId, accountType]
  );

  const ensureChatForRequest = useCallback(
    (req: ServiceRequest): string => {
      void ensureChatForRequestAsync(req);
      return `chat-${req.id}`;
    },
    [ensureChatForRequestAsync]
  );

  const sendChatMessage = useCallback(
    (
      threadId: string,
      text: string,
      voice?: {
        url: string;
        durationSec?: number;
        mime?: string;
      } | null
    ) => {
      const trimmed = text.trim();
      if (!trimmed && !voice?.url) return;
      const sender: ChatMessage["sender"] =
        accountType === "professional" ? "professional" : "motorist";
      const preview = voice?.url
        ? trimmed
          ? `🎤 ${trimmed}`
          : "🎤 Voice note"
        : trimmed;
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender,
        text: trimmed || "Voice note",
        at: new Date().toISOString(),
        voiceUrl: voice?.url || null,
        voiceDurationSec: voice?.durationSec ?? null,
        voiceMime: voice?.mime ?? null,
      };

      // Unique send chirp for this user
      playPersonTone(backendUserId || displayName || "me", "sent");

      // Optimistic update on matching thread
      setMessages((prev) =>
        prev.map((t) =>
          t.id === threadId ||
          (t.requestId &&
            (threadId === `chat-${t.requestId}` || threadId === t.requestId))
            ? {
                ...t,
                lastMessage: preview,
                time: "now",
                messages: [...t.messages, msg],
              }
            : t
        )
      );

      if (!isAppBackendOnline() || !backendUserId || !accountType) return;

      const body = voice?.url
        ? JSON.stringify({
            text: trimmed || "Voice note",
            voiceUrl: voice.url,
            voiceDurationSec: voice.durationSec ?? null,
            voiceMime: voice.mime ?? null,
          })
        : trimmed;

      void (async () => {
        // Resolve real conversation UUID (never insert with chat- local id)
        let conversationId = threadId;
        if (conversationId.startsWith("chat-")) {
          const requestId = conversationId.replace(/^chat-/, "");
          const threads = await backendFetchConversations(
            backendUserId,
            accountType
          );
          const hit = threads.find(
            (th) => th.requestId === requestId || th.id === threadId
          );
          if (hit) {
            conversationId = hit.id;
            setMessages(threads);
          } else {
            console.warn("sendChatMessage: no cloud conversation for", requestId);
            return;
          }
        }

        const err = await backendSendMessage({
          conversationId,
          senderId: backendUserId,
          body,
        });
        if (err) console.warn("sendChatMessage failed", err);
        // Pull latest so both devices stay in sync
        const threads = await backendFetchConversations(
          backendUserId,
          accountType
        );
        if (threads.length) setMessages(threads);
      })();
    },
    [accountType, backendUserId, displayName]
  );

  // Inbound message tone + banner handled by InboundBanner (app-wide)

  const markThreadRead = useCallback(
    (threadId: string) => {
      if (!threadId) return;
      setMessages((prev) =>
        prev.map((t) =>
          t.id === threadId ||
          (t.requestId &&
            (threadId === `chat-${t.requestId}` || threadId === t.requestId))
            ? { ...t, unread: 0 }
            : t
        )
      );
      if (!backendUserId || threadId.startsWith("chat-")) return;
      void backendMarkMessagesRead(threadId, backendUserId);
    },
    [backendUserId]
  );

  // All chats for this account (skill filter hid pro job chats)
  const visibleMessageThreads = useMemo(() => messages, [messages]);

  const createRequest = useCallback(
    (
      tech: Technician,
      problem = "Roadside assistance",
      pricing?: {
        labourBaseMajor: number;
        labourAgreedMajor: number;
        discountPercent: number;
        pricingCurrency: import("@/lib/pricing").AppCurrency;
        negotiationStatus?: ServiceRequest["negotiationStatus"];
      }
    ) => {
      const forSomeone = helpingSomeoneElse;
      // Always store full address for jobs + maps (street + area)
      const meetLabel = (() => {
        const full = (location.label || "").trim();
        const city = (location.city || "").trim();
        if (
          full &&
          full !== "Current location" &&
          full !== "Locating…" &&
          full !== "Locating..."
        ) {
          // If label already includes city, use as-is; else append city
          if (city && !full.toLowerCase().includes(city.toLowerCase())) {
            return `${full}, ${city}`;
          }
          return full;
        }
        if (city) return city;
        return "Near you";
      })();
      const desc = forSomeone
        ? `[Booking for someone else · meet: ${meetLabel}] ${problem}`
        : problem;
      const localReq: ServiceRequest = {
        id: `r-${Date.now()}`,
        technicianId: tech.id,
        technicianName: tech.name,
        serviceType: tech.serviceType,
        problem: desc,
        status: "pending",
        createdAt: new Date().toISOString(),
        etaMinutes: tech.etaMinutes,
        distanceKm: tech.distanceKm,
        locationLabel: meetLabel,
        bookingForSomeoneElse: forSomeone || undefined,
        meetCoordinates: forSomeone
          ? { ...location.coordinates }
          : undefined,
        labourBaseMajor: pricing?.labourBaseMajor,
        labourAgreedMajor: pricing?.labourAgreedMajor,
        discountPercent: pricing?.discountPercent,
        pricingCurrency: pricing?.pricingCurrency,
        negotiationStatus: pricing?.negotiationStatus ?? "none",
      };

      if (isAppBackendOnline() && backendUserId && accountType === "motorist") {
        void backendCreateJob({
          motoristId: backendUserId,
          repairProId: tech.id,
          serviceType: tech.serviceType,
          description: desc,
          lat: location.coordinates.lat,
          lng: location.coordinates.lng,
          address: meetLabel,
          radiusKm,
        }).then((res) => {
          if (res.request) {
            const cloud: ServiceRequest = {
              ...res.request,
              bookingForSomeoneElse: forSomeone || undefined,
              meetCoordinates: forSomeone
                ? { ...location.coordinates }
                : undefined,
              locationLabel: meetLabel,
            };
            setRequests((prev) => [
              cloud,
              ...prev.filter((r) => r.id !== localReq.id),
            ]);
            ensureChatForRequest(cloud);
          }
        });
      }

      setRequests((prev) => [localReq, ...prev]);
      ensureChatForRequest(localReq);
      return localReq;
    },
    [
      helpingSomeoneElse,
      location.label,
      location.coordinates.lat,
      location.coordinates.lng,
      ensureChatForRequest,
      backendUserId,
      accountType,
      radiusKm,
    ]
  );

  const bookRequest = useCallback(
    (
      tech: Technician,
      problem = "Roadside assistance",
      pricing?: {
        labourBaseMajor: number;
        labourAgreedMajor: number;
        discountPercent: number;
        pricingCurrency: import("@/lib/pricing").AppCurrency;
        negotiationStatus?: ServiceRequest["negotiationStatus"];
      }
    ): ServiceActionResult => {
      const cfg = getRuntimeAppConfig();
      const gate = cfg.features.identityVerifyEnabled
        ? evaluateServiceGate(userProfile, "motorist", {
            trialDays: cfg.verification.trialDays ?? 30,
            warnFrom: cfg.verification.warnFrom,
            blockAt: cfg.verification.blockAt,
          })
        : {
            allowed: true as const,
            warning: null,
            nextIndex: 0,
            remaining: Infinity,
          };
      const count = userProfile?.serviceActionCount ?? 0;
      if (!gate.allowed) {
        return {
          ok: false,
          code: "verification_required",
          message: gate.message,
          actionCount: count,
        };
      }
      // Labour price required before request / escrow (Quote on request blocks)
      if (
        pricing == null ||
        !Number.isFinite(pricing.labourBaseMajor) ||
        pricing.labourBaseMajor <= 0
      ) {
        return {
          ok: false,
          code: "invalid",
          message:
            "This Repair Pro has no labour price set. Quote on request — they must set a price on their profile first.",
          actionCount: count,
        };
      }
      const req = createRequest(tech, problem, pricing);
      if (userProfile) {
        const nowIso = new Date().toISOString();
        persistProfile({
          ...userProfile,
          serviceActionCount: count + 1,
          // Start 30-day free window on first request
          firstServiceAt: userProfile.firstServiceAt || nowIso,
        });
      }
      return {
        ok: true,
        request: req,
        warning: gate.warning,
        actionCount: count + 1,
      };
    },
    [userProfile, createRequest, persistProfile]
  );

  const updateRequestStatus = useCallback(
    (
      id: string,
      status: ServiceRequest["status"]
    ): ServiceActionResult => {
      const existing = requests.find((r) => r.id === id);
      if (!existing) {
        return {
          ok: false,
          code: "not_found",
          message: "Request not found.",
          actionCount: userProfile?.serviceActionCount ?? 0,
        };
      }

      // Skill lock: mechanic cannot take vulcanizer jobs, etc.
      if (
        status === "accepted" &&
        existing.status === "pending" &&
        accountType === "professional"
      ) {
        const mySkill: ProService | null = isProService(registeredAs)
          ? registeredAs
          : proServices[0] ?? null;
        if (mySkill && existing.serviceType !== mySkill) {
          return {
            ok: false,
            code: "skill_mismatch",
            message: `This job is for ${existing.serviceType}. Your skill is ${mySkill} only — you cannot take another trade's job.`,
            actionCount: userProfile?.serviceActionCount ?? 0,
          };
        }
      }

      // Only "accept" is gated — decline / progress stays free
      if (status === "accepted" && existing.status === "pending") {
        const cfg = getRuntimeAppConfig();
        const gate = cfg.features.identityVerifyEnabled
          ? evaluateServiceGate(
              userProfile,
              accountType === "professional"
                ? "professional"
                : userProfile?.accountType,
              {
                trialDays: cfg.verification.trialDays ?? 30,
                warnFrom: cfg.verification.warnFrom,
                blockAt: cfg.verification.blockAt,
              }
            )
          : {
              allowed: true as const,
              warning: null,
              nextIndex: 0,
              remaining: Infinity,
            };
        const count = userProfile?.serviceActionCount ?? 0;
        if (!gate.allowed) {
          return {
            ok: false,
            code: "verification_required",
            message: gate.message,
            actionCount: count,
          };
        }
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r))
        );
        ensureChatForRequest(existing);
        if (backendUserId && isAppBackendOnline()) {
          void backendUpdateJobStatus(id, status, backendUserId);
        }
        if (userProfile) {
          const nowIso = new Date().toISOString();
          persistProfile({
            ...userProfile,
            serviceActionCount: count + 1,
            firstServiceAt: userProfile.firstServiceAt || nowIso,
          });
        }
        return {
          ok: true,
          warning: gate.warning,
          actionCount: count + 1,
        };
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
      if (backendUserId && isAppBackendOnline()) {
        void backendUpdateJobStatus(id, status, backendUserId);
      }
      return {
        ok: true,
        warning: null,
        actionCount: userProfile?.serviceActionCount ?? 0,
      };
    },
    [
      requests,
      userProfile,
      accountType,
      persistProfile,
      registeredAs,
      proServices,
      ensureChatForRequest,
      backendUserId,
    ]
  );

  // ── Supabase: load pros + jobs + chats + realtime (throttled) ─────
  const userLat = location.coordinates.lat;
  const userLng = location.coordinates.lng;

  const refreshCloudPros = useCallback(() => {
    // Motorist marketplace only — pros never load "nearby" discovery feed
    // Guests / login screens must not burn mobile data on map lists
    if (!isAuthenticated || accountType === "professional") {
      setCloudTechs(accountType === "professional" ? [] : null);
      return;
    }
    // /api/pros returns only Live Repair Pros (online + pro role + range)
    void backendFetchPros({ lat: userLat, lng: userLng }).then((list) => {
      // [] is valid: no one is Live right now (do not re-show demo seeds)
      setCloudTechs(list);
    });
  }, [userLat, userLng, accountType, isAuthenticated]);

  /** Public: motorist empty-state Refresh — pros list only */
  const refreshNearbyPros = useCallback(() => {
    refreshCloudPros();
  }, [refreshCloudPros]);

  const refreshCloudJobs = useCallback(() => {
    if (!isAppBackendOnline() || !backendUserId || !accountType) return;
    void backendFetchJobsForUser(backendUserId, accountType).then((jobs) => {
      if (jobs.length > 0) setRequests(jobs);
    });
  }, [backendUserId, accountType]);

  const refreshCloudChats = useCallback(() => {
    if (!isAppBackendOnline() || !backendUserId || !accountType) return;
    void backendFetchConversations(backendUserId, accountType).then(
      (threads) => {
        if (threads.length > 0) setMessages(threads);
      }
    );
  }, [backendUserId, accountType]);

  // Pros: load once when signed-in motorist; poll every 30 min (bare-minimum data)
  useEffect(() => {
    if (!isAuthenticated || accountType === "professional") {
      if (accountType === "professional") setCloudTechs([]);
      return;
    }
    // Delay first fetch so splash/login never compete for bandwidth
    const first = window.setTimeout(() => refreshCloudPros(), 3500);
    const poll = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshCloudPros();
    }, 1_800_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [refreshCloudPros, isAuthenticated, accountType]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Jobs after idle; chats much later (messages page can still refresh on open)
    const jobsT = window.setTimeout(() => refreshCloudJobs(), 4000);
    const chatsT = window.setTimeout(() => refreshCloudChats(), 300_000);
    return () => {
      window.clearTimeout(jobsT);
      window.clearTimeout(chatsT);
    };
  }, [refreshCloudJobs, refreshCloudChats, isAuthenticated]);

  // Jobs Realtime only (no pros Realtime storm) — heavy debounce
  useEffect(() => {
    if (!isAppBackendOnline() || !backendUserId) return;
    let jobsTimer: ReturnType<typeof setTimeout> | null = null;
    // Do not subscribe to all pros updates — map uses slow poll only
    const unsubJobs = backendSubscribeJobs(backendUserId, () => {
      if (jobsTimer) clearTimeout(jobsTimer);
      // Heavy debounce — avoid refetch storms that freeze the UI (white/blank feel)
      jobsTimer = setTimeout(() => refreshCloudJobs(), 45_000);
    });
    return () => {
      if (jobsTimer) clearTimeout(jobsTimer);
      unsubJobs?.();
    };
  }, [backendUserId, refreshCloudJobs]);

  // Sync Live/Away from server (never trust localStorage alone — Away must match is_online)
  useEffect(() => {
    if (accountType !== "professional" || !backendUserId) return;
    if (!isAppBackendOnline()) return;
    let cancelled = false;
    void backendGetProOnline(backendUserId).then((online) => {
      if (cancelled || online == null) return;
      setProLiveState(online);
      try {
        localStorage.setItem("oga-mecho-pro-live", online ? "1" : "0");
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accountType, backendUserId]);

  // While Live: continuous GPS so motorists get accurate 10 km / 2 km discovery
  useEffect(() => {
    if (
      !isAppBackendOnline() ||
      !backendUserId ||
      accountType !== "professional" ||
      !proLive
    ) {
      return;
    }

    let lastPush = 0;
    let inflight = false;
    const pushCoords = (lat: number, lng: number) => {
      const now = Date.now();
      // Min 3 min between Live GPS uploads — aggressive mobile data saver
      if (inflight || now - lastPush < 180_000) return;
      lastPush = now;
      inflight = true;
      void backendSetProOnline(backendUserId, true, { lat, lng }).finally(() => {
        inflight = false;
      });
    };

    // One initial pin, then slow interval (no watchPosition stream)
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => pushCoords(pos.coords.latitude, pos.coords.longitude),
        () => pushCoords(userLat, userLng),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 180_000 }
      );
    } else {
      pushCoords(userLat, userLng);
    }

    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!navigator.geolocation) {
        pushCoords(userLat, userLng);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => pushCoords(pos.coords.latitude, pos.coords.longitude),
        () => pushCoords(userLat, userLng),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 180_000 }
      );
    }, 180_000);

    return () => {
      window.clearInterval(id);
    };
  }, [backendUserId, accountType, userLat, userLng, proLive]);

  // Leaving pro mode → Away (so motorists don't see them while on Motorist)
  useEffect(() => {
    if (accountType === "professional") return;
    if (!backendUserId || !isAppBackendOnline()) return;
    if (proLive) {
      setProLiveState(false);
      try {
        localStorage.setItem("oga-mecho-pro-live", "0");
      } catch {
        /* ignore */
      }
      void backendSetProOnline(backendUserId, false);
    }
  }, [accountType, backendUserId, proLive]);

  /** Refresh GPS every 20 minutes while the app tab is open/visible */
  const LOCATION_REFRESH_MS = 20 * 60 * 1000;

  /** Map browser GPS errors to clear, actionable copy (not raw "User denied Geolocation"). */
  const friendlyGeolocationError = useCallback(
    (err?: GeolocationPositionError | null) => {
      const code = err?.code;
      // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
      if (code === 1) {
        return "Location is blocked. Allow it in the browser address bar (or site settings), then tap Retry.";
      }
      if (code === 3) {
        return "Location timed out. Check GPS signal, then tap Retry.";
      }
      if (code === 2) {
        return "Location unavailable right now. Check that Location Services are on, then tap Retry.";
      }
      if (typeof navigator !== "undefined" && !navigator.geolocation) {
        return "Location is not available on this device. You can still set a place manually.";
      }
      return "We couldn’t get your location. Allow location access, then tap Retry.";
    },
    []
  );

  /** Last reverse-geocode time — avoid Google Geocoding on every GPS tick */
  const lastGeocodeAt = useRef(0);
  /** Last full address string from geocode (for throttle) */
  const lastFullAddressRef = useRef("");

  const applyGpsFix = useCallback(
    (pos: GeolocationPosition, silent = false) => {
      // Manual pin wins until user taps Retry / Use my location
      if (manualPinRef.current) {
        if (!silent) setIsLocating(false);
        return;
      }
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // Keep coords immediately; keep previous full address until reverse-geocode returns
      setLocation((prev) => {
        // Drop boot/fallback labels immediately; keep a real prior address until geocode
        const isPlaceholder =
          !prev.label ||
          prev.label === "Current location" ||
          prev.label === "Locating…" ||
          prev.label === DEFAULT_USER_LOCATION.label;
        return {
          label: isPlaceholder ? "Locating…" : prev.label,
          city:
            isPlaceholder || prev.city === "Near you"
              ? ""
              : prev.city || "",
          coordinates: { lat, lng },
        };
      });
      setLocationError(null);
      if (!silent) setIsLocating(false);

      // Resolve FULL Google formatted address (never area-only like "Lekki")
      const now = Date.now();
      const hasFull =
        lastFullAddressRef.current.includes(",") &&
        lastFullAddressRef.current.length > 12;
      // 10 min throttle — reverse-geocode is the heaviest mobile data cost on boot
      if (hasFull && now - lastGeocodeAt.current < 600_000) {
        try {
          localStorage.setItem(
            LAST_GPS_KEY,
            JSON.stringify({
              lat,
              lng,
              label: lastFullAddressRef.current,
              city: "",
            })
          );
        } catch {
          /* */
        }
        return;
      }
      lastGeocodeAt.current = now;
      void import("@/lib/google-maps").then(({ reverseGeocodeLatLng }) =>
        reverseGeocodeLatLng(lat, lng).then((geo) => {
          if (!geo || manualPinRef.current) return;
          // Immediate place name only — never raw coordinates
          const label = (geo.label || "").trim();
          if (!label || /^-?\d+\.\d+/.test(label)) return;
          const city = (geo.localityLine || geo.city || geo.area || "").trim();
          lastFullAddressRef.current = label;
          setLocation({
            label,
            city,
            coordinates: { lat, lng },
          });
          try {
            localStorage.setItem(
              LAST_GPS_KEY,
              JSON.stringify({ lat, lng, label, city })
            );
          } catch {
            /* */
          }
        })
      );
    },
    []
  );

  const retryLocation = useCallback(() => {
    manualPinRef.current = false;
    setIsLocating(true);
    setLocationError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError(
        "Location is not available on this device. You can still set a place manually."
      );
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyGpsFix(pos, false),
      (err) => {
        // Keep last-known / Ajegunle fallback — never invent a random Lagos pin
        setLocationError(friendlyGeolocationError(err));
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0, // force fresh fix
      }
    );
  }, [applyGpsFix, friendlyGeolocationError]);

  // GPS only after auth — login/signup must not burn GPS + reverse-geocode
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    setIsLocating(true);

    const pull = (silent: boolean, highAccuracy: boolean) => {
      if (cancelled || manualPinRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          applyGpsFix(pos, silent);
          if (!silent) setIsLocating(false);
        },
        (err) => {
          if (cancelled) return;
          if (!silent) {
            setLocationError(friendlyGeolocationError(err));
            setIsLocating(false);
          }
        },
        {
          // Prefer cached fix first (low data / battery); refine later if needed
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 10_000 : 5000,
          maximumAge: highAccuracy ? 60_000 : 180_000,
        }
      );
    };

    // Single network-light pull only — no high-accuracy refine (saves GPS + geocode data)
    pull(false, false);
    const intervalId = window.setInterval(
      () => {
        if (document.hidden || manualPinRef.current) return;
        pull(true, false);
      },
      LOCATION_REFRESH_MS
    );
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyGpsFix, friendlyGeolocationError, isAuthenticated]);

  const setManualLocation = useCallback(
    (label: string, coords?: { lat: number; lng: number }) => {
      if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
        setLocationError("Pick a place on the map or allow GPS.");
        return;
      }
      manualPinRef.current = true;
      setLocation({
        label: label || "Pinned location",
        city: label || "Pinned",
        coordinates: { lat: coords.lat, lng: coords.lng },
      });
      setLocationError(null);
      try {
        localStorage.setItem(
          LAST_GPS_KEY,
          JSON.stringify({
            lat: coords.lat,
            lng: coords.lng,
            label: label || "Pinned location",
            city: label || "Pinned",
          })
        );
      } catch {
        /* */
      }
    },
    []
  );

  const setRadiusKm = useCallback((n: number) => {
    const clamped = Math.min(MAX_RADIUS_KM, Math.max(0.5, n));
    setRadiusKmState(clamped);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      theme,
      toggleTheme,
      setTheme,
      roleReady,
      authReady,
      isAuthenticated,
      backendUserId,
      serverSessionReady,
      displayName,
      accountType,
      primaryAccountType,
      userProfile,
      registeredAs,
      userMode,
      proServices,
      setRegisteredAs,
      setUserMode,
      hasMotoristAccount,
      hasProAccount,
      proLive,
      setProLive,
      helpingSomeoneElse,
      helpingSomeoneLabel,
      setHelpingSomeoneElse,
      switchAccount,
      signInWithPassword,
      sendPhoneOtp,
      signInWithPhoneOtp,
      addProService,
      removeProService,
      completeSignup,
      completeIdentityVerification,
      verifyCustomerPhoneOtp,
      updateUserProfile,
      login,
      logout,
      location,
      radiusKm,
      category,
      specialtyFilter,
      specialtyPickerOpen,
      query,
      filters,
      selectedTechId,
      technicians,
      visibleTechnicians,
      requests,
      bookings,
      messages,
      visibleMessageThreads,
      locationError,
      isLocating,
      refreshNearbyPros,
      setRadiusKm,
      setCategory,
      setSpecialtyFilter,
      openSpecialtyPicker,
      setQuery,
      toggleFilter,
      setSelectedTechId,
      bookRequest,
      createRequest,
      updateRequestStatus,
      ensureChatForRequest,
      ensureChatForRequestAsync,
      refreshCloudChats,
      sendChatMessage,
      markThreadRead,
      retryLocation,
      setManualLocation,
    }),
    [
      theme,
      toggleTheme,
      setTheme,
      roleReady,
      authReady,
      isAuthenticated,
      backendUserId,
      serverSessionReady,
      displayName,
      accountType,
      primaryAccountType,
      userProfile,
      registeredAs,
      userMode,
      proServices,
      setRegisteredAs,
      setUserMode,
      setRadiusKm,
      hasMotoristAccount,
      hasProAccount,
      proLive,
      setProLive,
      helpingSomeoneElse,
      helpingSomeoneLabel,
      setHelpingSomeoneElse,
      switchAccount,
      signInWithPassword,
      sendPhoneOtp,
      signInWithPhoneOtp,
      addProService,
      removeProService,
      completeSignup,
      completeIdentityVerification,
      verifyCustomerPhoneOtp,
      updateUserProfile,
      login,
      logout,
      location,
      radiusKm,
      category,
      specialtyFilter,
      specialtyPickerOpen,
      query,
      filters,
      selectedTechId,
      technicians,
      visibleTechnicians,
      requests,
      visibleMessageThreads,
      ensureChatForRequest,
      ensureChatForRequestAsync,
      refreshCloudChats,
      sendChatMessage,
      markThreadRead,
      bookings,
      messages,
      locationError,
      isLocating,
      refreshNearbyPros,
      toggleFilter,
      setCategory,
      setSpecialtyFilter,
      openSpecialtyPicker,
      bookRequest,
      createRequest,
      updateRequestStatus,
      retryLocation,
      setManualLocation,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
