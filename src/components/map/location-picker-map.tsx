"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Crosshair, MapPin, Navigation } from "lucide-react";
import {
  getGoogleMapsApiKey,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  reverseGeocodeLatLng,
  shouldUseLiveMaps,
} from "@/lib/google-maps";
import { DEFAULT_USER_LOCATION } from "@/lib/data/technicians";
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
};

const mapContainerStyle = { width: "100%", height: "100%" };

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

  return { lat, lng, label, city, area: area || city };
}

/**
 * Live Google Map location picker for Motorist "Where are you?" and anywhere else.
 */
export function LocationPickerMap({ value, onChange, className }: Props) {
  const apiKey = getGoogleMapsApiKey();
  const live = shouldUseLiveMaps();
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: live ? apiKey : "disabled",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const [center, setCenter] = useState({
    lat: value?.lat ?? DEFAULT_USER_LOCATION.coordinates.lat,
    lng: value?.lng ?? DEFAULT_USER_LOCATION.coordinates.lng,
  });
  const [pin, setPin] = useState(center);
  const [query, setQuery] = useState(value?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setBusy(true);
      try {
        // Prefer REST geocode (works without Places JS library)
        const rest = await reverseGeocodeLatLng(lat, lng);
        if (rest) {
          const picked: PickedLocation = {
            lat,
            lng,
            label: rest.label,
            city: rest.city,
            area: rest.area,
          };
          setQuery(picked.label);
          onChange(picked);
          setStatus(null);
          return;
        }
        if (window.google?.maps) {
          const geocoder = new google.maps.Geocoder();
          const { results } = await geocoder.geocode({
            location: { lat, lng },
          });
          if (results?.[0]) {
            const picked = parseGeocodeResult(results[0], lat, lng);
            setQuery(picked.label);
            onChange(picked);
            setStatus(null);
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
        setQuery(fallback.label);
        onChange(fallback);
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
    [onChange]
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

  const useMyLocation = useCallback(() => {
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
        setStatus("Live GPS location set");
        setBusy(false);
      },
      () => {
        setStatus("We could not get live location. Move the pin or search.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5_000 }
    );
  }, [placePin]);

  // Optional Places autocomplete if the library is available (not required)
  useEffect(() => {
    if (!isLoaded || !live || !inputRef.current) return;
    if (!window.google?.maps?.places) return;
    if (autocompleteRef.current) return;
    try {
      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "geometry", "address_components", "name"],
        componentRestrictions: { country: ["ng"] },
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;
        const lat = loc.lat();
        const lng = loc.lng();
        setPin({ lat, lng });
        setCenter({ lat, lng });
        mapRef.current?.panTo({ lat, lng });
        mapRef.current?.setZoom(16);
        if (place.formatted_address) {
          setQuery(place.formatted_address);
          onChange({
            lat,
            lng,
            label: place.formatted_address,
            city: place.formatted_address,
            area: place.name || place.formatted_address,
          });
        } else {
          void reverseGeocode(lat, lng);
        }
      });
      autocompleteRef.current = ac;
    } catch {
      /* Places optional */
    }
  }, [isLoaded, live, onChange, reverseGeocode]);

  // Initial GPS once
  useEffect(() => {
    if (!value) {
      useMyLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!live || loadError) {
    return (
      <OsmLocationPicker
        value={value}
        onChange={onChange}
        className={className}
      />
    );
  }

  if (!isLoaded) {
    return (
      <div
        className={cn(
          "flex h-52 items-center justify-center rounded-md bg-[#d4d5db] text-[12px] font-medium text-[#475569]",
          className
        )}
      >
        Loading live map…
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[#e85a12]" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search area or street…"
          className="h-10 w-full rounded-md border border-[#9A9EA6] bg-[#E2E3E7] py-0 pl-8 pr-3 text-[13px] font-medium text-[#0f172a] outline-none placeholder:text-[#6b7280] focus:border-[#6B7280] focus:bg-[#E8E9ED]"
          autoComplete="off"
        />
      </div>

      <div className="relative h-52 overflow-hidden rounded-md border border-[#9A9EA6] bg-[#c8c9cd] shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={15}
          onLoad={(map) => {
            mapRef.current = map;
          }}
          onClick={(e) => {
            const lat = e.latLng?.lat();
            const lng = e.latLng?.lng();
            if (lat == null || lng == null) return;
            placePin(lat, lng, true);
          }}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
          }}
        >
          <Marker
            position={pin}
            draggable
            onDragEnd={(e) => {
              const lat = e.latLng?.lat();
              const lng = e.latLng?.lng();
              if (lat == null || lng == null) return;
              placePin(lat, lng, true);
            }}
          />
        </GoogleMap>

        <button
          type="button"
          onClick={useMyLocation}
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

      {(status || value?.label) && (
        <p className="text-[11px] leading-snug text-[#475569]">
          {busy ? "Updating address…" : status || value?.label}
        </p>
      )}
    </div>
  );
}
