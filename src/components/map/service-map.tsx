"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Car, Wrench } from "lucide-react";
import {
  getGoogleMapsApiKey,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  shouldUseLiveMaps,
} from "@/lib/google-maps";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

const OsmServiceMap = dynamic(
  () => import("./osm-service-map").then((m) => m.OsmServiceMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#0a1610] text-sm text-[#a8c9b5]">
        Loading live map…
      </div>
    ),
  }
);

const MAP_ID_CONTAINER = { width: "100%", height: "100%" };

/** Light toggle map: dark green mixed with black */
const MAP_STYLES_LIGHT: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f1f16" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#060d0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a8c9b5" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a3d2e" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#14281c" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0a1610" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#1e4030" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#060d0a" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#0f1f16" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#0a1610" }],
  },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

/** Dark toggle map only: deep red mixed with black */
const MAP_STYLES_DARK: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a0808" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0000" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#e8b4b0" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#3d1515" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2a1010" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#120606" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#4a1414" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#050000" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#1f0a0a" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#140606" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#1a0808" }],
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

/**
 * inDrive-style “thought” bar: top-center, no pill background.
 */
function NearbyCountBadge({ count }: { count: number }) {
  const { theme } = useApp();
  const isLight = theme === "light";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-2.5 z-40 flex justify-center px-10"
      aria-label={`${count} nearby technicians`}
    >
      <p
        className={cn(
          "text-[13px] font-semibold tabular-nums tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]",
          isLight ? "text-white" : "text-white"
        )}
      >
        <span className="font-bold">{count}</span> nearby
      </p>
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
  const { location, selectedTechId, theme } = useApp();
  const isLight = theme === "light";

  const positions = [
    { top: "22%", left: "24%" },
    { top: "18%", left: "58%" },
    { top: "34%", left: "72%" },
    { top: "58%", left: "18%" },
    { top: "50%", left: "78%" },
  ];

  // Light map = green/black · Dark map = deep red/black
  const baseBg = isLight ? "bg-[#0a1610]" : "bg-[#0a0000]";
  const gridColor = isLight
    ? "rgba(80,140,100,0.28)"
    : "rgba(140,40,40,0.35)";
  const landCenter = isLight ? "#0f1f16" : "#1a0808";
  const landEdge = isLight ? "#060d0a" : "#050000";
  const parkBlob = isLight ? "bg-[#14281c]/70" : "bg-[#2a1010]/55";
  const roadColor = isLight ? "#1e4030" : "#4a1414";
  const roadSoft = isLight ? "#14281c" : "#2a1010";
  const routeStroke = isLight ? "#34d399" : "#e07070";
  const youRing = isLight ? "bg-emerald-400/30" : "bg-red-400/30";
  const youDot = isLight ? "bg-emerald-600" : "bg-[#a82020]";

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
  const { location, selectedTechId, theme } = useApp();
  const isLight = theme === "light";
  const mapStyles = isLight ? MAP_STYLES_LIGHT : MAP_STYLES_DARK;
  const mapBg = isLight ? "#0a1610" : "#0a0000";
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const center = useMemo(
    () => ({
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
    }),
    [location.coordinates.lat, location.coordinates.lng]
  );

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

  // Follow live GPS center in realtime
  useEffect(() => {
    if (!map) return;
    map.panTo(center);
  }, [map, center.lat, center.lng, center]);

  // Keep map centered on live GPS (1 km nearby view)
  useEffect(() => {
    if (!map) return;
    map.setZoom(15);
  }, [map]);

  return (
    <div className="relative h-full w-full">
      <NearbyCountBadge count={technicians.length} />
      <GoogleMap
        mapContainerStyle={MAP_ID_CONTAINER}
        center={center}
        zoom={15}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={{
          styles: mapStyles,
          disableDefaultUI: true,
          zoomControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          backgroundColor: mapBg,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          // Lighter map load
          maxZoom: 17,
          minZoom: 13,
        }}
      >
        <Marker
          position={center}
          icon={{
            url: userIconUrl(),
            scaledSize:
              typeof google !== "undefined"
                ? new google.maps.Size(40, 40)
                : undefined,
            anchor:
              typeof google !== "undefined"
                ? new google.maps.Point(20, 20)
                : undefined,
          }}
          title={`You: ${location.label}`}
          zIndex={1000}
        />
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
                    ? new google.maps.Size(selected ? 36 : 32, selected ? 42 : 32)
                    : undefined,
                anchor:
                  typeof google !== "undefined"
                    ? new google.maps.Point(selected ? 18 : 16, selected ? 40 : 16)
                    : undefined,
              }}
              zIndex={selected ? 900 : 100}
            />
          );
        })}
      </GoogleMap>
    </div>
  );
}

/**
 * Homepage map: force Google Maps when a live key is present.
 * OpenStreetMap only if the key is missing or Google hard-fails this session.
 */
export function ServiceMap({
  technicians,
  onSelect,
}: {
  technicians: Technician[];
  onSelect?: (id: string) => void;
}) {
  const apiKey = getGoogleMapsApiKey();
  const hasKey = shouldUseLiveMaps();
  const [mapFailed, setMapFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Always clear legacy fail flags when the live key is installed
  useEffect(() => {
    try {
      sessionStorage.removeItem("om_google_maps_failed");
    } catch {
      /* ignore */
    }
    setMapFailed(false);
  }, [apiKey]);

  // Catch Google billing / auth errors → OSM for this session only
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & { gm_authFailure?: () => void };
    const prev = w.gm_authFailure;
    w.gm_authFailure = () => {
      setMapFailed(true);
      prev?.();
    };
    return () => {
      w.gm_authFailure = prev;
    };
  }, []);

  if (!hasKey) {
    return <OsmServiceMap technicians={technicians} onSelect={onSelect} />;
  }

  if (mapFailed) {
    return (
      <div className="relative h-full w-full">
        <OsmServiceMap technicians={technicians} onSelect={onSelect} />
        <button
          type="button"
          onClick={() => {
            setMapFailed(false);
            setRetryTick((n) => n + 1);
          }}
          className="absolute bottom-14 right-2 z-40 rounded-md border-0 bg-black/70 px-2 py-1 text-[9px] font-semibold text-white/90"
        >
          Retry Google
        </button>
      </div>
    );
  }

  return (
    <LiveGoogleMap
      key={`${apiKey.slice(-6)}-${retryTick}`}
      technicians={technicians}
      onSelect={onSelect}
      apiKey={apiKey}
      onFatalError={() => {
        setMapFailed(true);
      }}
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
  onFatalError: (reason?: string) => void;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: apiKey,
    // Empty libraries: only Maps JavaScript API needed for homepage
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  useEffect(() => {
    if (loadError) {
      onFatalError(
        loadError.message ||
          "Could not load Google Maps. Check the API key and that Maps JavaScript API is ON."
      );
    }
  }, [loadError, onFatalError]);

  if (loadError) {
    return (
      <div className="relative h-full w-full">
        <MockupMap technicians={technicians} onSelect={onSelect} />
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a1610] text-sm text-[#a8c9b5]">
        <div className="flex flex-col items-center gap-2">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          Loading live Google Maps…
        </div>
      </div>
    );
  }

  return (
    <GoogleServiceMap
      technicians={technicians}
      onSelect={onSelect}
      onFatalError={() =>
        onFatalError(
          "Map tiles blocked. Enable Maps JavaScript API + billing for this key."
        )
      }
    />
  );
}
