"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { Crosshair, MapPin, Navigation, Building2 } from "lucide-react";
import { reverseGeocodeLatLng, shouldUseLiveMaps } from "@/lib/google-maps";
import { useOnaGoogleMaps } from "@/lib/google-maps-loader";
import { DEFAULT_USER_LOCATION } from "@/lib/data/technicians";
import {
  knownPlaceToPick,
  matchKnownPlaces,
  resolveKnownPlace,
  type KnownPlace,
} from "@/lib/known-places";
import { MapTintOverlay } from "@/components/map/map-tint-overlay";
import {
  MAP_STYLE_REVISION,
  applyOnaMapTheme,
  mapContainerStyle as onaMapContainerStyle,
  mapRenderOptions,
  mapThemeForApp,
} from "@/lib/map-theme";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const OsmLocationPicker = dynamic(
  () => import("./osm-location-picker").then((m) => m.OsmLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-52 items-center justify-center rounded-md bg-[#d4d5db] text-[12px] font-medium text-[#475569]">
        Loading live map…
      </div>
    ),
  }
);

export type PickedLocation = {
  lat: number;
  lng: number;
  label: string;
  city: string;
  area: string;
};

type Props = {
  value?: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
  className?: string;
  /** Shorter map for home sheet / compact panels */
  compact?: boolean;
};



type GoogleSuggestion = {
  id: string;
  primary: string;
  secondary: string;
  placeId: string;
};

function parseGeocodeResult(
  result: google.maps.GeocoderResult,
  lat: number,
  lng: number
): PickedLocation {
  const comps = result.address_components ?? [];
  const get = (type: string) =>
    comps.find((c) => c.types.includes(type))?.long_name ?? "";

  const area =
    get("neighborhood") ||
    get("sublocality") ||
    get("sublocality_level_1") ||
    get("route") ||
    get("administrative_area_level_2") ||
    "";
  const city =
    get("locality") ||
    get("administrative_area_level_1") ||
    get("country") ||
    "Nigeria";
  const label =
    result.formatted_address ||
    [area, city].filter(Boolean).join(", ") ||
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // Real street address only — curated POIs are search suggestions, not snaps
  return { lat, lng, label, city, area: area || city };
}

/**
 * Live Google Map location picker for Motorist "Where are you?" and anywhere else.
 * Curated places (e.g. 1st Price Furniture Company) appear only as search suggestions.
 */
