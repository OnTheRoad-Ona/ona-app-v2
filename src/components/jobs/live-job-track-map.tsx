"use client";

/**
 * Live trip map: dual pins + copper route.
 * Motorist sees Repair Pro movement; pro sees motorist location.
 * Pins labeled: You | Repair Pro | Motorist
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  OverlayViewF,
  OVERLAY_MOUSE_TARGET,
  useJsApiLoader,
} from "@react-google-maps/api";
import {
  getGoogleMapsApiKey,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  shouldUseLiveMaps,
} from "@/lib/google-maps";
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

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f1f16" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#060d0a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a8c9b5" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1e4030" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#060d0a" }],
  },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

/**
 * Trip stats bar — same solid dark capsule style.
 * Time + distance values only (no ETA/Distance labels).
 * Escrow Held keeps its copper segment.
 * Sits bottom-left with max-width so Google +/− (right) is free.
 */
function TripMapStatsBar({
  time,
  distance,
}: {
  time: string;
  distance: string;
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[5] max-w-[calc(100%-4.5rem)]">
      <div
        className="flex max-w-full items-center rounded-sm bg-[#141416] px-1 py-1 shadow-[0_8px_20px_rgba(0,0,0,0.4)]"
        style={{ border: "none" }}
      >
        {/* Time — value only, no “ETA” text */}
        <div className="min-w-0 max-w-[5.5rem] px-2.5 py-1.5 text-center">
          <p
            className="truncate text-[13px] font-bold tabular-nums leading-none text-white"
            title={time}
          >
            {time}
          </p>
        </div>
        {/* Distance — value only, no “Distance” text */}
        <div className="min-w-0 max-w-[5.5rem] px-2.5 py-1.5 text-center">
          <p
            className="truncate text-[13px] font-bold tabular-nums leading-none text-white"
            title={distance}
          >
            {distance}
          </p>
        </div>
        {/* Escrow Held — same copper style */}
        <div className="shrink-0 rounded-sm bg-[#e07a3d] px-2.5 py-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/90">
            Escrow
          </p>
          <p className="text-[12px] font-bold leading-none text-white">Held</p>
        </div>
      </div>
    </div>
  );
}

/** Pro pin: orange trade icon only — no text, no pulse/glow */
function ProMapPin({
  position,
  label,
  serviceType,
}: {
  position: { lat: number; lng: number };
  label: string;
  serviceType: string;
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon}
          alt=""
          width={size}
          height={size}
          className="block border-0"
          style={{
            width: size,
            height: size,
            filter: "none",
            display: "block",
          }}
          draggable={false}
        />
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

  const center = useMemo(() => {
    if (proPos) {
      return {
        lat: (proPos.lat + motoristPos.lat) / 2,
        lng: (proPos.lng + motoristPos.lng) / 2,
      };
    }
    return motoristPos;
  }, [proPos, motoristPos]);

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Directions: pro → motorist when both known
  useEffect(() => {
    if (!isLoaded || !proPos || !window.google?.maps) {
      setDirections(null);
      return;
    }
    const svc = new google.maps.DirectionsService();
    svc.route(
      {
        origin: proPos,
        destination: motoristPos,
        travelMode: google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirections(result);
          const leg = result.routes[0]?.legs[0];
          if (leg) {
            const sec =
              leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0;
            const meters = leg.distance?.value ?? 0;
            setRouteEta({
              minutes: Math.max(1, Math.round(sec / 60)),
              distanceKm: Math.round((meters / 1000) * 100) / 100,
              durationText:
                leg.duration_in_traffic?.text || leg.duration?.text,
              distanceText: leg.distance?.text,
            });
          }
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(proPos);
          bounds.extend(motoristPos);
          mapRef.current?.fitBounds(bounds, 56);
        } else {
          setDirections(null);
        }
      }
    );
  }, [isLoaded, proPos?.lat, proPos?.lng, motoristPos.lat, motoristPos.lng]);

  const motoristTitle = viewer === "motorist" ? "You" : "Motorist";
  const proLabel = viewer === "repair_pro" ? "You" : "Repair Pro";

  const displayEtaMin = job.etaMinutes ?? routeEta?.minutes ?? null;
  const displayDist = job.distanceKm ?? routeEta?.distanceKm ?? null;
  const timeValue =
    job.etaText ||
    routeEta?.durationText ||
    (displayEtaMin != null ? formatEta(displayEtaMin) : "—");
  const distValue =
    job.distanceText ||
    routeEta?.distanceText ||
    (displayDist != null ? formatDistance(displayDist) : "—");

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a1610] text-sm text-[#a8c9b5]">
        Loading live map…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={proPos ? 13 : 15}
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
          styles: MAP_STYLES,
          clickableIcons: false,
          gestureHandling: "greedy",
        }}
      >
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: "#e07a3d",
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

      <TripMapStatsBar time={timeValue} distance={distValue} />

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
      <div className="relative h-full w-full bg-[#0a1610]">
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
            (job.etaMinutes != null ? formatEta(job.etaMinutes) : "—")
          }
          distance={
            job.distanceText ||
            (job.distanceKm != null ? formatDistance(job.distanceKm) : "—")
          }
        />
      </div>
    );
  }

  return <GoogleTrackMap job={job} isLight={isLight} viewer={viewer} />;
}
