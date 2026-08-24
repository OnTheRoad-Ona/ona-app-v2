"use client";

/**
 * Real Google Map for the customer waiting/searching screen.
 * Anchored on the motorist location with a pulsing "searching" ring while
 * dispatch looks for the next available pro. OSM fallback when live maps
 * are disabled (same convention as the trip map).
 */

import { useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { shouldUseLiveMaps } from "@/lib/google-maps";
import { useOnaGoogleMaps } from "@/lib/google-maps-loader";
import {
  USER_MAP_PIN_ANCHOR,
  USER_MAP_PIN_SIZE,
  userMapPinUrl,
} from "@/lib/map-user-pin";
import { MapTintOverlay } from "@/components/map/map-tint-overlay";
import {
  MAP_STYLE_REVISION,
  applyOnaMapTheme,
  mapContainerStyle,
  mapRenderOptions,
  mapThemeForApp,
} from "@/lib/map-theme";
import type { JobRecord } from "@/lib/jobs/types";

const OsmFallback = dynamic(
  () => import("@/components/map/osm-service-map").then((m) => m.OsmServiceMap),
  { ssr: false },
);

function GoogleSearchingMap({
  job,
  isLight,
}: {
  job: JobRecord;
  isLight: boolean;
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const theme = mapThemeForApp(isLight);
  const motoristPos = useMemo(
    () => job.motoristLocation,
    [job.motoristLocation],
  );

  const { isLoaded, loadError } = useOnaGoogleMaps();

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      applyOnaMapTheme(map, isLight);
    },
    [isLight],
  );

  if (loadError) {
    return <OsmFallback technicians={[]} />;
  }

  if (!isLoaded) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[#a8c9b5]"
        style={{ backgroundColor: theme.backgroundColor }}
      >
        Loading live map…
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      data-map-surface
      data-map-engine="google"
      data-map-theme={isLight ? "light" : "dark"}
      data-map-rev={MAP_STYLE_REVISION}
    >
      <GoogleMap
        key={`search-${MAP_STYLE_REVISION}-${isLight ? "light" : "dark"}`}
        mapContainerStyle={mapContainerStyle(isLight)}
        center={motoristPos}
        zoom={16}
        onLoad={onLoad}
        options={{
          ...mapRenderOptions(isLight),
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position:
              typeof google !== "undefined"
                ? google.maps.ControlPosition.RIGHT_BOTTOM
                : 9,
          },
          gestureHandling: "greedy",
          minZoom: 12,
          maxZoom: 19,
        }}
      >
        {/* Motorist pin */}
        <Marker
          position={motoristPos}
          icon={{
            url: userMapPinUrl(USER_MAP_PIN_SIZE),
            scaledSize: new google.maps.Size(
              USER_MAP_PIN_SIZE,
              USER_MAP_PIN_SIZE,
            ),
            anchor: new google.maps.Point(
              USER_MAP_PIN_ANCHOR,
              USER_MAP_PIN_ANCHOR,
            ),
          }}
          title="Your location"
          zIndex={500}
        />
      </GoogleMap>
      <MapTintOverlay isLight={isLight} />

      {/* Searching radar green on light map, soft red on Aug-1 dark red-black map */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-24 w-24">
          <span
            className="absolute inset-0 animate-ping rounded-full border-2 opacity-60"
            style={{
              borderColor: isLight ? "#34d399" : "#e8b4b0",
            }}
          />
          <span
            className="absolute inset-3 animate-ping rounded-full border-2 opacity-40 [animation-delay:180ms]"
            style={{
              borderColor: isLight ? "#34d399" : "#e8b4b0",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function SearchingMap({
  job,
  isLight,
}: {
  job: JobRecord;
  isLight: boolean;
}) {
  if (!shouldUseLiveMaps()) {
    return (
      <div className="relative h-full w-full">
        <OsmFallback technicians={[]} />
      </div>
    );
  }
  return <GoogleSearchingMap job={job} isLight={isLight} />;
}
