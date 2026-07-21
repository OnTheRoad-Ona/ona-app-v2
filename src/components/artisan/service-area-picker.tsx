"use client";

/**
 * Full-page list picker for state / cities / LGA during artisan onboarding.
 * Same sheet background as app theme (light gray or black).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  getArtisanProfile,
  saveArtisanProfile,
} from "@/lib/artisan/local-store";
import {
  ARTISAN_STEP_KEY,
  listCities,
  listLgas,
  listStates,
  supportsLga,
} from "@/lib/geo/service-area";
import { profileTheme } from "@/lib/profile-system";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export type ServiceAreaPickerMode = "states" | "cities" | "lgas";

export function ServiceAreaPicker({ mode }: { mode: ServiceAreaPickerMode }) {
  const router = useRouter();
  const { theme, backendUserId, userProfile, displayName } = useApp();
  const isLight = theme === "light";
  const tokens = profileTheme(isLight);
  const sheetBg = tokens.sheetBg;
  const ink = tokens.ink;
  const muted = tokens.muted;

  const userId =
    backendUserId ||
    (typeof window !== "undefined"
      ? localStorage.getItem("oga-mecho-user-id") || "local-pro"
      : "local-pro");

  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [countryCode, setCountryCode] = useState("NG");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedLgas, setSelectedLgas] = useState<string[]>([]);

  useEffect(() => {
    const p = getArtisanProfile(userId);
    if (p?.serviceArea) {
      setCountryCode(p.serviceArea.countryCode || "NG");
      setSelectedState(p.serviceArea.states?.[0] || "");
      setSelectedCities(p.serviceArea.cities || []);
      setSelectedLgas(p.serviceArea.lgas || []);
    }
    setReady(true);
  }, [userId]);

  const title =
    mode === "states"
      ? "States"
      : mode === "cities"
        ? "Cities"
        : "LGA";

  const subtitle =
    mode === "states"
      ? "Pick one state"
      : mode === "cities"
        ? selectedState
          ? selectedState
          : "Choose a state first"
        : selectedState
          ? selectedState
          : "Choose a state first";

  const options = useMemo(() => {
    if (mode === "states") {
      return listStates(countryCode).map((s) => s.name);
    }
    if (mode === "cities") {
      if (!selectedState) return [];
      return listCities(countryCode, selectedState);
    }
    if (!selectedState || !supportsLga(countryCode)) return [];
    return listLgas(countryCode, selectedState);
  }, [mode, countryCode, selectedState]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [options, q]);

  const persist = (next: {
    states?: string[];
    cities?: string[];
    lgas?: string[];
  }) => {
    const p = getArtisanProfile(userId);
    if (!p) return;
    const serviceArea = {
      ...p.serviceArea,
      countryCode: p.serviceArea.countryCode || countryCode,
      countryName: p.serviceArea.countryName || "",
      states: next.states ?? p.serviceArea.states,
      cities: next.cities ?? p.serviceArea.cities,
      lgas: next.lgas ?? p.serviceArea.lgas,
    };
    saveArtisanProfile({ ...p, serviceArea });
  };

  const goBack = () => {
    try {
      sessionStorage.setItem(ARTISAN_STEP_KEY, "essentials");
    } catch {
      /* */
    }
    router.push("/artisan/onboarding");
  };

  const onPickState = (name: string) => {
    setSelectedState(name);
    // Changing state clears cities/LGAs
    setSelectedCities([]);
    setSelectedLgas([]);
    persist({ states: [name], cities: [], lgas: [] });
    goBack();
  };

  const toggleCity = (name: string) => {
    const on = selectedCities.includes(name);
    const cities = on
      ? selectedCities.filter((c) => c !== name)
      : [...selectedCities, name];
    setSelectedCities(cities);
    persist({ cities });
  };

  const toggleLga = (name: string) => {
    const on = selectedLgas.includes(name);
    const lgas = on
      ? selectedLgas.filter((c) => c !== name)
      : [...selectedLgas, name];
    setSelectedLgas(lgas);
    persist({ lgas });
  };

  const isSelected = (name: string) => {
    if (mode === "states") return selectedState === name;
    if (mode === "cities") return selectedCities.includes(name);
    return selectedLgas.includes(name);
  };

  const onRow = (name: string) => {
    if (mode === "states") onPickState(name);
    else if (mode === "cities") toggleCity(name);
    else toggleLga(name);
  };

  if (!ready) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: sheetBg }}
      />
    );
  }

  const needStateFirst =
    (mode === "cities" || mode === "lgas") && !selectedState;

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: sheetBg }}
    >
      <PageHeader
        title={title}
        subtitle={subtitle}
        backHref="/artisan/onboarding"
      />
      <div className="px-3 pb-2">
        <div
          className={cn(
            "flex h-10 items-center gap-2 rounded-md px-3",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
        >
          <Search
            className={cn("h-4 w-4 shrink-0", muted)}
            strokeWidth={2.2}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className={cn(
              "h-full w-full border-0 bg-transparent text-[13px] font-medium outline-none",
              ink
            )}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {needStateFirst ? (
          <p className={cn("px-1 py-4 text-[13px] font-medium", muted)}>
            Choose a state first from Service area · States
          </p>
        ) : filtered.length === 0 ? (
          <p className={cn("px-1 py-4 text-[13px] font-medium", muted)}>
            No matches
          </p>
        ) : (
          <ul
            className={cn(
              "overflow-hidden rounded-md",
              isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
            )}
          >
            {filtered.map((name) => {
              const on = isSelected(name);
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onRow(name)}
                    className={cn(
                      "flex w-full items-center gap-2 border-0 px-3 py-3 text-left",
                      isLight
                        ? "bg-transparent hover:bg-black/[0.04]"
                        : "bg-transparent hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[14px] font-semibold",
                        ink
                      )}
                    >
                      {name}
                    </span>
                    {on ? (
                      <Check className="h-4 w-4 shrink-0 text-[#FF6B35]" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {mode !== "states" && !needStateFirst ? (
          <button
            type="button"
            onClick={goBack}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
          >
            Done
            {mode === "cities" && selectedCities.length
              ? ` (${selectedCities.length})`
              : mode === "lgas" && selectedLgas.length
                ? ` (${selectedLgas.length})`
                : ""}
          </button>
        ) : null}

        <p className={cn("mt-3 px-1 text-center text-[10px] font-medium", muted)}>
          {userProfile?.fullName || displayName || "Pro"} ·{" "}
          {countryCode}
        </p>
      </div>
    </div>
  );
}
