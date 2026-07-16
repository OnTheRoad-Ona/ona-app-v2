"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { tradeIconHtml } from "@/lib/map-trade-icons";
import {
  USER_MAP_PIN_ANCHOR,
  USER_MAP_PIN_SIZE,
  userMapPinLeafletHtml,
} from "@/lib/map-user-pin";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

function userIcon() {
  return L.divIcon({
    className: "",
    html: userMapPinLeafletHtml(),
    iconSize: [USER_MAP_PIN_SIZE, USER_MAP_PIN_SIZE],
    iconAnchor: [USER_MAP_PIN_ANCHOR, USER_MAP_PIN_ANCHOR],
  });
}

/** Orange trade glyph only (no circle) + live beam — same size, shade on select */
function techIcon(t: Technician, selected: boolean) {
  const size = 24;
  const box = 32;
  return L.divIcon({
    className: "om-trade-marker",
    html: tradeIconHtml(t.serviceType, { size, selected }),
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
}

function MapSync({
  center,
  technicians,
  radiusKm,
}: {
  center: { lat: number; lng: number };
  technicians: Technician[];
  radiusKm: number;
}) {
  const map = useMap();

  // Deep view: you + each pro’s live GPS pin
  useEffect(() => {
    const live = technicians.filter(
      (t) =>
        t.hasLiveLocation !== false &&
        Number.isFinite(t.location.lat) &&
        Number.isFinite(t.location.lng)
    );
    const bounds = L.latLngBounds([[center.lat, center.lng]]);
    live.forEach((t) => bounds.extend([t.location.lat, t.location.lng]));
    if (live.length > 0) {
      map.fitBounds(bounds.pad(0.22), { animate: true, maxZoom: 17 });
    } else {
      map.setView([center.lat, center.lng], 15, { animate: true });
    }
  }, [map, center.lat, center.lng, technicians]);

  useEffect(() => {
    const onFit = () => {
      const bounds = L.latLngBounds([[center.lat, center.lng]]);
      technicians.forEach((t) =>
        bounds.extend([t.location.lat, t.location.lng])
      );
      map.fitBounds(bounds.pad(0.2));
    };
    const onRecenter = () => {
      map.setView([center.lat, center.lng], 14, { animate: true });
    };
    const onZoom = () => map.setZoom(map.getZoom() + 1);

    // Expose via custom events from parent controls
    const el = map.getContainer();
    el.addEventListener("om-fit", onFit);
    el.addEventListener("om-recenter", onRecenter);
    el.addEventListener("om-zoom", onZoom);
    return () => {
      el.removeEventListener("om-fit", onFit);
      el.removeEventListener("om-recenter", onRecenter);
      el.removeEventListener("om-zoom", onZoom);
    };
  }, [map, center.lat, center.lng, technicians, radiusKm]);

  return null;
}

/**
 * Real street map via OpenStreetMap tiles (no Google key / billing).
 */
export function OsmServiceMap({
  technicians,
  onSelect,
}: {
  technicians: Technician[];
  onSelect?: (id: string) => void;
}) {
  const { location, radiusKm, selectedTechId, theme } = useApp();
  const isLight = theme === "light";

  const center = useMemo(
    () => ({
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
    }),
    [location.coordinates.lat, location.coordinates.lng]
  );

  const tileUrl =
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  return (
    <div data-map-surface className="relative h-full w-full">
      {/* Thought-style nearby label — no pill background */}
      <div
        className="pointer-events-none absolute inset-x-0 top-2.5 z-[500] flex justify-center px-10"
        aria-label={`${technicians.length} nearby technicians`}
      >
        <p className="text-[13px] font-semibold tabular-nums tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
          <span className="font-bold">{technicians.length}</span> nearby
        </p>
      </div>

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={15}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
        style={{
          height: "100%",
          width: "100%",
          background: isLight ? "#0a1610" : "#0a0000",
          filter: isLight
            ? "none"
            : "sepia(0.55) hue-rotate(-25deg) saturate(1.35) brightness(0.88)",
        }}
      >
        <TileLayer url={tileUrl} />
        <MapSync center={center} technicians={technicians} radiusKm={radiusKm} />
        <Marker
          position={[center.lat, center.lng]}
          icon={userIcon()}
          title={`You: ${location.label}`}
          zIndexOffset={1000}
        />
        {technicians
          .filter(
            (t) =>
              t.hasLiveLocation !== false &&
              Number.isFinite(t.location.lat) &&
              Number.isFinite(t.location.lng)
          )
          .map((t) => {
            const selected = t.id === selectedTechId;
            return (
              <Marker
                key={`${t.id}-${t.location.lat}-${t.location.lng}`}
                position={[t.location.lat, t.location.lng]}
                icon={techIcon(t, selected)}
                title={`${t.name} · ${t.roleLabel} · live`}
                eventHandlers={{
                  click: () => onSelect?.(t.id),
                }}
                zIndexOffset={selected ? 900 : 100}
              />
            );
          })}
      </MapContainer>
    </div>
  );
}
