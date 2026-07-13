"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Circle,
  GoogleMap,
  Marker,
  OverlayView,
  OverlayViewF,
  Polyline,
  useJsApiLoader,
} from "@react-google-maps/api";
import {
  Car,
  Layers,
  LocateFixed,
  Plus,
  Wrench,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAP_ID_CONTAINER = { width: "100%", height: "100%" };

/** Dark app (black chrome): clear reddish-brown map */
const MAP_STYLES_DARK: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#5c2a1e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#3a1810" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#e0b89a" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#7a3d2c" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#7a4030" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#4a2418" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#8b4a36" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#3a1c14" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#6b3426" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#632e20" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#6e3424" }],
  },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

/** Light app: dark green map */
const MAP_STYLES_LIGHT: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a3d2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f2a1f" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a8c9b5" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2d5a42" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2a4f3c" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#163528" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#356b4e" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0d281c" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#234836" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#1e4030" }],
  },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function markerIconUrl(type: Technician["serviceType"], selected: boolean) {
  const bg =
    type === "vulcanizer"
      ? "#14b8a6"
      : type === "towing"
        ? "#0d9488"
        : type === "wash"
          ? "#0ea5e9"
          : "#ff5a00";
  const size = selected ? 40 : 36;
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 36 36">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffb06a"/>
          <stop offset="50%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="${type === "mechanic" ? "#c24100" : "#0f766e"}"/>
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="15" fill="url(#g)" stroke="white" stroke-width="3"/>
      <path d="M12 18h12M18 12v12" stroke="white" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`
  );
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

function selectedPinUrl() {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
      <path d="M20 2C12.3 2 6 8.3 6 16c0 10.5 14 28 14 28s14-17.5 14-28C34 8.3 27.7 2 20 2z" fill="#ef4444" stroke="white" stroke-width="2.5"/>
      <circle cx="20" cy="16" r="5.5" fill="white"/>
      <circle cx="20" cy="16" r="2.5" fill="#ef4444"/>
    </svg>`
  );
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

