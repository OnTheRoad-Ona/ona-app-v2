"use client";

/**
 * Live trip map: Google Maps Directions (copper route) + real pro GPS.
 * Falls back to OSM when Maps key is missing.
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

function PulsingProPin({
  position,
  label,
}: {
  position: { lat: number; lng: number };
  label: string;
}) {
  return (
    <OverlayViewF
      position={position}
      mapPaneName={OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={(w, h) => ({
        x: -(w ?? 36) / 2,
        y: -(h ?? 36) / 2,
      })}
    >
      <div
        className="om-live-pin om-live-pin--map relative h-9 w-9"
        title={label}
        aria-label={label}
      >
        <span className="om-live-beam" aria-hidden />
        <span className="om-live-beam om-live-beam-delay" aria-hidden />
        <span
          className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e07a3d] ring-4 ring-[#e07a3d]/35"
          aria-hidden
        />
      </div>
    </OverlayViewF>
  );
}

function GoogleTrackMap({
  job,
  isLight,
}: {
  job: JobRecord;
  isLight: boolean;
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

  const dest = job.motoristLocation;
  const origin = job.proLocation || null;

  const center = useMemo(() => {
    if (origin) {
      return {
        lat: (origin.lat + dest.lat) / 2,
        lng: (origin.lng + dest.lng) / 2,
      };
    }
    return dest;
  }, [origin, dest]);

  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: getGoogleMapsApiKey(),
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Directions + live ETA from Google when both points exist
  useEffect(() => {
    if (!isLoaded || !origin || !window.google?.maps) {
      setDirections(null);
      return;
    }
    const svc = new google.maps.DirectionsService();
    svc.route(
      {
        origin,
        destination: dest,
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
          bounds.extend(origin);
          bounds.extend(dest);
          mapRef.current?.fitBounds(bounds, 56);
        } else {
          setDirections(null);
        }
      }
    );
  }, [isLoaded, origin?.lat, origin?.lng, dest.lat, dest.lng]);

  // Prefer live server metrics; overlay Google Directions text when fresher
  const displayEtaMin =
    job.etaMinutes ?? routeEta?.minutes ?? null;
  const displayDist =
    job.distanceKm ?? routeEta?.distanceKm ?? null;
  const displayEtaText =
    job.etaText || routeEta?.durationText || null;
  const displayDistText =
    job.distanceText || routeEta?.distanceText || null;

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
        zoom={origin ? 13 : 15}
        onLoad={onLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
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
        <Marker
          position={dest}
          icon={{
            url: userIconUrl(),
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
          }}
          title="Your location"
        />
        {origin && (
          <PulsingProPin
            position={origin}
            label={`${job.repairProName} · live`}
          />
        )}
      </GoogleMap>

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
        <div className="rounded-2xl bg-black/55 px-3 py-2 text-white backdrop-blur-md">
          <p className="text-[10px] font-bold uppercase opacity-70">ETA</p>
          <p className="text-[15px] font-black tabular-nums">
            {displayEtaText ||
              (displayEtaMin != null ? formatEta(displayEtaMin) : "—")}
          </p>
          {job.etaSource === "google_distance_matrix" && (
            <p className="text-[9px] font-semibold text-[#e07a3d]">
              Live traffic
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-black/55 px-3 py-2 text-white backdrop-blur-md">
          <p className="text-[10px] font-bold uppercase opacity-70">
            Distance
          </p>
          <p className="text-[15px] font-black tabular-nums">
            {displayDistText ||
              (displayDist != null ? formatDistance(displayDist) : "—")}
          </p>
        </div>
        <div className="ml-auto rounded-2xl bg-[#e07a3d] px-3 py-2 text-white shadow-lg shadow-[#e07a3d]/30">
          <p className="text-[10px] font-bold uppercase opacity-90">Escrow</p>
          <p className="text-[13px] font-black">Held</p>
        </div>
      </div>

      {!origin && (
        <div
          className={cn(
            "absolute inset-x-3 top-3 rounded-2xl px-3 py-2 text-center text-[12px] font-bold backdrop-blur-md",
            isLight
              ? "bg-white/90 text-slate-800"
              : "bg-black/60 text-white"
          )}
        >
          Waiting for Repair Pro live location…
        </div>
      )}
    </div>
  );
}

export function LiveJobTrackMap({
  job,
  isLight,
}: {
  job: JobRecord;
  isLight: boolean;
}) {
  if (!shouldUseLiveMaps()) {
    // OSM still shows pins via service map shape — use compact fallback
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
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex gap-2">
          <div className="rounded-2xl bg-black/55 px-3 py-2 text-white backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase opacity-70">ETA</p>
            <p className="text-[15px] font-black">
              {job.etaText ||
                (job.etaMinutes != null ? formatEta(job.etaMinutes) : "—")}
            </p>
          </div>
          <div className="rounded-2xl bg-black/55 px-3 py-2 text-white backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase opacity-70">
              Distance
            </p>
            <p className="text-[15px] font-black">
              {job.distanceText ||
                (job.distanceKm != null
                  ? formatDistance(job.distanceKm)
                  : "—")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <GoogleTrackMap job={job} isLight={isLight} />;
}
