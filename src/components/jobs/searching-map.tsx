"use client";

/**
 * Real Google Map for the customer waiting/searching screen.
 * Anchored on the motorist location with a pulsing "searching" ring while
 * dispatch looks for the next available pro. OSM fallback when live maps
 * are disabled (same convention as the trip map).
 */

import { useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import {
  getGoogleMapsApiKey,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  shouldUseLiveMaps,
} from "@/lib/google-maps";
import {
  USER_MAP_PIN_ANCHOR,
  USER_MAP_PIN_SIZE,
  userMapPinUrl,
} from "@/lib/map-user-pin";
import { mapThemeForApp } from "@/lib/map-theme";
import type { JobRecord } from "@/lib/jobs/types";

const OsmFallback = dynamic(
  () =>
    import("@/components/map/osm-service-map").then((m) => m.OsmServiceMap),
  { ssr: false }
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
    [job.motoristLocation]
  );

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

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
    <div className="relative h-full w-full">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={motoristPos}
        zoom={15}
        onLoad={onLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position:
              typeof google !== "undefined"
                ? google.maps.ControlPosition.RIGHT_BOTTOM
                : 9,
          },
          styles: theme.styles,
          clickableIcons: false,
          gestureHandling: "greedy",
        }}
      >
        {/* Motorist pin */}
        <Marker
          position={motoristPos}
          icon={{
            url: userMapPinUrl(USER_MAP_PIN_SIZE),
            scaledSize: new google.maps.Size(
              USER_MAP_PIN_SIZE,
              USER_MAP_PIN_SIZE
            ),
            anchor: new google.maps.Point(
              USER_MAP_PIN_ANCHOR,
              USER_MAP_PIN_ANCHOR
            ),
          }}
          title="Your location"
          zIndex={500}
        />
      </GoogleMap>

      {/* Searching radar ring anchored over the pin — InDrive style */}
      {/* Light app theme → dark green map: green pulse · Dark app theme → red-black map: reddish-brown pulse */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-24 w-24">
          <span
            className="absolute inset-0 animate-ping rounded-full border-2 opacity-60"
            style={{
              borderColor: isLight ? "#34d399" : "#a8502f",
            }}
          />
          <span
            className="absolute inset-3 animate-ping rounded-full border-2 opacity-40 [animation-delay:180ms]"
            style={{
              borderColor: isLight ? "#34d399" : "#a8502f",
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
