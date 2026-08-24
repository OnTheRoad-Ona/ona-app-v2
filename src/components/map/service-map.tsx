"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { LiveProPin } from "@/components/map/live-pro-pin";
import { getGoogleMapsApiKey, shouldUseLiveMaps } from "@/lib/google-maps";
import { useOnaGoogleMaps } from "@/lib/google-maps-loader";
import { MAP_NEAR_ZOOM } from "@/lib/matching";
import {
  USER_MAP_PIN_ANCHOR,
  USER_MAP_PIN_SIZE,
  userMapPinUrl,
} from "@/lib/map-user-pin";
import * as mapTheme from "@/lib/map-theme";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Namespace import avoids Turbopack named-export partial-init glitches */
const {
  MAP_STYLE_REVISION,
  applyOnaMapTheme,
  mapContainerStyle,
  mapRenderOptions,
  mapSurfaceStyle,
  mapThemeForApp,
} = mapTheme;

function safeMapContainerStyle(
  isLight: boolean,
): Record<string, string | number> {
  if (typeof mapContainerStyle === "function") {
    return mapContainerStyle(isLight);
  }
  // Hard fallback if module init was partial (must never crash the app shell)
  return {
    width: "100%",
    height: "100%",
    backgroundColor: isLight ? "#0a1610" : "#0a0000",
  };
}

const OsmServiceMap = dynamic(
  () => import("./osm-service-map").then((m) => m.OsmServiceMap),
  {
    ssr: false,
    loading: () => <MapLoading />,
  },
);

/** Themed map loading placeholder matches dashboard light/dark map colors */
function MapLoading() {
  const { theme } = useApp();
  const { backgroundColor } = mapThemeForApp(theme === "light");
  return (
    <div
      className="flex h-full w-full items-center justify-center text-sm text-[#a8c9b5]"
      style={{ backgroundColor }}
    >
      Loading live map…
    </div>
  );
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
          isLight ? "text-white" : "text-white",
        )}
      >
        <span className="font-bold">{count}</span> nearby
      </p>
    </div>
  );
}

/**
 * Homepage map: force Google Maps when a live key is present.
 * OpenStreetMap only if the key is missing or Google hard-fails this session.
 */
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
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const center = useMemo(
    () => ({
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
    }),
    [location.coordinates.lat, location.coordinates.lng],
  );

  const onLoad = useCallback(
    (m: google.maps.Map) => {
      // Deep force: styles + grayscale chroma-kill (no sepia/orange)
      applyOnaMapTheme(m, isLight);
      window.requestAnimationFrame(() => applyOnaMapTheme(m, isLight));
      // Re-paint after Google finishes first tile pass (kills late orange roads)
      const t1 = window.setTimeout(() => applyOnaMapTheme(m, isLight), 400);
      const t2 = window.setTimeout(() => applyOnaMapTheme(m, isLight), 1200);
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
      const bag = m as google.maps.Map & {
        __omTimer?: number;
        __omPaint?: number[];
      };
      bag.__omTimer = id;
      bag.__omPaint = [t1, t2];
    },
    [onFatalError, isLight],
  );

  const onUnmount = useCallback(() => {
    if (map) {
      const bag = map as google.maps.Map & {
        __omTimer?: number;
        __omPaint?: number[];
      };
      if (bag.__omTimer) window.clearInterval(bag.__omTimer);
      bag.__omPaint?.forEach((t) => window.clearTimeout(t));
    }
    setMap(null);
  }, [map]);

  // Re-apply green/red (CSS filter + styles) when theme flips
  useEffect(() => {
    if (!map) return;
    applyOnaMapTheme(map, isLight);
  }, [map, isLight]);

  // Only pros with a real live GPS pin on the map
  const livePros = technicians.filter(
    (t) =>
      t.hasLiveLocation !== false &&
      Number.isFinite(t.location.lat) &&
      Number.isFinite(t.location.lng) &&
      !(t.location.lat === 0 && t.location.lng === 0),
  );

  // Deep view: fit you + each pro’s live coordinates
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    if (livePros.length === 0) {
      map.panTo(center);
      // Street names need ~16+ zoom (Uber/inDrive density)
      map.setZoom(Math.max(MAP_NEAR_ZOOM + 1, 16));
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(center);
    livePros.forEach((t) =>
      bounds.extend({ lat: t.location.lat, lng: t.location.lng }),
    );
    map.fitBounds(bounds, { top: 56, right: 40, bottom: 40, left: 40 });
    // Street-level: don't zoom out so far that names disappear
    const z = map.getZoom();
    if (z != null && z > 18) map.setZoom(18);
    if (z != null && z < 15) map.setZoom(15);
  }, [map, center.lat, center.lng, livePros]);

  const mapOptions = useMemo(
    () => ({
      ...mapRenderOptions(isLight),
      disableDefaultUI: true,
      zoomControl: false,
      gestureHandling: "greedy" as const,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      maxZoom: 19,
      minZoom: 12,
    }),
    [isLight],
  );

  return (
    <div
      data-map-surface
      data-map-engine="google"
      data-map-theme={isLight ? "light" : "dark"}
      data-map-rev={MAP_STYLE_REVISION}
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: mapSurfaceStyle(isLight).backgroundColor,
        // Never dim the home map shell
        opacity: 1,
        filter: "none",
      }}
    >
      <NearbyCountBadge count={livePros.length} />
      <GoogleMap
        key={`gm-${MAP_STYLE_REVISION}-${isLight ? "light" : "dark"}`}
        mapContainerStyle={safeMapContainerStyle(isLight)}
        mapContainerClassName="ona-home-map-visible"
        center={center}
        zoom={16}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
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
                ? new google.maps.Point(
                    USER_MAP_PIN_ANCHOR,
                    USER_MAP_PIN_ANCHOR,
                  )
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
      {/* No tint overlay real styled tiles only (full visibility + gestures) */}
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
      onFatalError={() => {
        setMapFailed(true);
      }}
    />
  );
}

function LiveGoogleMap({
  technicians,
  onSelect,
  onFatalError,
}: {
  technicians: Technician[];
  onSelect?: (id: string) => void;
  onFatalError: (reason?: string) => void;
}) {
  const { isLoaded, loadError } = useOnaGoogleMaps();
  const { theme } = useApp();

  useEffect(() => {
    if (loadError) {
      onFatalError(
        loadError.message ||
          "Could not load Google Maps. Check the API key and that Maps JavaScript API is ON.",
      );
    }
  }, [loadError, onFatalError]);

  if (loadError) {
    return (
      <div className="relative h-full w-full">
        <OsmServiceMap technicians={technicians} onSelect={onSelect} />
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[#a8c9b5]"
        style={{
          backgroundColor: mapThemeForApp(theme === "light").backgroundColor,
        }}
      >
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
          "Map tiles blocked. Enable Maps JavaScript API + billing for this key.",
        )
      }
    />
  );
}
