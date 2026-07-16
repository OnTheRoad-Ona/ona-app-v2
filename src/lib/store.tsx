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
  INITIAL_BOOKINGS,
  INITIAL_MESSAGES,
  INITIAL_REQUESTS,
  TECHNICIANS,
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
  backendSendMessage,
  backendSetProOnline,
  backendDualRoleFlags,
  backendSaveIdentityVerification,
  backendUpdateProfile,
  backendSendPhoneOtp,
  backendSignIn,
  backendSignInWithPhoneOtp,
  backendSignOut,
  backendSignUp,
  backendSwitchRole,
  backendSubscribeJobs,
  backendSubscribePros,
  backendUpdateJobStatus,
  isAppBackendOnline,
} from "@/lib/supabase/app-api";
import { getVehiclesServedLock } from "@/lib/profile-edit";
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
      profile.docsStatus === "under_review" || profile.docsStatus === "none"
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
    nin: string;
    bvn: string;
  }) => Promise<string | null>;
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
  sendChatMessage: (threadId: string, text: string) => void;
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

  const [location, setLocation] = useState(DEFAULT_USER_LOCATION);
  const [radiusKm, setRadiusKmState] = useState(DEFAULT_RADIUS_KM);
  const [category, setCategory] = useState<ServiceCategory>("mechanic");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AppFilters>(defaultFilters);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [bookings] = useState(INITIAL_BOOKINGS);
  const [messages, setMessages] = useState<MessageThread[]>(INITIAL_MESSAGES);
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
        const uid = await withTimeout(backendGetSessionUserId(), 8000);
        if (cancelled) return;
        if (!uid) {
          clearLocalAuth();
          return;
        }
        const profile = await withTimeout(backendLoadUserProfile(uid), 8000);
        if (cancelled) return;
        if (!profile) {
          clearLocalAuth();
          await backendSignOut().catch(() => undefined);
          return;
        }
        setBackendUserId(uid);
        // Personal theme for this account before painting the shell
        applyAccountTheme(uid);
        // Attach original signup role before session paint
        const flags = await withTimeout(backendDualRoleFlags(uid), 6000);
        if (cancelled) return;
        applySession({
          ...profile,
          primaryAccountType:
            profile.primaryAccountType || flags.primaryAccountType,
        });
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
      } catch {
        if (!cancelled) clearLocalAuth();
      } finally {
        if (!cancelled) {
          setServerSessionReady(true);
          setAuthReady(true);
        }
      }
    })();

    // Absolute safety: never block boot longer than 12s
    const hardCap = window.setTimeout(() => {
      if (cancelled) return;
      setServerSessionReady(true);
      setAuthReady(true);
    }, 12000);

    return () => {
      cancelled = true;
      window.clearTimeout(hardCap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep html[data-theme] in sync immediately so matte-metal CSS applies
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
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
    const withPrimary: UserProfile = {
      ...profile,
      primaryAccountType: primary,
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
      const services = (profile.services ?? []).filter(isProService).slice(0, 1);
      const primary = services[0] ?? "mechanic";
      setProServicesState([primary]);
      setRegisteredAsState(primary);
      setUserModeState("professional");
      try {
        localStorage.setItem(MODE_KEY, "professional");
        localStorage.setItem(ROLE_KEY, primary);
        localStorage.setItem(SERVICES_KEY, JSON.stringify([primary]));
      } catch {
        /* ignore */
      }
      if (profile.serviceRadiusKm != null) {
        setRadiusKmState(
          Math.min(
            MAX_RADIUS_KM,
            Math.max(0.5, profile.serviceRadiusKm ?? DEFAULT_RADIUS_KM)
          )
        );
      }
    }

    if (profile.area || profile.city) {
      setLocation({
        label: [profile.area, profile.city].filter(Boolean).join(", "),
        city: profile.city || profile.area,
        coordinates: DEFAULT_USER_LOCATION.coordinates,
      });
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
        // Fallback only if vault already has a full signup for that role
        const stored = getVaultProfile(type);
        if (stored && stored.accountType === type) {
          applySession(stored);
          return null;
        }
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
      const res = await backendSignIn(email.trim().toLowerCase(), password);
      if (res.error || !res.profile || !res.userId) {
        return res.error || "Email or password is incorrect.";
      }
      // Prefer tab is a hint only — always open the real account type on the server
      if (preferType && res.profile.accountType !== preferType) {
        console.info(
          `[auth] preferType=${preferType} but account is ${res.profile.accountType}`
        );
      }
      setBackendUserId(res.userId);
      const withPrimary: UserProfile = {
        ...res.profile,
        primaryAccountType:
          res.profile.primaryAccountType || res.profile.accountType,
      };
      saveProfileToVault(withPrimary);
      applySession(withPrimary);
      setServerSessionReady(true);
      void backendDualRoleFlags(res.userId).then((flags) => {
        setHasMotoristAccount(
          flags.hasMotorist || res.profile!.accountType === "motorist"
        );
        setHasProAccount(
          flags.hasPro || res.profile!.accountType === "professional"
        );
        // Server timestamps win for primary (original signup)
        if (flags.primaryAccountType) {
          setPrimaryAccountType(flags.primaryAccountType);
          writeStoredPrimaryAccount(flags.primaryAccountType);
          setUserProfile((prev) =>
            prev
              ? { ...prev, primaryAccountType: flags.primaryAccountType }
              : prev
          );
        }
      });
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
      const res = await backendSignInWithPhoneOtp({
        phone,
        code,
        preferType,
      });
      if (res.error || !res.profile || !res.userId) {
        return res.error || "Invalid code.";
      }
      setBackendUserId(res.userId);
      const withPrimary: UserProfile = {
        ...res.profile,
        primaryAccountType:
          res.profile.primaryAccountType || res.profile.accountType,
      };
      saveProfileToVault(withPrimary);
      applySession(withPrimary);
      setServerSessionReady(true);
      void backendDualRoleFlags(res.userId).then((flags) => {
        setHasMotoristAccount(
          flags.hasMotorist || res.profile!.accountType === "motorist"
        );
        setHasProAccount(
          flags.hasPro || res.profile!.accountType === "professional"
        );
        if (flags.primaryAccountType) {
          setPrimaryAccountType(flags.primaryAccountType);
          writeStoredPrimaryAccount(flags.primaryAccountType);
          setUserProfile((prev) =>
            prev
              ? { ...prev, primaryAccountType: flags.primaryAccountType }
              : prev
          );
        }
      });
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

  const completeIdentityVerification = useCallback(
    async (input: { nin: string; bvn: string }): Promise<string | null> => {
      if (!userProfile) return "Sign in to verify your identity.";
      const nin = input.nin.replace(/\D/g, "");
      const bvn = input.bvn.replace(/\D/g, "");
      if (nin.length !== 11) return "NIN must be exactly 11 digits.";
      if (bvn.length !== 11) return "BVN must be exactly 11 digits.";

      if (isAppBackendOnline() && backendUserId) {
        const err = await backendSaveIdentityVerification({
          userId: backendUserId,
          accountType: userProfile.accountType,
          nin,
          bvn,
        });
        if (err) return err;
      } else if (isAppBackendOnline() && !backendUserId) {
        return "Session not linked to server. Sign in again, then verify.";
      }

      const saved: UserProfile = {
        ...userProfile,
        idNumber: nin,
        bvn,
        ninVerified: true,
        bvnVerified: true,
        identityVerifiedAt: new Date().toISOString(),
      };
      persistProfile(saved);

      if (saved.identityId) {
        registerIdentity({
          id: saved.identityId,
          accountType: saved.accountType,
          phone: saved.phone,
          email: saved.email,
          nin,
          bvn,
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
        const services = (next.services ?? userProfile.services ?? []).filter(
          isProService
        );
        next.services = services.length > 0 ? services : userProfile.services;
        if (next.services?.[0]) {
          setProServicesState(next.services.filter(isProService));
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
            await backendUpdateProfile(session.access_token, {
              fullName: next.fullName,
              phone: next.phone,
              city: next.city,
              area: next.area,
              avatarUrl: next.avatarUrl,
              businessName: next.businessName,
              bio: next.bio,
              yearsExperience: next.yearsExperience,
              serviceRadiusKm: next.serviceRadiusKm,
              services: next.services,
              labourPrices: next.servicePrices,
              pricingCurrency: next.pricingCurrency,
              vehicleMake: next.vehicleMake,
              vehicleModel: next.vehicleModel,
              vehicleYear: next.vehicleYear,
              plateNumber: next.vehiclePlate,
              vehiclePhoto: next.vehiclePhoto,
              vehicleCommonIssues: next.vehicleCommonIssues,
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
        avatarUrl: normalized.avatarUrl,
        nin: normalized.idNumber,
        bvn: normalized.bvn,
        labourPrices,
        pricingCurrency: normalized.pricingCurrency,
        skillAnswers: normalized.skillAnswers as
          | Record<string, unknown>
          | undefined,
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
        certificationFileDataUrl: normalized.certificationFileDataUrl,
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
    // Go Away so motorists stop seeing this pro
    if (backendUserId && isAppBackendOnline()) {
      void backendSetProOnline(backendUserId, false);
    }
    void backendSignOut();
    setBackendUserId(null);
    setIsAuthenticated(false);
    setAccountType(null);
    setPrimaryAccountType(null);
    setProLiveState(false);
    setDisplayName("Guest");
    setUserProfile(null);
    // Keep dual vault so both accounts remain for future login / switch after re-auth
    try {
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
  }, [backendUserId]);

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

  /** Directory = demo pros + signed-in Repair Pro (for motorist discovery). */
  const technicians = useMemo(() => {
    const demoFocus = [
      {
        servedVehicleType: "Automobile / Passenger Car",
        servedBrand: "Toyota",
        servedModel: "Camry",
        servedCountry: "Nigeria",
        servedLocation: "Lagos",
      },
      {
        servedVehicleType: "SUV",
        servedBrand: "Honda",
        servedModel: "CR-V",
        servedCountry: "Nigeria",
        servedLocation: "Abuja",
      },
      {
        servedVehicleType: "Motorcycle",
        servedBrand: "Bajaj",
        servedModel: "Boxer",
        servedCountry: "Nigeria",
        servedLocation: "Ibadan",
      },
      {
        servedVehicleType: "Pickup Truck",
        servedBrand: "Toyota",
        servedModel: "Hilux",
        servedCountry: "Nigeria",
        servedLocation: "Port Harcourt",
      },
      {
        servedVehicleType: "Van (Passenger)",
        servedBrand: "Toyota",
        servedModel: "Hiace",
        servedCountry: "Nigeria",
        servedLocation: "Lagos",
      },
    ];
    const seed = TECHNICIANS.map((t, i) => {
      const f = demoFocus[i % demoFocus.length];
      return {
        ...t,
        servedVehicleType: t.servedVehicleType ?? f.servedVehicleType,
        servedBrand: t.servedBrand ?? t.servedMake ?? f.servedBrand,
        servedMake: t.servedBrand ?? t.servedMake ?? f.servedBrand,
        servedModel: t.servedModel ?? f.servedModel,
        servedCountry: t.servedCountry ?? f.servedCountry,
        servedLocation: t.servedLocation ?? f.servedLocation,
      };
    });
    // Marketplace: only server Live pros (is_online + repair_pro role).
    // Motorists never get demo seeds. Pros never load nearby discovery.
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
      }),
    [technicians, radiusKm, category, query, filters]
  );

  const toggleFilter = useCallback((key: keyof AppFilters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const ensureChatForRequest = useCallback(
    (req: ServiceRequest): string => {
      const id = `chat-${req.id}`;
      // Cloud conversation (motorist + pro ids)
      if (isAppBackendOnline() && backendUserId && accountType) {
        const motoristId =
          accountType === "motorist"
            ? backendUserId
            : req.motoristId || backendUserId;
        const repairProId =
          accountType === "professional"
            ? backendUserId
            : req.technicianId;
        if (motoristId && repairProId) {
          void backendEnsureConversation({
            requestId: req.id,
            motoristId,
            repairProId,
          }).then((res) => {
            if (res.conversationId) {
              void backendFetchConversations(backendUserId, accountType).then(
                (threads) => {
                  if (threads.length) setMessages(threads);
                }
              );
            }
          });
        }
      }
      setMessages((prev) => {
        if (prev.some((m) => m.requestId === req.id || m.id === id)) {
          return prev;
        }
        const thread: MessageThread = {
          id,
          requestId: req.id,
          technicianId: req.technicianId,
          technicianName: req.technicianName,
          motoristName: displayName || "Motorist",
          serviceType: req.serviceType,
          lastMessage: `Job: ${req.problem}`,
          time: "now",
          unread: 0,
          photo: "",
          messages: [
            {
              id: `${id}-sys`,
              sender: "system",
              text: `Chat opened for ${req.serviceType} · ${req.problem}`,
              at: new Date().toISOString(),
            },
          ],
        };
        return [thread, ...prev];
      });
      return id;
    },
    [displayName, backendUserId, accountType]
  );

  const sendChatMessage = useCallback(
    (threadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const sender: ChatMessage["sender"] =
        accountType === "professional" ? "professional" : "motorist";
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender,
        text: trimmed,
        at: new Date().toISOString(),
      };
      // Optimistic UI
      setMessages((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                lastMessage: trimmed,
                time: "now",
                messages: [...t.messages, msg],
              }
            : t
        )
      );
      if (isAppBackendOnline() && backendUserId) {
        void backendSendMessage({
          conversationId: threadId,
          senderId: backendUserId,
          body: trimmed,
        });
      }
    },
    [accountType, backendUserId]
  );

  const visibleMessageThreads = useMemo(() => {
    if (accountType === "professional") {
      const skills = new Set(
        [
          ...(proServices ?? []),
          isProService(registeredAs) ? registeredAs : null,
        ].filter(Boolean) as ProService[]
      );
      return messages.filter((m) => skills.has(m.serviceType));
    }
    // Motorist: all their job chats
    return messages;
  }, [messages, accountType, proServices, registeredAs]);

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
      const meetLabel = location.label;
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
        persistProfile({
          ...userProfile,
          serviceActionCount: count + 1,
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
          persistProfile({
            ...userProfile,
            serviceActionCount: count + 1,
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
    if (accountType === "professional") {
      setCloudTechs([]);
      return;
    }
    // /api/pros returns only Live Repair Pros (online + pro role + range)
    void backendFetchPros({ lat: userLat, lng: userLng }).then((list) => {
      // [] is valid: no one is Live right now (do not re-show demo seeds)
      setCloudTechs(list);
    });
  }, [userLat, userLng, accountType]);

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

  // Initial + location-driven pros refresh; poll while browsing so map pins stay live
  useEffect(() => {
    refreshCloudPros();
    const poll = window.setInterval(() => refreshCloudPros(), 20_000);
    return () => window.clearInterval(poll);
  }, [refreshCloudPros]);

  useEffect(() => {
    refreshCloudJobs();
    refreshCloudChats();
  }, [refreshCloudJobs, refreshCloudChats]);

  // Debounce Realtime storms (many row events → one refresh)
  useEffect(() => {
    if (!isAppBackendOnline()) return;
    let prosTimer: ReturnType<typeof setTimeout> | null = null;
    let jobsTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubPros = backendSubscribePros(() => {
      if (prosTimer) clearTimeout(prosTimer);
      prosTimer = setTimeout(() => refreshCloudPros(), 800);
    });
    const unsubJobs = backendUserId
      ? backendSubscribeJobs(backendUserId, () => {
          if (jobsTimer) clearTimeout(jobsTimer);
          jobsTimer = setTimeout(() => {
            refreshCloudJobs();
            refreshCloudChats();
          }, 800);
        })
      : null;
    return () => {
      if (prosTimer) clearTimeout(prosTimer);
      if (jobsTimer) clearTimeout(jobsTimer);
      unsubPros?.();
      unsubJobs?.();
    };
  }, [backendUserId, refreshCloudPros, refreshCloudJobs, refreshCloudChats]);

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

    const pushCoords = (lat: number, lng: number) => {
      void backendSetProOnline(backendUserId, true, { lat, lng });
    };

    let watchId: number | null = null;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          pushCoords(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          pushCoords(userLat, userLng);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      );
    } else {
      pushCoords(userLat, userLng);
    }

    // Backup interval (some browsers throttle watchPosition)
    const id = window.setInterval(() => {
      if (!navigator.geolocation) {
        pushCoords(userLat, userLng);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => pushCoords(pos.coords.latitude, pos.coords.longitude),
        () => pushCoords(userLat, userLng),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 8000 }
      );
    }, 20_000);

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
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

  /** GPS label/coords refresh at most every 10 minutes (stable, no blink). */
  const LOCATION_REFRESH_MS = 10 * 60 * 1000;

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

  const applyGpsFix = useCallback(
    (pos: GeolocationPosition, silent = false) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // Update coords first without wiping a good street label
      setLocation((prev) => ({
        ...prev,
        coordinates: { lat, lng },
        label:
          prev.label && prev.label !== "Live location"
            ? prev.label
            : prev.label || "Current location",
        city: prev.city && prev.city !== "Near you" ? prev.city : prev.city || "Near you",
      }));
      setLocationError(null);
      if (!silent) setIsLocating(false);
      void import("@/lib/google-maps").then(({ reverseGeocodeLatLng }) =>
        reverseGeocodeLatLng(lat, lng).then((geo) => {
          if (!geo) return;
          setLocation((prev) => ({
            ...prev,
            label: geo.area || geo.label || prev.label,
            city: geo.city || prev.city,
            coordinates: { lat, lng },
          }));
        })
      );
    },
    []
  );

  const retryLocation = useCallback(() => {
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
        setLocation(DEFAULT_USER_LOCATION);
        setLocationError(friendlyGeolocationError(err));
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: LOCATION_REFRESH_MS,
      }
    );
  }, [applyGpsFix, friendlyGeolocationError]);

  // Boot: one GPS fix, then refresh only every 10 minutes (no continuous blink)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    setIsLocating(true);

    const pull = (silent: boolean) => {
      if (cancelled) return;
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
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: LOCATION_REFRESH_MS,
        }
      );
    };

    pull(false);
    const intervalId = window.setInterval(
      () => pull(true),
      LOCATION_REFRESH_MS
    );
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyGpsFix, friendlyGeolocationError]);

  const setManualLocation = useCallback(
    (label: string, coords?: { lat: number; lng: number }) => {
      setLocation({
        label,
        city: label,
        coordinates: coords ?? DEFAULT_USER_LOCATION.coordinates,
      });
      setLocationError(null);
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
      updateUserProfile,
      login,
      logout,
      location,
      radiusKm,
      category,
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
      setQuery,
      toggleFilter,
      setSelectedTechId,
      bookRequest,
      createRequest,
      updateRequestStatus,
      ensureChatForRequest,
      sendChatMessage,
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
      updateUserProfile,
      login,
      logout,
      location,
      radiusKm,
      category,
      query,
      filters,
      selectedTechId,
      technicians,
      visibleTechnicians,
      requests,
      visibleMessageThreads,
      ensureChatForRequest,
      sendChatMessage,
      bookings,
      messages,
      locationError,
      isLocating,
      refreshNearbyPros,
      toggleFilter,
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