function userIconUrl() {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="18" fill="#0ea5e9" fill-opacity="0.22"/>
      <circle cx="24" cy="24" r="11" fill="#0ea5e9" stroke="white" stroke-width="3.5"/>
      <circle cx="24" cy="24" r="4.5" fill="white"/>
    </svg>`
  );
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

function kmToMeters(km: number) {
  return km * 1000;
}

function MapControls({
  onFit,
  onRecenter,
  onZoom,
}: {
  onFit: () => void;
  onRecenter: () => void;
  onZoom: () => void;
}) {
  return (
    <div className="absolute right-3 top-2 z-30 flex flex-col gap-2">
      {[
        { label: "Fit all", icon: Layers, action: onFit },
        { label: "Recenter", icon: LocateFixed, action: onRecenter },
        { label: "Services", icon: Wrench, action: onFit },
        { label: "Zoom in", icon: Plus, action: onZoom },
      ].map(({ label, icon: Icon, action }) => (
        <button
          key={label}
          type="button"
          onClick={action}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm hover:bg-slate-50 border-0"
          aria-label={label}
        >
          <Icon className={cn("h-4 w-4", label === "Services" && "text-brand")} />
        </button>
      ))}
    </div>
  );
}

/** Uber Eats–style nearby count on the map (not miles — radius is in the sheet) */
function NearbyCountBadge({ count }: { count: number }) {
  const { theme } = useApp();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "absolute bottom-3 left-1/2 z-30 -translate-x-1/2 inline-flex items-center gap-2 rounded-full px-3.5 py-2 shadow-lg",
        isLight ? "bg-white text-slate-900" : "bg-black/95 text-white"
      )}
      aria-label={`${count} nearby technicians`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[12px] font-bold tabular-nums tracking-tight">
        {count} nearby
      </span>
    </div>
  );
}

/**
 * City map preview.
 * Light chrome → dark green map · Dark chrome → reddish-brown map.
 */
function MockupMap({
  technicians,
  onSelect,
}: {
  technicians: Technician[];
  onSelect?: (id: string) => void;
}) {
  const { location, radiusKm, selectedTechId, theme } = useApp();
  const isLight = theme === "light";

  const positions = [
    { top: "22%", left: "24%" },
    { top: "18%", left: "58%" },
    { top: "34%", left: "72%" },
    { top: "58%", left: "18%" },
    { top: "50%", left: "78%" },
  ];

  // Light app: dark green · Dark app: clear reddish brown
  const baseBg = isLight ? "bg-[#1a3d2e]" : "bg-[#5c2a1e]";
  const gridColor = isLight
    ? "rgba(80,140,100,0.35)"
    : "rgba(160,90,60,0.4)";
  const landCenter = isLight ? "#234d38" : "#7a3a28";
  const landEdge = isLight ? "#143528" : "#3a1810";
  const parkBlob = isLight ? "bg-[#2d6b4a]/55" : "bg-[#8b4530]/45";
  const roadColor = isLight ? "#356b4e" : "#a05840";
  const roadSoft = isLight ? "#2a5540" : "#8b4a36";
  const radiusStroke = isLight
    ? "border-emerald-400/45 bg-emerald-400/10"
    : "border-[#e89060]/50 bg-[#e85a12]/12";
  const routeStroke = isLight ? "#34d399" : "#f0a070";
  const youRing = isLight ? "bg-emerald-400/30" : "bg-orange-400/30";
  const youDot = isLight ? "bg-emerald-600" : "bg-[#c45c2a]";

  return (
    <div className={cn("relative h-full w-full overflow-hidden", baseBg)}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(${gridColor} 1px, transparent 1px),
            linear-gradient(90deg, ${gridColor} 1px, transparent 1px),
            radial-gradient(ellipse at 45% 48%, ${landCenter} 0%, ${landEdge} 72%)
          `,
          backgroundSize: isLight
            ? "36px 36px, 36px 36px, 100% 100%"
            : "40px 40px, 40px 40px, 100% 100%",
        }}
      />

      <div
        className={cn("pointer-events-none absolute rounded-full", parkBlob)}
        style={{ width: "18%", height: "14%", top: "28%", left: "12%" }}
      />
      <div
        className={cn("pointer-events-none absolute rounded-full", parkBlob)}
        style={{ width: "14%", height: "12%", top: "55%", left: "62%" }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          backgroundImage: `
            linear-gradient(112deg, transparent 46%, ${roadColor} 46.8%, ${roadColor} 50%, transparent 50.8%),
            linear-gradient(25deg, transparent 38%, ${roadSoft} 38.6%, ${roadSoft} 41.2%, transparent 41.8%),
            linear-gradient(-30deg, transparent 52%, ${roadSoft} 52.5%, ${roadSoft} 55%, transparent 55.5%)
          `,
        }}
      />

      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-[48%] z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
          radiusStroke
        )}
        style={{
          width: `${Math.min(78, 34 + radiusKm * 0.35)}%`,
          aspectRatio: "1",
        }}
      />

      <svg
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M 50 50 C 55 42, 62 32, 58 22"
          fill="none"
          stroke={routeStroke}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>

      <div className="absolute left-1/2 top-[48%] z-20 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center">
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full",
              youRing
            )}
          />
          <span
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full shadow-xl ring-[3px] ring-white",
              youDot
            )}
          >
            <span className="h-3 w-3 rounded-full bg-white" />
          </span>
        </div>
        <span
          className={cn(
            "mt-0.5 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold shadow-sm",
            isLight
              ? "bg-[#0f2a1f]/90 text-[#d4efe0]"
              : "bg-[#2a1c16]/90 text-[#f0d4c4]"
          )}
        >
          You
        </span>
      </div>

      {/* Technician pins */}
      {technicians.slice(0, 5).map((t, i) => {
        const pos = positions[i % positions.length];
        const isSel = t.id === selectedTechId || (!selectedTechId && i === 1);
        const isTow = t.serviceType === "towing";
        const isVulc = t.serviceType === "vulcanizer";

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect?.(t.id)}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ top: pos.top, left: pos.left }}
            aria-label={`${t.name}, ${t.etaMinutes} min`}
          >
            {isLight ? (
              /* Light mode: blue teardrop pins like Mechanic City */
              <>
                <span className="relative mx-auto block h-9 w-7">
                  <span
                    className={cn(
                      "absolute left-1/2 top-0 h-7 w-7 -translate-x-1/2 rounded-full shadow-md ring-2 ring-white",
                      isSel ? "bg-blue-700" : "bg-blue-600"
                    )}
                  />
                  <span
                    className={cn(
                      "absolute left-1/2 top-[18px] h-3 w-3 -translate-x-1/2 rotate-45",
                      isSel ? "bg-blue-700" : "bg-blue-600"
                    )}
                  />
                </span>
                <span className="mt-0.5 inline-block rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-800 shadow ring-1 ring-slate-100">
                  {t.etaMinutes} min
                </span>
              </>
            ) : isSel ? (
              <>
                <span className="mx-auto flex h-10 w-9 items-end justify-center">
                  <span className="relative flex h-9 w-9 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-red-500 shadow-lg ring-[3px] ring-white" />
                    <span className="relative h-3 w-3 rounded-full bg-white ring-2 ring-red-600" />
                  </span>
                </span>
                <span className="mt-0.5 inline-block rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-900 shadow">
                  {t.etaMinutes} min
                </span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg ring-[2.5px] ring-white",
                    isVulc || isTow ? "bg-teal-500" : "bg-[#ff5a00]"
                  )}
                >
                  {isTow ? (
                    <Car className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <Wrench className="h-4 w-4" strokeWidth={2.5} />
                  )}
                </span>
                {t.markerLabel && (
                  <span className="mt-0.5 block text-[9px] font-bold text-white drop-shadow-md">
                    {t.markerLabel}
                  </span>
                )}
                <span className="mt-0.5 inline-block rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {t.etaMinutes} min
                </span>
              </>
            )}
          </button>
        );
      })}

      <MapControls
        onFit={() => undefined}
        onRecenter={() => undefined}
        onZoom={() => undefined}
      />
      <NearbyCountBadge count={technicians.length} />

      <p className="sr-only">
        Map near {location.label}. {technicians.length} technicians visible.
      </p>
    </div>
  );
}

