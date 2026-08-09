"use client";

/**
 * Live trip map: dual pins + copper route.
 * Motorist sees Repair Pro movement; pro sees motorist location.
 * Colors match customer dashboard map in both themes
 * (light → green-black, dark → red-black) with street/POI labels forced on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  OverlayViewF,
  OVERLAY_MOUSE_TARGET,
} from "@react-google-maps/api";
import { shouldUseLiveMaps } from "@/lib/google-maps";
import { useOnaGoogleMaps } from "@/lib/google-maps-loader";
import { MapTintOverlay } from "@/components/map/map-tint-overlay";
import {
  MAP_ROUTE_STROKE,
  MAP_STYLE_REVISION,
  applyOnaMapTheme,
  mapContainerStyle,
  mapRenderOptions,
  mapThemeForApp,
  mapThemeForTrackTrip,
} from "@/lib/map-theme";
import type { JobRecord } from "@/lib/jobs/types";
import {
  USER_MAP_PIN_ANCHOR,
  USER_MAP_PIN_SIZE,
  userMapPinUrl,
} from "@/lib/map-user-pin";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
import { cn, formatDistance, formatEta } from "@/lib/utils";

const OsmFallback = dynamic(
  () =>
    import("@/components/map/osm-service-map").then((m) => m.OsmServiceMap),
  { ssr: false }
);

/**
 * Map-only chrome: Time · Distance · Escrow Held.
 * Name / amount / problem stay in the lower job panel — never overlaid here.
 */
