"use client";

import { useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Building2, Crosshair, MapPin, Navigation } from "lucide-react";
import { reverseGeocodeLatLng } from "@/lib/google-maps";
import { DEFAULT_USER_LOCATION } from "@/lib/data/technicians";
import {
  knownPlaceNear,
  knownPlaceToPick,
  matchKnownPlaces,
  resolveKnownPlace,
  type KnownPlace,
} from "@/lib/known-places";
import { mapThemeForApp } from "@/lib/map-theme";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { PickedLocation } from "./location-picker-map";

function pinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;margin-left:-14px;margin-top:-28px;border-radius:9999px 9999px 0 9999px;transform:rotate(45deg);background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * OpenStreetMap picker when Google Maps key is rejected or missing.
 * Same curated place search as the Google picker (1st Price Furniture, etc.).
 */
export function OsmLocationPicker({
  value,
  onChange,
  className,
  compact = false,
}: {
  value?: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
  className?: string;
  compact?: boolean;
}) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const mapTheme = mapThemeForApp(isLight);
  const [center, setCenter] = useState({
    lat: value?.lat ?? DEFAULT_USER_LOCATION.coordinates.lat,
    lng: value?.lng ?? DEFAULT_USER_LOCATION.coordinates.lng,
  });
  const [pin, setPin] = useState(center);
  const [query, setQuery] = useState(value?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [knownHits, setKnownHits] = useState<KnownPlace[]>([]);

  const applyPick = useCallback(
    (picked: PickedLocation) => {
      setPin({ lat: picked.lat, lng: picked.lng });
      setCenter({ lat: picked.lat, lng: picked.lng });
      setQuery(picked.label);
      onChange(picked);
      setOpenSuggest(false);
      setStatus(null);
    },
    [onChange]
  );

  const applyKnown = useCallback(
    (place: KnownPlace) => {
      applyPick(knownPlaceToPick(place));
      setStatus(`${place.name} · pinned`);
    },
    [applyPick]
  );

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setBusy(true);
      try {
        const near = knownPlaceNear(lat, lng);
        if (near) {
          applyPick(knownPlaceToPick(near));
          setStatus(`${near.name} · nearby pin snapped`);
          return;
        }
        const rest = await reverseGeocodeLatLng(lat, lng);
        if (rest) {
          const picked: PickedLocation = {
            lat,
            lng,
            label: rest.label,
            city: rest.city,
            area: rest.area,
          };
          applyPick(picked);
          return;
        }
        const fallback: PickedLocation = {
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          city: "Near you",
          area: "Selected pin",
        };
        applyPick(fallback);
        setStatus("Pin saved. Street name could not be loaded yet.");
      } catch {
        setStatus("We could not get the street name. Your pin is still saved.");
        onChange({
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          city: "Near you",
          area: "Selected pin",
        });
      } finally {
        setBusy(false);
      }
    },
    [applyPick, onChange]
  );

  const placePin = useCallback(
    (lat: number, lng: number, geocode = true) => {
      setPin({ lat, lng });
      setCenter({ lat, lng });
      if (geocode) void reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  useEffect(() => {
    if (value?.lat && value?.lng) {
      setPin({ lat: value.lat, lng: value.lng });
      setCenter({ lat: value.lat, lng: value.lng });
      if (value.label) setQuery(value.label);
    }
  }, [value?.lat, value?.lng, value?.label]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Location is not available on this device.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        placePin(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setBusy(false);
        setStatus("Could not read GPS. Tap the map to drop a pin.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const onQueryChange = (text: string) => {
    setQuery(text);
    setOpenSuggest(true);
    setKnownHits(matchKnownPlaces(text, 4).map((r) => r.place));
  };

  const submitSearch = () => {
    const typed = query.trim();
    if (!typed) return;
    const known = resolveKnownPlace(typed) || knownHits[0];
    if (known) {
      applyKnown(known);
      return;
    }
    setStatus("Try “1st Price Furniture Company” or drop a pin on the map.");
    setOpenSuggest(false);
  };

  const showPanel =
    openSuggest && query.trim().length >= 2 && knownHits.length > 0;

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2",
        compact ? "min-h-0" : "min-h-[240px]",
        className
      )}
    >
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setKnownHits(matchKnownPlaces(query, 4).map((r) => r.place));
              setOpenSuggest(true);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpenSuggest(false), 180);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitSearch();
            }
          }}
          placeholder="Search place, street, or company…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-500"
          autoComplete="off"
        />
        {showPanel ? (
          <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-[600] max-h-48 overflow-y-auto rounded-xl border-0 bg-white">
            {knownHits.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-slate-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyKnown(p)}
                >
                  <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold text-slate-900">
                      {p.name}
                    </span>
                    <span className="block text-[10px] font-medium text-slate-500">
                      {p.address}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-black/40"
        style={{ backgroundColor: mapTheme.backgroundColor }}
      >
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          className="h-full w-full"
          style={{
            height: "100%",
            minHeight: 220,
            background: mapTheme.backgroundColor,
            filter: mapTheme.osmFilter,
          }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url={mapTheme.osmTileUrl} />
          <ClickHandler onPick={(lat, lng) => placePin(lat, lng)} />
          <Marker
            position={[pin.lat, pin.lng]}
            icon={pinIcon()}
            title={query || "Selected location"}
          />
        </MapContainer>

        <div className="absolute bottom-2 left-2 right-2 z-[500] flex gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border-0 bg-[#323231] px-3 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
          >
            <Navigation className="h-3.5 w-3.5" />
            My location
          </button>
          <button
            type="button"
            onClick={() => placePin(pin.lat, pin.lng)}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1 rounded-lg border-0 bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow"
            title="Refresh street name"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {status && (
        <p className="text-[11px] font-medium text-[#FF6B35]">{status}</p>
      )}
      {busy && (
        <p className="text-[11px] font-medium text-slate-500">
          Getting street name…
        </p>
      )}
    </div>
  );
}
