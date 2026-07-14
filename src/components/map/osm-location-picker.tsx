"use client";

import { useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPin, Navigation } from "lucide-react";
import { reverseGeocodeLatLng } from "@/lib/google-maps";
import { DEFAULT_USER_LOCATION } from "@/lib/data/technicians";
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
 */
export function OsmLocationPicker({
  value,
  onChange,
  className,
}: {
  value?: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
  className?: string;
}) {
  const [center, setCenter] = useState({
    lat: value?.lat ?? DEFAULT_USER_LOCATION.coordinates.lat,
    lng: value?.lng ?? DEFAULT_USER_LOCATION.coordinates.lng,
  });
  const [pin, setPin] = useState(center);
  const [query, setQuery] = useState(value?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setBusy(true);
      try {
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

  return (
    <div className={cn("flex h-full min-h-[240px] flex-col gap-2", className)}>
      <div className="relative flex items-center gap-2">
        <MapPin className="absolute left-2.5 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Street name appears after you drop a pin"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-500"
          readOnly
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          className="h-full w-full"
          style={{ height: "100%", minHeight: 220 }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          <ClickHandler onPick={(lat, lng) => placePin(lat, lng)} />
          <Marker position={[pin.lat, pin.lng]} icon={pinIcon()} />
        </MapContainer>

        <div className="absolute bottom-2 left-2 right-2 z-[500] flex gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border-0 bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow disabled:opacity-60"
          >
            <Navigation className="h-3.5 w-3.5" />
            Use my location
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
        <p className="text-[11px] font-medium text-amber-700">{status}</p>
      )}
      {busy && (
        <p className="text-[11px] font-medium text-slate-500">
          Getting street name…
        </p>
      )}
    </div>
  );
}
