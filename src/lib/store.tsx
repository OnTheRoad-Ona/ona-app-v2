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
import { filterAndRankTechnicians } from "@/lib/matching";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import type {
  AccountType,
  AppFilters,
  Booking,
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

export type AppTheme = "light" | "dark";

const ROLE_KEY = "oga-mecho-role";
const SERVICES_KEY = "oga-mecho-pro-services";
const MODE_KEY = "oga-mecho-mode";
const AUTH_KEY = "oga-mecho-auth";
const AUTH_NAME_KEY = "oga-mecho-auth-name";
const AUTH_ACCOUNT_KEY = "oga-mecho-account-type";
const PROFILE_KEY = "oga-mecho-profile";

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
  return {
    id: SELF_PRO_TECH_ID,
    name,
    shortName: short,
    serviceType: primary,
    roleLabel: profile.businessName?.trim() || label,
    photo: "/technicians/t1.jpg",
    rating: 5,
    reviewCount: 0,
    distanceKm: 0.2,
    etaMinutes: 6,
    status: "available",
    verified: Boolean(profile.idNumber),
    fastResponse: true,
    specialties: services.map((s) => PRO_SERVICE_LABELS[s] ?? s),
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
    servedLocation: profile.servedLocation,
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
  addProService: (service: ProService) => void;
  removeProService: (service: ProService) => void;
  /**
   * Complete Motorist or Repair Pro registration and sign in.
   * Persists profile + role for session restore.
   * Enforces unique phone / email / NIN / BVN across accounts.
   * Returns an error message when identity is already taken.
   */
  completeSignup: (profile: UserProfile) => string | null;
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
  locationError: string | null;
  isLocating: boolean;
  setRadiusKm: (n: number) => void;
  setCategory: (c: ServiceCategory) => void;
  setQuery: (q: string) => void;
  toggleFilter: (key: keyof AppFilters) => void;
  setSelectedTechId: (id: string | null) => void;
  createRequest: (tech: Technician, problem?: string) => ServiceRequest;
  updateRequestStatus: (id: string, status: ServiceRequest["status"]) => void;
  retryLocation: () => void;
  setManualLocation: (label: string) => void;
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

  const [location, setLocation] = useState(DEFAULT_USER_LOCATION);
  const [radiusKm, setRadiusKm] = useState(10);
  const [category, setCategory] = useState<ServiceCategory>("mechanic");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AppFilters>(defaultFilters);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [bookings] = useState(INITIAL_BOOKINGS);
  const [messages] = useState(INITIAL_MESSAGES);
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
      const rawProfile = localStorage.getItem(PROFILE_KEY);
      if (rawProfile) {
        try {
          setUserProfile(JSON.parse(rawProfile) as UserProfile);
        } catch {
          /* ignore */
        }
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

  const setUserMode = useCallback(
    (mode: UserMode) => {
      // Pros cannot enter client mode; motorists cannot enter pro mode.
      // Only matching account type may use that workspace.
      if (accountType === "professional" && mode === "client") return;
      if (accountType === "motorist" && mode === "professional") return;
      setUserModeState(mode);
      try {
        localStorage.setItem(MODE_KEY, mode);
      } catch {
        /* ignore */
      }
    },
    [accountType]
  );

  const completeSignup = useCallback(
    (profile: UserProfile): string | null => {
      // One account type per session identity — cannot open a second pro
      // registration while already a professional on this device session.
      if (
        profile.accountType === "professional" &&
        isAuthenticated &&
        accountType === "professional"
      ) {
        return "You already have a Repair Professional account. Only one professional signup is allowed.";
      }

      const identityId =
        profile.identityId ||
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

      const name = normalized.fullName.trim() || "User";
      const saved: UserProfile = { ...normalized, identityId };
      setUserProfile(saved);
      setDisplayName(name);
      setAccountType(normalized.accountType);
      setIsAuthenticated(true);

      try {
        localStorage.setItem(AUTH_KEY, "1");
        localStorage.setItem(AUTH_NAME_KEY, name);
        localStorage.setItem(AUTH_ACCOUNT_KEY, normalized.accountType);
        localStorage.setItem(PROFILE_KEY, JSON.stringify(saved));
      } catch {
        /* ignore */
      }

      if (normalized.accountType === "motorist") {
        setRegisteredAs("client");
        setUserModeState("client");
        try {
          localStorage.setItem(MODE_KEY, "client");
        } catch {
          /* ignore */
        }
        if (normalized.area || normalized.city) {
          setLocation({
            label: [normalized.area, normalized.city]
              .filter(Boolean)
              .join(", "),
            city: normalized.city || normalized.area,
            coordinates: DEFAULT_USER_LOCATION.coordinates,
          });
        }
      } else {
        const services = (normalized.services ?? [])
          .filter(isProService)
          .slice(0, 1);
        const primary = services[0] ?? "mechanic";
        setProServicesState([primary]);
        try {
          localStorage.setItem(SERVICES_KEY, JSON.stringify([primary]));
        } catch {
          /* ignore */
        }
        setRegisteredAs(primary);
        setUserModeState("professional");
        try {
          localStorage.setItem(MODE_KEY, "professional");
        } catch {
          /* ignore */
        }
        if (normalized.serviceRadiusKm != null) {
          setRadiusKm(Math.min(10, Math.max(1, normalized.serviceRadiusKm)));
        }
        if (normalized.area || normalized.city) {
          setLocation({
            label: [normalized.area, normalized.city]
              .filter(Boolean)
              .join(", "),
            city: normalized.city || normalized.area,
            coordinates: DEFAULT_USER_LOCATION.coordinates,
          });
        }
      }
      return null;
    },
    [setRegisteredAs, isAuthenticated, accountType]
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
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_NAME_KEY);
      localStorage.removeItem(AUTH_ACCOUNT_KEY);
      localStorage.removeItem(PROFILE_KEY);
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
      return req;
    },
    [location.label]
  );

  const updateRequestStatus = useCallback(
    (id: string, status: ServiceRequest["status"]) => {
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
    },
    []
  );

  const retryLocation = useCallback(() => {
    // Keep Ikeja as the designed default; only upgrade when GPS succeeds.
    setIsLocating(true);
    setLocationError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setIsLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          label: "Current location",
          city: "Near you",
          coordinates: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
        });
        setIsLocating(false);
      },
      () => {
        // Silent fallback — product demo stays on Ikeja, Lagos (design default)
        setLocation(DEFAULT_USER_LOCATION);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60_000 }
    );
  }, []);

  const setManualLocation = useCallback((label: string) => {
    setLocation({
      label,
      city: label,
      coordinates: DEFAULT_USER_LOCATION.coordinates,
    });
    setLocationError(null);
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
      addProService,
      removeProService,
      completeSignup,
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
      locationError,
      isLocating,
      setRadiusKm,
      setCategory,
      setQuery,
      toggleFilter,
      setSelectedTechId,
      createRequest,
      updateRequestStatus,
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
      addProService,
      removeProService,
      completeSignup,
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
      locationError,
      isLocating,
      toggleFilter,
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