export function LocationPickerMap({
  value,
  onChange,
  className,
  compact = false,
}: Props) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const mapTheme = mapThemeForApp(isLight);
  const mapH = compact ? "h-36" : "h-52";
  const live = shouldUseLiveMaps();
  // Shared loader — never pass a different apiKey than other maps.
  const { isLoaded, loadError } = useOnaGoogleMaps();

  const mapRef = useRef<google.maps.Map | null>(null);

  // Match home map palette + street names when light ↔ dark toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyOnaMapTheme(map, isLight);
  }, [isLight]);
  const [center, setCenter] = useState({
    lat: value?.lat ?? DEFAULT_USER_LOCATION.coordinates.lat,
    lng: value?.lng ?? DEFAULT_USER_LOCATION.coordinates.lng,
  });
  const [pin, setPin] = useState(center);
  const [query, setQuery] = useState(value?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [knownHits, setKnownHits] = useState<KnownPlace[]>([]);
  const [googleHits, setGoogleHits] = useState<GoogleSuggestion[]>([]);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null
  );
  const debounceRef = useRef<number | null>(null);

  const applyPick = useCallback(
    (picked: PickedLocation, zoom = 16) => {
      setPin({ lat: picked.lat, lng: picked.lng });
      setCenter({ lat: picked.lat, lng: picked.lng });
      mapRef.current?.panTo({ lat: picked.lat, lng: picked.lng });
      mapRef.current?.setZoom(zoom);
      setQuery(picked.label);
      onChange(picked);
      setOpenSuggest(false);
      setStatus(null);
    },
    [onChange]
  );

  const applyKnown = useCallback(
    (place: KnownPlace) => {
      applyPick(knownPlaceToPick(place), 17);
      setStatus(`${place.name} · pinned`);
    },
    [applyPick]
  );

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setBusy(true);
      try {
        // Always real reverse-geocode for pins / GPS — never snap to curated POI
        const rest = await reverseGeocodeLatLng(lat, lng);
        if (rest) {
          applyPick({
            lat,
            lng,
            label: rest.label,
            city: rest.city,
            area: rest.area,
          });
          return;
        }
        if (window.google?.maps) {
          const geocoder = new google.maps.Geocoder();
          const { results } = await geocoder.geocode({
            location: { lat, lng },
          });
          if (results?.[0]) {
            applyPick(parseGeocodeResult(results[0], lat, lng));
            return;
          }
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
      mapRef.current?.panTo({ lat, lng });
      if (geocode) void reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  const goToMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("GPS not available on this device");
      return;
    }
    setBusy(true);
    setStatus("Getting live GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        placePin(lat, lng, true);
        setBusy(false);
      },
      () => {
        setStatus("We could not get live location. Move the pin or search.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5_000 }
    );
  }, [placePin]);

  const fetchGoogleSuggestions = useCallback(
    (text: string) => {
      if (!isLoaded || !live || !window.google?.maps?.places) {
        setGoogleHits([]);
        return;
      }
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current =
            new google.maps.places.AutocompleteSessionToken();
        }
        const svc = new google.maps.places.AutocompleteService();
        svc.getPlacePredictions(
          {
            input: text,
            componentRestrictions: { country: ["ng"] },
            sessionToken: sessionTokenRef.current,
          },
          (preds, status) => {
            if (
              status !== google.maps.places.PlacesServiceStatus.OK ||
              !preds?.length
            ) {
              setGoogleHits([]);
              return;
            }
            setGoogleHits(
              preds.slice(0, 5).map((p) => ({
                id: p.place_id,
                primary:
                  p.structured_formatting?.main_text ||
                  p.description.split(",")[0] ||
                  p.description,
                secondary:
                  p.structured_formatting?.secondary_text ||
                  p.description,
                placeId: p.place_id,
              }))
            );
          }
        );
      } catch {
        setGoogleHits([]);
      }
    },
    [isLoaded, live]
  );

  const onQueryChange = (text: string) => {
    setQuery(text);
    setOpenSuggest(true);
    const known = matchKnownPlaces(text, 4).map((r) => r.place);
    setKnownHits(known);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setGoogleHits([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      fetchGoogleSuggestions(text.trim());
    }, 220);
  };

  const selectGoogle = (s: GoogleSuggestion) => {
    if (!window.google?.maps?.places || !mapRef.current) {
      // Geocoder fallback by description
      void (async () => {
        const known = resolveKnownPlace(s.primary + " " + s.secondary);
        if (known) {
          applyKnown(known);
          return;
        }
        setBusy(true);
        try {
          const geocoder = new google.maps.Geocoder();
          const { results } = await geocoder.geocode({
            address: `${s.primary}, ${s.secondary}`,
            componentRestrictions: { country: "ng" },
          });
          if (results?.[0]?.geometry?.location) {
            const lat = results[0].geometry.location.lat();
            const lng = results[0].geometry.location.lng();
            applyPick(parseGeocodeResult(results[0], lat, lng), 16);
          }
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

    // If Google row is really our address, prefer curated name
    const knownFromText = resolveKnownPlace(
      `${s.primary} ${s.secondary}`
    );
    if (knownFromText) {
      applyKnown(knownFromText);
      sessionTokenRef.current = null;
      return;
    }

    setBusy(true);
    const svc = new google.maps.places.PlacesService(mapRef.current);
    svc.getDetails(
      {
        placeId: s.placeId,
        fields: ["formatted_address", "geometry", "name", "address_components"],
        sessionToken: sessionTokenRef.current ?? undefined,
      },
      (place, status) => {
        setBusy(false);
        sessionTokenRef.current = null;
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          setStatus("Could not open that place. Try again.");
          return;
        }
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        // Google suggestion → use Google address (curated POI only if user picked from known list)
        if (place.formatted_address) {
          applyPick({
            lat,
            lng,
            label: place.formatted_address,
            city: place.formatted_address,
            area: place.name || place.formatted_address,
          });
        } else {
          void reverseGeocode(lat, lng);
        }
      }
    );
  };

  const submitSearch = () => {
    const typed = query.trim();
    if (!typed) return;
    const known = resolveKnownPlace(typed);
    if (known) {
      applyKnown(known);
      return;
    }
    if (knownHits[0]) {
      applyKnown(knownHits[0]);
      return;
    }
    if (googleHits[0]) {
      selectGoogle(googleHits[0]);
      return;
    }
    // Geocode typed free text
    setBusy(true);
    void (async () => {
      try {
        if (window.google?.maps) {
          const geocoder = new google.maps.Geocoder();
          const { results } = await geocoder.geocode({
            address: typed,
            componentRestrictions: { country: "ng" },
          });
          if (results?.[0]?.geometry?.location) {
            const lat = results[0].geometry.location.lat();
            const lng = results[0].geometry.location.lng();
            applyPick(parseGeocodeResult(results[0], lat, lng), 16);
            return;
          }
        }
        setStatus("Could not find that place. Try a fuller address.");
      } finally {
        setBusy(false);
        setOpenSuggest(false);
      }
    })();
  };

  // Initial GPS once
  useEffect(() => {
    if (!value) {
      goToMyLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value?.label) setQuery(value.label);
    if (value?.lat && value?.lng) {
      setPin({ lat: value.lat, lng: value.lng });
      setCenter({ lat: value.lat, lng: value.lng });
    }
  }, [value?.lat, value?.lng, value?.label]);

  if (!live || loadError) {
    return (
      <OsmLocationPicker
        value={value}
        onChange={onChange}
        className={className}
        compact={compact}
      />
    );
  }

  if (!isLoaded) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md text-[12px] font-medium text-[#a8c9b5]",
          mapH,
          className
        )}
        style={{ backgroundColor: mapTheme.backgroundColor }}
      >
        Loading live map…
      </div>
    );
  }

  const showPanel =
    openSuggest &&
    query.trim().length >= 2 &&
    (knownHits.length > 0 || googleHits.length > 0);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-20 h-3.5 w-3.5 -translate-y-1/2 text-[#FF6B35]" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setKnownHits(matchKnownPlaces(query, 4).map((r) => r.place));
              setOpenSuggest(true);
            }
          }}
          onBlur={() => {
            // Delay so click on suggestion registers
            window.setTimeout(() => setOpenSuggest(false), 180);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitSearch();
            }
            if (e.key === "Escape") setOpenSuggest(false);
          }}
          placeholder="Search place, street, or company…"
          className="h-10 w-full rounded-md border border-[#9A9EA6] bg-[#E2E3E7] py-0 pl-8 pr-3 text-[13px] font-medium text-[#0f172a] outline-none placeholder:text-[#6b7280] focus:border-[#6B7280] focus:bg-[#E8E9ED]"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls="om-location-suggestions"
        />

        {showPanel ? (
          <ul
            id="om-location-suggestions"
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-md border-0 bg-[#E2E3E7]"
          >
            {knownHits.map((p) => (
              <li key={p.id} role="option">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 border-0 bg-transparent px-2.5 py-2.5 text-left hover:bg-[#d4d5db] active:bg-[#c8c9cd]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyKnown(p)}
                >
                  <Building2
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6B35]"
                    strokeWidth={2.2}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold text-[#0f172a]">
                      {p.name}
                    </span>
                    <span className="block text-[10px] font-medium text-[#475569]">
                      {p.address}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {googleHits.map((s) => (
              <li key={s.id} role="option">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 border-0 bg-transparent px-2.5 py-2.5 text-left hover:bg-[#d4d5db] active:bg-[#c8c9cd]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectGoogle(s)}
                >
                  <MapPin
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64748b]"
                    strokeWidth={2.2}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-bold text-[#0f172a]">
                      {s.primary}
                    </span>
                    <span className="block text-[10px] font-medium text-[#475569]">
                      {s.secondary}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-md border border-black/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]",
          mapH
        )}
        data-map-surface
        data-map-engine="google"
        data-map-theme={isLight ? "light" : "dark"}
        data-map-rev={MAP_STYLE_REVISION}
        style={{ backgroundColor: mapTheme.backgroundColor }}
      >
        <GoogleMap
          key={`pick-${MAP_STYLE_REVISION}-${isLight ? "light" : "dark"}`}
          mapContainerStyle={onaMapContainerStyle(isLight, {
            backgroundColor: mapTheme.backgroundColor,
          })}
          center={center}
          zoom={16}
          onLoad={(map) => {
            mapRef.current = map;
            applyOnaMapTheme(map, isLight);
          }}
          onClick={(e) => {
            const lat = e.latLng?.lat();
            const lng = e.latLng?.lng();
            if (lat == null || lng == null) return;
            placePin(lat, lng, true);
          }}
          options={{
            ...mapRenderOptions(isLight),
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            minZoom: 12,
            maxZoom: 19,
          }}
        >
          <Marker
            position={pin}
            draggable
            title={query || "Selected location"}
            onDragEnd={(e) => {
              const lat = e.latLng?.lat();
              const lng = e.latLng?.lng();
              if (lat == null || lng == null) return;
              placePin(lat, lng, true);
            }}
          />
        </GoogleMap>
        <MapTintOverlay isLight={isLight} />

        <button
          type="button"
          onClick={goToMyLocation}
          disabled={busy}
          className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-md border-0 bg-[#323231] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-md active:opacity-90 disabled:opacity-60"
        >
          <Navigation className="h-3.5 w-3.5" strokeWidth={2.4} />
          My location
        </button>
        <div className="pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
          <Crosshair className="h-3 w-3" />
          Tap map or drag pin
        </div>
      </div>

      {(status || value?.label || query) && (
        <p className="text-[11px] leading-snug text-[#475569]">
          {busy
            ? "Updating address…"
            : status || value?.label || query}
        </p>
      )}
    </div>
  );
}
