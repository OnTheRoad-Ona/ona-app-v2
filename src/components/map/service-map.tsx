"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { LiveProPin } from "@/components/map/live-pro-pin";
import {
  getGoogleMapsApiKey,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  shouldUseLiveMaps,
} from "@/lib/google-maps";
import { MAP_NEAR_ZOOM } from "@/lib/matching";
import {
  USER_MAP_PIN_ANCHOR,
  USER_MAP_PIN_SIZE,
  userMapPinUrl,
} from "@/lib/map-user-pin";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
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

/** Filled metallic-orange trade pin (visible on green/red map stages) */
function proMarkerIconUrl(t: Technician, selected: boolean): string {
  return tradeIconDataUrl(t.serviceType, {
    size: selected ? 28 : 24,
    selected,
  });
}

/**
 * Google Maps can’t animate SVG data-URLs easily — use a slightly larger
 * soft glow via canvas-free double marker approach in LiveGoogleMap.
 */

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
    <div
      data-map-surface
      className={cn("relative h-full w-full overflow-hidden", baseBg)}
    >
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

      {/* Technician pins — filled metallic orange trade icons */}
      {technicians.slice(0, 5).map((t, i) => {
        const pos = positions[i % positions.length];
        const isSel = t.id === selectedTechId || (!selectedTechId && i === 1);
        const pinUrl = proMarkerIconUrl(t, isSel);

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect?.(t.id)}
            className="om-live-pin absolute z-20 -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ top: pos.top, left: pos.left }}
            aria-label={`${t.name}, ${t.etaMinutes} min`}
          >
            <span className="relative mx-auto flex h-9 w-9 items-center justify-center">
              <span className="om-live-beam absolute inset-0" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pinUrl}
                alt=""
                width={isSel ? 28 : 24}
                height={isSel ? 28 : 24}
                className="om-live-glyph relative z-[1] block"
                draggable={false}
              />
            </span>
            <span
              className={cn(
                "mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold shadow",
                isLight
                  ? "bg-white text-slate-800 ring-1 ring-slate-100"
                  : "bg-black/80 text-white"
              )}
            >
              {t.etaMinutes} min
            </span>
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

  // Only pros with a real live GPS pin on the map
  const livePros = technicians.filter(
    (t) =>
      t.hasLiveLocation !== false &&
      Number.isFinite(t.location.lat) &&
      Number.isFinite(t.location.lng) &&
      !(t.location.lat === 0 && t.location.lng === 0)
  );

  // Deep view: fit you + each pro’s live coordinates
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    if (livePros.length === 0) {
      map.panTo(center);
      map.setZoom(MAP_NEAR_ZOOM + 1);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(center);
    livePros.forEach((t) =>
      bounds.extend({ lat: t.location.lat, lng: t.location.lng })
    );
    map.fitBounds(bounds, { top: 56, right: 40, bottom: 40, left: 40 });
    // Allow deeper zoom for close pros (street-level)
    const z = map.getZoom();
    if (z != null && z > 18) map.setZoom(18);
    if (z != null && z < 13 && livePros.length === 1) map.setZoom(15);
  }, [map, center.lat, center.lng, livePros]);

  return (
    <div data-map-surface className="relative h-full w-full">
      <NearbyCountBadge count={livePros.length} />
      <GoogleMap
        mapContainerStyle={MAP_ID_CONTAINER}
        center={center}
        zoom={MAP_NEAR_ZOOM + 1}
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
          maxZoom: 19,
          minZoom: 11,
        }}
      >
        <Marker
          position={center}
          icon={{
            url: userMapPinUrl(USER_MAP_PIN_SIZE),
            scaledSize:
              typeof google !== "undefined"
                ? new google.maps.Size(USER_MAP_PIN_SIZE, USER_MAP_PIN_SIZE)
                : undefined,
            anchor:
              typeof google !== "undefined"
                ? new google.maps.Point(USER_MAP_PIN_ANCHOR, USER_MAP_PIN_ANCHOR)
                : undefined,
          }}
          title={`You: ${location.label}`}
          zIndex={500}
        />
        {livePros.map((t) => {
          const selected = t.id === selectedTechId;
          return (
            <LiveProPin
              key={`${t.id}-${t.location.lat.toFixed(5)}-${t.location.lng.toFixed(5)}`}
              tech={t}
              selected={selected}
              onSelect={onSelect}
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
