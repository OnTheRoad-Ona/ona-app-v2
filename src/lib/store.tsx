"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  findProfilesForLogin,
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
const PROFILE_KEY = LEGACY_PROFILE_KEY;

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
    photo: "/technicians/t1.jpg",
    rating: 5,
    reviewCount: 0,
    distanceKm: 0.2,
    etaMinutes: 6,
    status: "available",
    verified: Boolean(profile.ninVerified && profile.bvnVerified),
    fastResponse: true,
    specialties:
      specialtiesFromSignup.length > 0
        ? specialtiesFromSignup
        : [PRO_SERVICE_LABELS[primary] ?? primary],
    description:
      profile.bio?.trim() ||
      `${focusLine} Based in ${[profile.area, profile.city].filter(Boolean).join(", ") || "Lagos"}.`,
    phone: profile.phone || "+234 800 000 0000",
    serviceRadiusKm: profile.serviceRadiusKm ?? 8,
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
  displayName: string;
  accountType: AccountType | null;
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
   * Switch active session to Motorist or Repair Pro.
   * Requires a separate signup for that type (not one shared login).
   * Returns null on success, or an error / "needs_signup" | "needs_login" code.
   */
  switchAccount: (
    type: AccountType
  ) => null | "needs_signup" | "needs_login" | string;
  /**
   * Log in with email + password against the dual vault.
   * Optionally prefer a specific account type when both match.
   */
  signInWithPassword: (
    email: string,
    password: string,
    preferType?: AccountType
  ) => string | null;
  addProService: (service: ProService) => void;
  removeProService: (service: ProService) => void;
  /**
   * Complete Motorist or Repair Pro registration and sign in.
   * Each type is a separate account; one person may register both.
   */
  completeSignup: (profile: UserProfile) => string | null;
  /**
   * Post-signup NIN + BVN verification. Unlocks unlimited book/accept.
   * Returns error message or null on success.
   */
  completeIdentityVerification: (input: {
    nin: string;
    bvn: string;
  }) => string | null;
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
    problem?: string
  ) => ServiceActionResult;
  /** @deprecated use bookRequest — still creates without gate for internal/demo */
  createRequest: (tech: Technician, problem?: string) => ServiceRequest;
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

  // Role / mode — registration drives first open
  const [roleReady, setRoleReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [displayName, setDisplayName] = useState("Guest");
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [registeredAs, setRegisteredAsState] = useState<RegisteredAs>("client");
  const [userMode, setUserModeState] = useState<UserMode>("client");
  const [proServices, setProServicesState] = useState<ProService[]>([]);
  const [hasMotoristAccount, setHasMotoristAccount] = useState(false);
  const [hasProAccount, setHasProAccount] = useState(false);

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

  // Initial: system default unless user set a preference (toggle / menu)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("oga-mecho-theme") as AppTheme | null;
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

  // Hydrate registration + mode + pro services + auth
  useEffect(() => {
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
      // Ensure primary pro registration is always in services
      if (isProService(role) && !services.includes(role)) {
        services = [role, ...services];
      }
      setProServicesState(services);

      // Prefer last session mode; else open as registered role
      const rawMode = localStorage.getItem(MODE_KEY);
      if (rawMode === "client" || rawMode === "professional") {
        setUserModeState(rawMode);
      } else {
        setUserModeState(role === "client" ? "client" : "professional");
      }

      const authed = localStorage.getItem(AUTH_KEY) === "1";
      setIsAuthenticated(authed);
      const name = localStorage.getItem(AUTH_NAME_KEY);
      if (name) setDisplayName(name);
      const rawAccount = localStorage.getItem(AUTH_ACCOUNT_KEY);
      if (rawAccount === "motorist" || rawAccount === "professional") {
        setAccountType(rawAccount);
      } else if (authed) {
        setAccountType(role === "client" ? "motorist" : "professional");
      }
      const vault = readProfilesVault();
      setHasMotoristAccount(Boolean(vault.motorist));
      setHasProAccount(Boolean(vault.professional));

      const rawProfile = localStorage.getItem(PROFILE_KEY);
      if (rawProfile) {
        try {
          setUserProfile(JSON.parse(rawProfile) as UserProfile);
        } catch {
          /* ignore */
        }
      } else if (authed) {
        const type =
          rawAccount === "professional" || rawAccount === "motorist"
            ? rawAccount
            : vault.professional
              ? "professional"
              : "motorist";
        const fromVault = getVaultProfile(type);
        if (fromVault) setUserProfile(fromVault);
      }
    } catch {
      setRegisteredAsState("client");
      setUserModeState("client");
      setProServicesState([]);
      setIsAuthenticated(false);
    }
    setRoleReady(true);
    setAuthReady(true);
  }, []);

  // Keep html[data-theme] in sync immediately so matte-metal CSS applies
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [theme]);

  // Follow OS theme when user has not set an override
  useEffect(() => {
    if (!themeReady) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        const saved = localStorage.getItem("oga-mecho-theme");
        if (saved === "light" || saved === "dark") return; // manual override
      } catch {
        /* ignore */
      }
      setThemeState(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeReady]);

  const setTheme = useCallback((t: AppTheme) => {
    setThemeState(t);
    try {
      localStorage.setItem("oga-mecho-theme", t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => {
      const next = t === "light" ? "dark" : "light";
      try {
        localStorage.setItem("oga-mecho-theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

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
    setUserProfile(profile);
    setDisplayName(name);
    setAccountType(profile.accountType);
    setIsAuthenticated(true);

    try {
      localStorage.setItem(AUTH_KEY, "1");
      localStorage.setItem(AUTH_NAME_KEY, name);
      localStorage.setItem(AUTH_ACCOUNT_KEY, profile.accountType);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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
  }, []);

  const switchAccount = useCallback(
    (type: AccountType): null | "needs_signup" | "needs_login" | string => {
      const stored = getVaultProfile(type);
      if (!stored) {
        return "needs_signup";
      }
      // Must have logged into the app at least once this session or stay signed in
      if (!isAuthenticated && localStorage.getItem(AUTH_KEY) !== "1") {
        return "needs_login";
      }
      applySession(stored);
      return null;
    },
    [applySession, isAuthenticated]
  );

  const setUserMode = useCallback(
    (mode: UserMode) => {
      const target: AccountType =
        mode === "professional" ? "professional" : "motorist";
      const result = switchAccount(target);
      if (result === null) return;
      // If switch failed, still update mode only when same type is active
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
    },
    [switchAccount, accountType]
  );

  const signInWithPassword = useCallback(
    (
      email: string,
      password: string,
      preferType?: AccountType
    ): string | null => {
      const hits = findProfilesForLogin(email, password);
      if (hits.length === 0) {
        return "Email or password is incorrect.";
      }
      let pick = hits[0];
      if (preferType) {
        pick = hits.find((h) => h.accountType === preferType) ?? pick;
      } else if (accountType) {
        pick = hits.find((h) => h.accountType === accountType) ?? pick;
      }
      applySession(pick);
      return null;
    },
    [applySession, accountType]
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
    (input: { nin: string; bvn: string }): string | null => {
      if (!userProfile) return "Sign in to verify your identity.";
      const nin = input.nin.replace(/\D/g, "");
      const bvn = input.bvn.replace(/\D/g, "");
      if (nin.length !== 11) return "NIN must be exactly 11 digits.";
      if (bvn.length !== 11) return "BVN must be exactly 11 digits.";

      const saved: UserProfile = {
        ...userProfile,
        idNumber: nin,
        bvn,
        ninVerified: true,
        bvnVerified: true,
        identityVerifiedAt: new Date().toISOString(),
      };
      persistProfile(saved);

      // Keep registry in sync with verified numbers
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
    [userProfile, persistProfile]
  );

  const completeSignup = useCallback(
    (profile: UserProfile): string | null => {
      // Separate signup per type — block only duplicate of the same type
      const existing = getVaultProfile(profile.accountType);
      if (existing && !profile.identityId) {
        return profile.accountType === "professional"
          ? "You already have a Repair Pro account on this device. Log in or switch from the menu."
          : "You already have a Motorist account on this device. Log in or switch from the menu.";
      }

      const identityId =
        profile.identityId ||
        existing?.identityId ||
        `acct-${profile.accountType}-${Date.now().toString(36)}`;

      // Pros: enforce single skill on profile
      const normalized: UserProfile =
        profile.accountType === "professional"
          ? {
              ...profile,
              services: (profile.services ?? []).filter(isProService).slice(0, 1),
            }
          : profile;

      const reg = registerIdentity({
        id: identityId,
        accountType: normalized.accountType,
        phone: normalized.phone,
        email: normalized.email,
        nin: normalized.idNumber,
        bvn: normalized.bvn,
        fullName: normalized.fullName,
        createdAt: normalized.registeredAt || new Date().toISOString(),
      });
      if (!reg.ok) return reg.message;

      // Signup IDs are collected but not live-verified yet — in-app /verify does that
      const saved: UserProfile = {
        ...normalized,
        identityId,
        serviceActionCount:
          normalized.serviceActionCount ?? existing?.serviceActionCount ?? 0,
        ninVerified: normalized.ninVerified ?? existing?.ninVerified ?? false,
        bvnVerified: normalized.bvnVerified ?? existing?.bvnVerified ?? false,
      };
      saveProfileToVault(saved);
      applySession(saved);
      return null;
    },
    [applySession]
  );

  const login = useCallback(
    (opts: {
      accountType: AccountType;
      name?: string;
      proService?: ProService;
      proServices?: ProService[];
    }) => {
      const name =
        opts.name?.trim() ||
        (opts.accountType === "motorist" ? "Motorist" : "Repair Professional");
      const services =
        opts.proServices?.filter(isProService).slice(0, 2) ??
        (opts.proService && isProService(opts.proService)
          ? [opts.proService]
          : undefined);

      // Dev/quick login skips registry (empty phone/email) — demo only
      completeSignup({
        accountType: opts.accountType,
        fullName: name,
        phone: `+23480${String(Date.now()).slice(-8)}`,
        email: `${name.replace(/\s+/g, "").toLowerCase()}.${Date.now()}@demo.local`,
        password: "demo-pass",
        city: "Lagos",
        area: "Ikeja",
        services: services?.slice(0, 1),
        serviceRadiusKm: 10,
        registeredAt: new Date().toISOString(),
      });
    },
    [completeSignup]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setAccountType(null);
    setDisplayName("Guest");
    setUserProfile(null);
    // Keep dual vault so both accounts remain for future login / switch after re-auth
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_NAME_KEY);
      localStorage.removeItem(AUTH_ACCOUNT_KEY);
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
    const base = TECHNICIANS.map((t, i) => {
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
    const self = userProfile ? profileToTechnician(userProfile) : null;
    if (!self) return base;
    return [self, ...base.filter((t) => t.id !== SELF_PRO_TECH_ID)];
  }, [userProfile]);

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
    [displayName]
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
    },
    [accountType]
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
    (tech: Technician, problem = "Roadside assistance") => {
      const req: ServiceRequest = {
        id: `r-${Date.now()}`,
        technicianId: tech.id,
        technicianName: tech.name,
        serviceType: tech.serviceType,
        problem,
        status: "pending",
        createdAt: new Date().toISOString(),
        etaMinutes: tech.etaMinutes,
        distanceKm: tech.distanceKm,
        locationLabel: location.label,
      };
      setRequests((prev) => [req, ...prev]);
      // Auto-open dedicated motorist↔pro thread for this job
      ensureChatForRequest(req);
      return req;
    },
    [location.label, ensureChatForRequest]
  );

  const bookRequest = useCallback(
    (tech: Technician, problem = "Roadside assistance"): ServiceActionResult => {
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
      const req = createRequest(tech, problem);
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
    ]
  );

  /** GPS label/coords refresh at most every 10 minutes (stable, no blink). */
  const LOCATION_REFRESH_MS = 10 * 60 * 1000;

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
      setLocationError("Location unavailable on this device");
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyGpsFix(pos, false),
      (err) => {
        setLocation(DEFAULT_USER_LOCATION);
        setLocationError(err.message || "Using Ikeja default");
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: LOCATION_REFRESH_MS,
      }
    );
  }, [applyGpsFix]);

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
        () => {
          if (!cancelled && !silent) setIsLocating(false);
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
  }, [applyGpsFix]);

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
      displayName,
      accountType,
      userProfile,
      registeredAs,
      userMode,
      proServices,
      setRegisteredAs,
      setUserMode,
      hasMotoristAccount,
      hasProAccount,
      switchAccount,
      signInWithPassword,
      addProService,
      removeProService,
      completeSignup,
      completeIdentityVerification,
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
      displayName,
      accountType,
      userProfile,
      registeredAs,
      userMode,
      proServices,
      setRegisteredAs,
      setUserMode,
      setRadiusKm,
      hasMotoristAccount,
      hasProAccount,
      switchAccount,
      signInWithPassword,
      addProService,
      removeProService,
      completeSignup,
      completeIdentityVerification,
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
