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
  AppFilters,
  Booking,
  MessageThread,
  ServiceCategory,
  ServiceRequest,
  Technician,
  UserLocation,
} from "@/lib/types";

export type AppTheme = "light" | "dark";

interface AppState {
  theme: AppTheme;
  toggleTheme: () => void;
  setTheme: (t: AppTheme) => void;
  location: UserLocation;
  radiusMiles: number;
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
  setRadiusMiles: (n: number) => void;
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
  const [location, setLocation] = useState(DEFAULT_USER_LOCATION);
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [category, setCategory] = useState<ServiceCategory>("mechanic");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AppFilters>(defaultFilters);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [bookings] = useState(INITIAL_BOOKINGS);
  const [messages] = useState(INITIAL_MESSAGES);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Initial: system default unless user previously double-clicked to override
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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

  const visibleTechnicians = useMemo(
    () =>
      filterAndRankTechnicians(TECHNICIANS, {
        radiusMiles,
        category,
        query,
        filters,
      }),
    [radiusMiles, category, query, filters]
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
        distanceMiles: tech.distanceMiles,
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
      location,
      radiusMiles,
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
      setRadiusMiles,
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
      location,
      radiusMiles,
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