function GoogleServiceMap({
  technicians,
  onSelect,
  onFatalError,
}: {
  technicians: Technician[];
  onSelect?: (id: string) => void;
  onFatalError?: () => void;
}) {
  const { location, radiusKm, selectedTechId, theme } = useApp();
  const isLight = theme === "light";
  const mapStyles = isLight ? MAP_STYLES_LIGHT : MAP_STYLES_DARK;
  const mapBg = isLight ? "#1a3d2e" : "#5c2a1e";
  const radiusColor = isLight ? "#34d399" : "#e8a070";
  const routeColor = isLight ? "#10b981" : "#e85a12";
  const [map, setMap] = useState<google.maps.Map | null>(null);

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
    if (!routeTarget) return [];
    return [
      center,
      { lat: routeTarget.location.lat, lng: routeTarget.location.lng },
    ];
  }, [center, routeTarget]);

  const onLoad = useCallback(
    (m: google.maps.Map) => {
      setMap(m);
      let checks = 0;
      const id = window.setInterval(() => {
        checks += 1;
        if (
          document.querySelector(".gm-err-container") ||
          document.querySelector(".gm-err-message")
        ) {
          window.clearInterval(id);
          onFatalError?.();
        } else if (checks >= 10) {
          window.clearInterval(id);
        }
      }, 200);
      (m as google.maps.Map & { __omTimer?: number }).__omTimer = id;
    },
    [onFatalError]
  );

  const onUnmount = useCallback(() => {
    if (map) {
      const t = (map as google.maps.Map & { __omTimer?: number }).__omTimer;
      if (t) window.clearInterval(t);
    }
    setMap(null);
  }, [map]);

  // Re-tint map when light/dark toggles
  useEffect(() => {
    if (!map) return;
    map.setOptions({
      styles: mapStyles,
      backgroundColor: mapBg,
    });
  }, [map, mapStyles, mapBg]);

  const zoomToFit = useCallback(() => {
    if (!map || typeof google === "undefined") return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(center);
    technicians.forEach((t) =>
      bounds.extend({ lat: t.location.lat, lng: t.location.lng })
    );
    map.fitBounds(bounds, 48);
  }, [map, center, technicians]);

  const recenter = useCallback(() => {
    map?.panTo(center);
    map?.setZoom(13);
  }, [map, center]);

  return (
    <div className="relative h-full w-full">
      <GoogleMap
        mapContainerStyle={MAP_ID_CONTAINER}
        center={center}
        zoom={13}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={{
          styles: mapStyles,
          disableDefaultUI: true,
          zoomControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: mapBg,
        }}
      >
        <Circle
          center={center}
          radius={kmToMeters(Math.max(radiusKm, 0.5))}
          options={{
            fillColor: radiusColor,
            fillOpacity: 0.12,
            strokeColor: radiusColor,
            strokeOpacity: 0.55,
            strokeWeight: 2,
            clickable: false,
          }}
        />
        {path.length === 2 && (
          <Polyline
            path={path}
            options={{
              strokeColor: routeColor,
              strokeOpacity: 0.95,
              strokeWeight: 4,
              geodesic: true,
            }}
          />
        )}
        <Marker
          position={center}
          icon={{
            url: userIconUrl(),
            scaledSize:
              typeof google !== "undefined"
                ? new google.maps.Size(48, 48)
                : undefined,
            anchor:
              typeof google !== "undefined"
                ? new google.maps.Point(24, 24)
                : undefined,
          }}
          title={`You — ${location.label}`}
          zIndex={1000}
        />
        <OverlayViewF
          position={center}
          mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        >
          <div className="pointer-events-none -translate-x-1/2 translate-y-5 whitespace-nowrap rounded-full bg-black/85 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
            You
          </div>
        </OverlayViewF>
        {technicians.map((t) => {
          const selected = t.id === selectedTechId;
          return (
            <Marker
              key={t.id}
              position={{ lat: t.location.lat, lng: t.location.lng }}
              onClick={() => onSelect?.(t.id)}
              title={`${t.name} · ${t.etaMinutes} min`}
              icon={{
                url: selected
                  ? selectedPinUrl()
                  : markerIconUrl(t.serviceType, false),
                scaledSize:
                  typeof google !== "undefined"
                    ? new google.maps.Size(selected ? 40 : 36, selected ? 48 : 36)
                    : undefined,
                anchor:
                  typeof google !== "undefined"
                    ? new google.maps.Point(selected ? 20 : 18, selected ? 46 : 18)
                    : undefined,
              }}
              zIndex={selected ? 900 : 100}
            />
          );
        })}
        {routeTarget && (
          <OverlayViewF
            position={{
              lat: routeTarget.location.lat,
              lng: routeTarget.location.lng,
            }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <button
              type="button"
              onClick={() => onSelect?.(routeTarget.id)}
              className="-translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-slate-900 shadow-md"
            >
              {routeTarget.etaMinutes} min
            </button>
          </OverlayViewF>
        )}
      </GoogleMap>
      <MapControls
        onFit={zoomToFit}
        onRecenter={recenter}
        onZoom={() => map?.setZoom((map.getZoom() ?? 13) + 1)}
      />
      <NearbyCountBadge count={technicians.length} />
    </div>
  );
}