function TripMapStatsBar({
  time,
  distance,
  isLight,
}: {
  time: string;
  distance: string;
  isLight: boolean;
}) {
  const amountClass = isLight ? "text-[#111111]" : "text-white";
  const labelClass = isLight ? "text-[#555555]" : "text-white/55";

  return (
    <div
      className="pointer-events-none absolute left-3 z-[5] max-w-[calc(100%-5rem)]"
      style={{ bottom: "2.75rem" }}
    >
      <div
        className={cn(
          "flex max-w-full items-stretch rounded-lg border-0 px-1 py-1",
          isLight ? "bg-[#E8E8E8]" : "bg-[#2c2c2e]"
        )}
        style={{ border: "none", boxShadow: "none" }}
      >
        <div className="min-w-0 max-w-[5.75rem] px-2.5 py-1.5 text-center">
          <p
            className={cn(
              "text-[8px] font-semibold uppercase tracking-[0.1em] leading-none",
              labelClass
            )}
          >
            Time
          </p>
          <p
            className={cn(
              "mt-1 truncate text-[13px] font-bold tabular-nums leading-none",
              amountClass
            )}
            title={time}
          >
            {time}
          </p>
        </div>
        <div className="min-w-0 max-w-[5.75rem] px-2.5 py-1.5 text-center">
          <p
            className={cn(
              "text-[8px] font-semibold uppercase tracking-[0.1em] leading-none",
              labelClass
            )}
          >
            Distance
          </p>
          <p
            className={cn(
              "mt-1 truncate text-[13px] font-bold tabular-nums leading-none",
              amountClass
            )}
            title={distance}
          >
            {distance}
          </p>
        </div>
        <div className="shrink-0 rounded-lg border-0 bg-[#FF6B35] px-2.5 py-1.5 text-center shadow-none">
          <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white">
            Escrow
          </p>
          <p className="mt-0.5 text-[12px] font-bold leading-none text-white">
            Held
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Pro pin on trip map — solid Message-orange trade icon.
 * Pulses only while the pro is actively on the trip (en route / arrived / working).
 */
function ProMapPin({
  position,
  label,
  serviceType,
  active = true,
}: {
  position: { lat: number; lng: number };
  label: string;
  serviceType: string;
  active?: boolean;
}) {
  const size = 30;
  const box = 32;
  const icon = tradeIconDataUrl(serviceType, {
    size,
    selected: true,
    flat: true,
  });
  return (
    <OverlayViewF
      position={position}
      mapPaneName={OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={(w, h) => ({
        x: -(w ?? box) / 2,
        y: -(h ?? box) / 2,
      })}
    >
      <div
        className="relative border-0 bg-transparent"
        style={{ width: box, height: box }}
        title={label}
        aria-label={label}
      >
        <span
          className="absolute left-1/2 top-1/2 flex items-center justify-center"
          style={{
            width: size,
            height: size,
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={icon}
            alt=""
            width={size}
            height={size}
            className={
              active
                ? "om-live-glyph om-live-glyph--pulse block border-0"
                : "om-live-glyph block border-0"
            }
            style={{
              width: size,
              height: size,
              filter: "none",
              display: "block",
            }}
            draggable={false}
          />
        </span>
      </div>
    </OverlayViewF>
  );
}

function GoogleTrackMap({
  job,
  isLight,
  viewer,
}: {
  job: JobRecord;
  isLight: boolean;
  viewer: "motorist" | "repair_pro";
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  /** Once user pans/zooms, never auto fitBounds / pan back. */
  const userHasMovedMapRef = useRef(false);
  /** First auto-frame only (pins visible). */
  const didInitialFitRef = useRef(false);
  /** Ignore zoom_changed fired by our own fitBounds. */
  const programmaticCameraRef = useRef(false);
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);
  const [routeEta, setRouteEta] = useState<{
    minutes: number;
    distanceKm: number;
    durationText?: string;
    distanceText?: string;
  } | null>(null);

  const motoristPos = job.motoristLocation;
  const proPos = job.proLocation || null;

  // Same green/red dashboard map colors as customer home — both theme modes.
  const theme = mapThemeForApp(isLight);
  const tripTheme = useMemo(() => mapThemeForTrackTrip(isLight), [isLight]);

  /**
   * Stable initial center only — live GPS must NOT update the GoogleMap `center`
   * prop or React will snap the viewport every pro location tick.
   */
  const initialCenterRef = useRef({
    lat: proPos
      ? (proPos.lat + motoristPos.lat) / 2
      : motoristPos.lat,
    lng: proPos
      ? (proPos.lng + motoristPos.lng) / 2
      : motoristPos.lng,
  });

  const fitTripIfAllowed = useCallback(
    (map?: google.maps.Map | null) => {
      const m = map ?? mapRef.current;
      // Never re-frame after first auto-fit or after the user takes the camera.
      if (!m || userHasMovedMapRef.current || didInitialFitRef.current) return;
      try {
        programmaticCameraRef.current = true;
        if (proPos) {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(proPos);
          bounds.extend(motoristPos);
          m.fitBounds(bounds, 56);
          didInitialFitRef.current = true;
        } else {
          m.panTo(motoristPos);
          m.setZoom(16);
          didInitialFitRef.current = true;
        }
        window.setTimeout(() => {
          programmaticCameraRef.current = false;
        }, 400);
      } catch {
        programmaticCameraRef.current = false;
      }
    },
    [proPos, motoristPos]
  );

  const { isLoaded, loadError } = useOnaGoogleMaps();

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      applyOnaMapTheme(map, isLight);
      map.setOptions({
        ...mapRenderOptions(isLight),
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        gestureHandling: "greedy",
      });

      // User drag / pinch-zoom / zoom control → free camera (stop auto-reset).
      map.addListener("dragstart", () => {
        userHasMovedMapRef.current = true;
      });
      map.addListener("zoom_changed", () => {
        if (programmaticCameraRef.current) return;
        if (didInitialFitRef.current) {
          userHasMovedMapRef.current = true;
        }
      });

      const bump = () => {
        try {
          google.maps.event.trigger(map, "resize");
        } catch {
          /* ignore */
        }
        fitTripIfAllowed(map);
      };
      bump();
      window.setTimeout(bump, 80);
      window.setTimeout(bump, 320);
    },
    [isLight, fitTripIfAllowed]
  );

  // Keep palette + street names in sync on theme toggle (no camera steal).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    applyOnaMapTheme(map, isLight);
  }, [isLoaded, isLight]);

  // Directions: pro → motorist when both known.
  // Updates route line + ETA only — does not re-center after user pans.
  useEffect(() => {
    if (!proPos) {
      setDirections(null);
      return;
    }

    const applyHaversineEta = () => {
      const R = 6371;
      const dLat = ((motoristPos.lat - proPos.lat) * Math.PI) / 180;
      const dLng = ((motoristPos.lng - proPos.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((proPos.lat * Math.PI) / 180) *
          Math.cos((motoristPos.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const km =
        Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) /
        100;
      // ~25 km/h city crawl estimate
      const minutes = Math.max(1, Math.round((km / 25) * 60));
      setRouteEta({
        minutes,
        distanceKm: km,
        durationText: `${minutes} min`,
        distanceText: km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`,
      });
      setDirections(null);
      fitTripIfAllowed();
    };

    if (!isLoaded || !window.google?.maps?.DirectionsService) {
      applyHaversineEta();
      return;
    }

    let cancelled = false;
    const svc = new google.maps.DirectionsService();
    svc.route(
      {
        origin: proPos,
        destination: motoristPos,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) return;
        if (status === "OK" && result) {
          setDirections(result);
          const leg = result.routes[0]?.legs[0];
          if (leg) {
            const sec = leg.duration?.value ?? 0;
            const meters = leg.distance?.value ?? 0;
            setRouteEta({
              minutes: Math.max(1, Math.round(sec / 60)),
              distanceKm: Math.round((meters / 1000) * 100) / 100,
              durationText: leg.duration?.text,
              distanceText: leg.distance?.text,
            });
          }
          // First auto-frame only; later GPS ticks only move pins, not the camera.
          fitTripIfAllowed();
        } else {
          // REQUEST_DENIED / ZERO_RESULTS / OVER_QUERY_LIMIT → still show ETA
          applyHaversineEta();
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    isLoaded,
    proPos?.lat,
    proPos?.lng,
    motoristPos.lat,
    motoristPos.lng,
    fitTripIfAllowed,
  ]);

  const motoristTitle = viewer === "motorist" ? "You" : "Customer";
  const proLabel = viewer === "repair_pro" ? "You" : "Repair Pro";

  const displayEtaMin = job.etaMinutes ?? routeEta?.minutes ?? null;
  const displayDist = job.distanceKm ?? routeEta?.distanceKm ?? null;
  const timeValue =
    job.etaText ||
    routeEta?.durationText ||
    (displayEtaMin != null ? formatEta(displayEtaMin) : "Not set");
  const distValue =
    job.distanceText ||
    routeEta?.distanceText ||
    (displayDist != null ? formatDistance(displayDist) : "Not set");

  if (loadError) {
    return (
      <div
        className="relative h-full w-full"
        style={{ backgroundColor: theme.backgroundColor }}
      >
        <OsmFallback
          technicians={
            proPos
              ? [
                  {
                    id: job.repairProId,
                    name: job.repairProName,
                    shortName: job.repairProName.split(" ")[0] || "Pro",
                    serviceType: job.serviceType,
                    roleLabel: "Repair Pro",
                    photo: job.repairProPhoto || "",
                    rating: 5,
                    reviewCount: 0,
                    distanceKm: job.distanceKm ?? 0,
                    etaMinutes: job.etaMinutes ?? 0,
                    status: "available" as const,
                    verified: true,
                    fastResponse: true,
                    specialties: [],
                    description: "",
                    phone: "",
                    serviceRadiusKm: 10,
                    location: proPos,
                    responseSpeedScore: 1,
                    currentLoad: 0,
                  },
                ]
              : []
          }
        />
        <TripMapStatsBar
          time={timeValue}
          distance={distValue}
          isLight={isLight}
        />
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[#a8c9b5]"
        style={{ backgroundColor: tripTheme.backgroundColor }}
      >
        Loading live map…
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      data-map-surface="track-trip"
      data-map-engine="google"
      data-map-theme={isLight ? "light" : "dark"}
      data-map-rev={MAP_STYLE_REVISION}
      style={{ backgroundColor: tripTheme.backgroundColor }}
    >
      <GoogleMap
        key={`track-${MAP_STYLE_REVISION}-${isLight ? "light" : "dark"}`}
        mapContainerStyle={mapContainerStyle(isLight, {
          backgroundColor: tripTheme.backgroundColor,
        })}
        // Stable initial center only — do not pass live GPS midpoints or the map snaps back.
        center={initialCenterRef.current}
        zoom={16}
        onLoad={onLoad}
        options={{
          ...mapRenderOptions(isLight),
          styles: tripTheme.styles,
          backgroundColor: tripTheme.backgroundColor,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: {
            position:
              typeof google !== "undefined"
                ? google.maps.ControlPosition.RIGHT_BOTTOM
                : 9,
          },
          mapTypeId:
            typeof google !== "undefined"
              ? google.maps.MapTypeId.ROADMAP
              : "roadmap",
          draggable: true,
          scrollwheel: true,
          gestureHandling: "greedy",
          maxZoom: 19,
          minZoom: 12,
        }}
      >
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              // Critical: route updates must not re-center the map under the user.
              preserveViewport: true,
              polylineOptions: {
                strokeColor: MAP_ROUTE_STROKE,
                strokeWeight: 5,
                strokeOpacity: 0.92,
              },
            }}
          />
        )}

        {/* Motorist pin — icon only (no “You” text) */}
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
          title={motoristTitle}
          zIndex={500}
        />

        {/* Repair Pro pin — flat orange icon, no glow */}
        {proPos && (
          <ProMapPin
            position={proPos}
            label={proLabel}
            serviceType={job.serviceType}
          />
        )}
      </GoogleMap>
      <MapTintOverlay isLight={isLight} />

      <TripMapStatsBar
        time={timeValue}
        distance={distValue}
        isLight={isLight}
      />

      {viewer === "motorist" && !proPos && (
        <div
          className={cn(
            "absolute inset-x-3 top-3 rounded-sm px-3 py-2 text-center text-[12px] font-bold",
            isLight
              ? "bg-[#e8e9ed] text-slate-800 shadow-md"
              : "bg-[#1c1c1e] text-white shadow-md"
          )}
        >
          Waiting for Repair Pro live location…
        </div>
      )}
      {viewer === "repair_pro" && !proPos && (
        <div
          className={cn(
            "absolute inset-x-3 top-3 rounded-sm px-3 py-2 text-center text-[12px] font-bold",
            isLight
              ? "bg-[#e8e9ed] text-slate-800 shadow-md"
              : "bg-[#1c1c1e] text-white shadow-md"
          )}
        >
          Enable GPS to show your live pin · motorist marked below
        </div>
      )}
    </div>
  );
}

export function LiveJobTrackMap({
  job,
  isLight,
  viewer = "motorist",
}: {
  job: JobRecord;
  isLight: boolean;
  viewer?: "motorist" | "repair_pro";
}) {
  if (!shouldUseLiveMaps()) {
    return (
      <div
        className="relative h-full w-full"
        style={{ backgroundColor: mapThemeForApp(isLight).backgroundColor }}
      >
        <OsmFallback
          technicians={
            job.proLocation
              ? [
                  {
                    id: job.repairProId,
                    name: job.repairProName,
                    shortName: job.repairProName.split(" ")[0] || "Pro",
                    serviceType: job.serviceType,
                    roleLabel: "Repair Pro",
                    photo: job.repairProPhoto || "",
                    rating: 5,
                    reviewCount: 0,
                    distanceKm: job.distanceKm ?? 0,
                    etaMinutes: job.etaMinutes ?? 0,
                    status: "available" as const,
                    verified: true,
                    fastResponse: true,
                    specialties: [],
                    description: "",
                    phone: "",
                    serviceRadiusKm: 10,
                    location: job.proLocation,
                    responseSpeedScore: 1,
                    currentLoad: 0,
                  },
                ]
              : []
          }
        />
        <TripMapStatsBar
          time={
            job.etaText ||
            (job.etaMinutes != null ? formatEta(job.etaMinutes) : "Not set")
          }
          distance={
            job.distanceText ||
            (job.distanceKm != null ? formatDistance(job.distanceKm) : "Not set")
          }
          isLight={isLight}
        />
      </div>
    );
  }

  return <GoogleTrackMap job={job} isLight={isLight} viewer={viewer} />;
}
