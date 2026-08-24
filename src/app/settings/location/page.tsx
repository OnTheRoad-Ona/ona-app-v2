"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  LocationPickerMap,
  type PickedLocation,
} from "@/components/map/location-picker-map";
import { SettingsComingSoon } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type AddressLabel = "Home" | "Work" | "Other";

type SavedAddress = {
  id: string;
  label: AddressLabel;
  customLabel?: string;
  text: string;
  lat: number;
  lng: number;
};

const ADDR_KEY = "ona-saved-addresses-v1";

function loadAddresses(uid: string): SavedAddress[] {
  try {
    const raw = localStorage.getItem(`${ADDR_KEY}:${uid}`);
    if (!raw) return [];
    const p = JSON.parse(raw) as SavedAddress[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function saveAddresses(uid: string, list: SavedAddress[]) {
  try {
    localStorage.setItem(`${ADDR_KEY}:${uid}`, JSON.stringify(list));
  } catch {
    /* */
  }
}

/**
 * Customer: service pin + labeled saved addresses (Home / Work / Other).
 * Pro: service area pin (coverage radius lives under Availability).
 */
export default function SettingsLocationPage() {
  const {
    theme,
    location,
    setManualLocation,
    accountType,
    userProfile,
    backendUserId,
  } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const uid = backendUserId || userProfile?.email || "guest";
  const [saved, setSaved] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [label, setLabel] = useState<AddressLabel>("Home");
  const [customLabel, setCustomLabel] = useState("");

  useEffect(() => {
    setAddresses(loadAddresses(uid));
  }, [uid]);

  const value = useMemo(
    () => ({
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
      label: location.label || "",
      city: "",
      area: "",
    }),
    [location.coordinates.lat, location.coordinates.lng, location.label],
  );

  const onChange = (loc: PickedLocation) => {
    setManualLocation(loc.label || `${loc.area}, ${loc.city}`, {
      lat: loc.lat,
      lng: loc.lng,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const addSavedAddress = () => {
    if (!location.label?.trim()) return;
    const entry: SavedAddress = {
      id: `${Date.now()}`,
      label,
      customLabel:
        label === "Other" ? customLabel.trim() || "Other" : undefined,
      text: location.label,
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
    };
    const next = [
      ...addresses.filter((a) => a.label !== label || label === "Other"),
      entry,
    ].slice(0, 8);
    setAddresses(next);
    saveAddresses(uid, next);
  };

  const removeAddress = (id: string) => {
    const next = addresses.filter((a) => a.id !== id);
    setAddresses(next);
    saveAddresses(uid, next);
  };

  const applySavedAddress = (a: SavedAddress) => {
    setManualLocation(a.text, { lat: a.lat, lng: a.lng });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader
        title={isPro ? "Service area" : "Addresses & location"}
        subtitle={
          isPro
            ? location.label || "Pin where you work from"
            : location.label || "Service pin & saved places"
        }
        backHref="/settings"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {isPro ? (
          <p
            className={cn(
              "mb-2 text-[12px] font-medium leading-snug",
              isLight ? "text-slate-600" : "text-white/65",
            )}
          >
            Set your base location. Coverage radius is under Availability
          </p>
        ) : null}
        {saved ? (
          <p className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800">
            {t("location.saved")}
          </p>
        ) : null}
        <LocationPickerMap value={value} onChange={onChange} />

        {!isPro ? (
          <div
            className={cn(
              "mt-3 space-y-2 rounded-md px-3 py-3",
              "bg-transparent",
            )}
          >
            <p
              className={cn(
                "text-[13px] font-bold",
                isLight ? "text-slate-900" : "text-white",
              )}
            >
              Save current pin as
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["Home", "Work", "Other"] as AddressLabel[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabel(l)}
                  className={cn(
                    "rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                    label === l
                      ? "bg-[#FF6B35] text-white"
                      : isLight
                        ? "bg-black/10 text-slate-700"
                        : "bg-white/10 text-white/70",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {label === "Other" ? (
              <input
                className={cn(
                  "h-10 w-full rounded-md border-0 px-3 text-[13px] font-medium outline-none",
                  isLight
                    ? "bg-black/[0.06] text-slate-900"
                    : "bg-white/[0.08] text-white",
                )}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Label (e.g. Mum’s house)"
              />
            ) : null}
            <button
              type="button"
              onClick={addSavedAddress}
              disabled={!location.label?.trim()}
              className="flex h-10 w-full items-center justify-center rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white disabled:opacity-50"
            >
              Save labeled address
            </button>

            {addresses.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {addresses.map((a) => (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded-md px-2.5 py-2",
                      isLight ? "bg-black/[0.05]" : "bg-white/[0.06]",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[12px] font-bold",
                        isLight ? "text-slate-900" : "text-white",
                      )}
                    >
                      {a.label === "Other" ? a.customLabel || "Other" : a.label}
                    </p>
                    <p
                      className={cn(
                        "text-[11px] font-medium leading-snug",
                        isLight ? "text-slate-600" : "text-white/60",
                      )}
                    >
                      {a.text}
                    </p>
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        className="text-[11px] font-bold text-[#FF6B35]"
                        onClick={() => applySavedAddress(a)}
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        className="text-[11px] font-bold text-red-500"
                        onClick={() => removeAddress(a.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <p
              className={cn(
                "text-[10px] font-medium",
                isLight ? "text-slate-500" : "text-white/40",
              )}
            >
              Stored on this device
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <SettingsComingSoon
              isLight={isLight}
              title="Multiple service zones"
            />
          </div>
        )}
      </div>
    </div>
  );
}
