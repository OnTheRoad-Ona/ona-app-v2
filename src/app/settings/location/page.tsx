"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  LocationPickerMap,
  type PickedLocation,
} from "@/components/map/location-picker-map";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Full-page location picker (Settings → My location).
 */
export default function SettingsLocationPage() {
  const { theme, location, setManualLocation } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const [saved, setSaved] = useState(false);

  const value = useMemo(
    () => ({
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
      label: location.label || "",
      city: "",
      area: "",
    }),
    [location.coordinates.lat, location.coordinates.lng, location.label]
  );

  const onChange = (loc: PickedLocation) => {
    setManualLocation(loc.label || `${loc.area}, ${loc.city}`, {
      lat: loc.lat,
      lng: loc.lng,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("location.title")}
        subtitle={location.label || t("location.subtitle")}
        backHref="/settings"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <p
          className={cn(
            "mb-2 text-[12px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/65"
          )}
        >
          {t("location.hint")}
        </p>
        {saved ? (
          <p className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800">
            {t("location.saved")}
          </p>
        ) : null}
        <LocationPickerMap value={value} onChange={onChange} />
      </div>
    </div>
  );
}