/**
 * Uses Google Maps when key is present.
 * On billing/auth failure, switches to mock map (no Google error popup).
 * Set NEXT_PUBLIC_USE_LIVE_MAPS=false to force mock only.
 */
export function ServiceMap({
  technicians,
  onSelect,
}: {
  technicians: Technician[];
  onSelect?: (id: string) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  // Live Google only when explicitly enabled (billing must be on).
  // Otherwise use polished mock map — avoids "can't load Google Maps" dialog.
  const wantLive = process.env.NEXT_PUBLIC_USE_LIVE_MAPS === "true";
  const hasKey = Boolean(
    wantLive && apiKey && !apiKey.includes("your_google") && apiKey.length > 10
  );
  const [mapFailed, setMapFailed] = useState(false);

  // Catch Google billing / auth errors immediately
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & { gm_authFailure?: () => void };
    const prev = w.gm_authFailure;
    w.gm_authFailure = () => {
      setMapFailed(true);
      prev?.();
    };
    // Hide Google error dialog if it flashes before fallback
    const style = document.createElement("style");
    style.setAttribute("data-oga-map", "1");
    style.textContent = `
      .gm-err-container, .gm-err-message, .dismissButton { display: none !important; }
    `;
    document.head.appendChild(style);
    return () => {
      w.gm_authFailure = prev;
      style.remove();
    };
  }, []);

  if (!hasKey || mapFailed) {
    return <MockupMap technicians={technicians} onSelect={onSelect} />;
  }

  return (
    <LiveGoogleMap
      technicians={technicians}
      onSelect={onSelect}
      apiKey={apiKey}
      onFatalError={() => setMapFailed(true)}
    />
  );
}

function LiveGoogleMap({
  technicians,
  onSelect,
  apiKey,
  onFatalError,
}: {
  technicians: Technician[];
  onSelect?: (id: string) => void;
  apiKey: string;
  onFatalError: () => void;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "oga-mecho-google-maps",
    googleMapsApiKey: apiKey,
  });

  if (loadError) {
    return <MockupMap technicians={technicians} onSelect={onSelect} />;
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1a3d2e] text-sm text-[#a8c9b5]">
        <div className="flex flex-col items-center gap-2">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          Loading map…
        </div>
      </div>
    );
  }

  return (
    <GoogleServiceMap
      technicians={technicians}
      onSelect={onSelect}
      onFatalError={onFatalError}
    />
  );
}
