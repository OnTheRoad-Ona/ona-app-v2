"use client";

import { useEffect, useMemo } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

function kmToMeters(km: number) {
  return km * 1000;
}

function userIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:48px;height:48px;margin-left:-24px;margin-top:-24px;position:relative">
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(14,165,233,0.22)"></div>
      <div style="position:absolute;left:13px;top:13px;width:22px;height:22px;border-radius:9999px;background:#0ea5e9;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
      <div style="position:absolute;left:20px;top:20px;width:8px;height:8px;border-radius:9999px;background:white"></div>
    </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

function techIcon(selected: boolean, serviceType: Technician["serviceType"]) {
  const bg =
    selected
      ? "#ef4444"
      : serviceType === "vulcanizer" || serviceType === "towing"
        ? "#14b8a6"
        : "#ff5a00";
  const size = selected ? 40 : 34;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;margin-left:-${size / 2}px;margin-top:-${size / 2}px;border-radius:9999px;background:${bg};border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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

  useEffect(() => {
    map.panTo([center.lat, center.lng], { animate: true });
  }, [map, center.lat, center.lng]);

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

/** Small live status: pulsing green dot only (no text chip). */
function LiveSign() {
  return (
    <div
      className="pointer-events-none absolute left-2.5 top-2.5 z-[500]"
      aria-label="Live map"
      title="Live"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white/90 shadow" />
      </span>
    </div>
  );
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

  const routeTarget =
    technicians.find((t) => t.id === selectedTechId) ?? technicians[0];

  const path = useMemo(() => {
    if (!routeTarget) return [] as [number, number][];
    return [
      [center.lat, center.lng] as [number, number],
      [routeTarget.location.lat, routeTarget.location.lng] as [number, number],
    ];
  }, [center, routeTarget]);

  const radiusColor = isLight ? "#34d399" : "#e8a070";
  const routeColor = isLight ? "#10b981" : "#e85a12";
  // Dark tiles for both; CSS tint differs by theme on chrome chrome
  const tileUrl =
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  const fire = (name: string) => {
    const mapEl = document.querySelector(".leaflet-container");
    mapEl?.dispatchEvent(new Event(name));
  };

  return (
    <div className="relative h-full w-full">
      <LiveSign />

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
        style={{
          height: "100%",
          width: "100%",
          background: isLight ? "#0a1610" : "#120a08",
          filter: isLight
            ? "none"
            : "sepia(0.45) hue-rotate(-18deg) saturate(1.15) brightness(0.92)",
        }}
      >
        <TileLayer url={tileUrl} />
        <MapSync center={center} technicians={technicians} radiusKm={radiusKm} />
        <Circle
          center={[center.lat, center.lng]}
          radius={kmToMeters(Math.max(radiusKm, 0.5))}
          pathOptions={{
            color: radiusColor,
            fillColor: radiusColor,
            fillOpacity: 0.12,
            weight: 2,
            opacity: 0.55,
          }}
        />
        {path.length === 2 && (
          <Polyline
            positions={path}
            pathOptions={{ color: routeColor, weight: 4, opacity: 0.95 }}
          />
        )}
        <Marker
          position={[center.lat, center.lng]}
          icon={userIcon()}
          title={`You: ${location.label}`}
          zIndexOffset={1000}
        >
          <Tooltip permanent direction="bottom" offset={[0, 12]} className="om-you-tip">
            You · {location.label}
          </Tooltip>
        </Marker>
        {technicians.map((t) => {
          const selected = t.id === selectedTechId;
          return (
            <Marker
              key={t.id}
              position={[t.location.lat, t.location.lng]}
              icon={techIcon(selected, t.serviceType)}
              title={`${t.name} · ${t.etaMinutes} min`}
              eventHandlers={{
                click: () => onSelect?.(t.id),
              }}
              zIndexOffset={selected ? 900 : 100}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {t.name} · {t.etaMinutes} min
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="absolute right-3 top-2 z-[500] flex flex-col gap-2">
        {[
          { label: "Fit all", action: () => fire("om-fit") },
          { label: "Recenter", action: () => fire("om-recenter") },
          { label: "Zoom in", action: () => fire("om-zoom") },
        ].map(({ label, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className="flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-white text-[10px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            aria-label={label}
            title={label}
          >
            {label === "Zoom in" ? "+" : label === "Fit all" ? "◎" : "⌖"}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 inline-flex items-center gap-2 rounded-full px-3.5 py-2 shadow-lg",
          isLight ? "bg-white text-slate-900" : "bg-black/95 text-white"
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[12px] font-bold tabular-nums tracking-tight">
          {technicians.length} nearby
        </span>
      </div>
    </div>
  );
}
