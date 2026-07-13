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
import { filterAndRankTechnicians } from "@/lib/matching";
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
} from "@/lib/types";

export type AppTheme = "light" | "dark";

const ROLE_KEY = "oga-mecho-role";
const SERVICES_KEY = "oga-mecho-pro-services";
const MODE_KEY = "oga-mecho-mode";
const AUTH_KEY = "oga-mecho-auth";
const AUTH_NAME_KEY = "oga-mecho-auth-name";
const AUTH_ACCOUNT_KEY = "oga-mecho-account-type";

const ALL_PRO_SERVICES: ProService[] = [
  "mechanic",
  "vulcanizer",
  "towing",
  "wash",
];

function isProService(v: string): v is ProService {
  return ALL_PRO_SERVICES.includes(v as ProService);
}

function isRegisteredAs(v: string | null): v is RegisteredAs {
  return v === "client" || (v != null && isProService(v));
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
  /** Sign up / log in as Motorist or Repair Professional */
  login: (opts: {
    accountType: AccountType;
    name?: string;
    proService?: ProService;
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

  const setUserMode = useCallback((mode: UserMode) => {
    setUserModeState(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const login = useCallback(
    (opts: {
      accountType: AccountType;
      name?: string;
      proService?: ProService;
    }) => {
      const name =
        opts.name?.trim() ||
        (opts.accountType === "motorist" ? "Motorist" : "Repair Professional");
      setDisplayName(name);
      setAccountType(opts.accountType);
      setIsAuthenticated(true);

      try {
        localStorage.setItem(AUTH_KEY, "1");
        localStorage.setItem(AUTH_NAME_KEY, name);
        localStorage.setItem(AUTH_ACCOUNT_KEY, opts.accountType);
      } catch {
        /* ignore */
      }

      if (opts.accountType === "motorist") {
        setRegisteredAs("client");
      } else {
        const svc: ProService =
          opts.proService && isProService(opts.proService)
            ? opts.proService
            : "mechanic";
        setRegisteredAs(svc);
      }
    },
    [setRegisteredAs]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setAccountType(null);
    setDisplayName("Guest");
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_NAME_KEY);
      localStorage.removeItem(AUTH_ACCOUNT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const addProService = useCallback((service: ProService) => {
    setProServicesState((prev) => {
      if (prev.includes(service)) return prev;
      const next = [...prev, service];
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

  const visibleTechnicians = useMemo(
    () =>
      filterAndRankTechnicians(TECHNICIANS, {
        radiusKm,
        category,
        query,
        filters,
      }),
    [radiusKm, category, query, filters]
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
      registeredAs,
      userMode,
      proServices,
      setRegisteredAs,
      setUserMode,
      addProService,
      removeProService,
      login,
      logout,
      location,
      radiusKm,
      category,
      query,
      filters,
      selectedTechId,
      technicians: TECHNICIANS,
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
      registeredAs,
      userMode,
      proServices,
      setRegisteredAs,
      setUserMode,
      addProService,
      removeProService,
      login,
      logout,
      location,
      radiusKm,
      category,
      query,
      filters,
      selectedTechId,
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
