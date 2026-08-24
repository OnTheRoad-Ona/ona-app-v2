"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, Loader2, Locate, MapPin } from "lucide-react";
import { reverseGeocodeLatLng, shouldUseLiveMaps } from "@/lib/google-maps";
import { useOnaGoogleMaps } from "@/lib/google-maps-loader";
import {
  knownPlaceToPick,
  matchKnownPlaces,
  resolveKnownPlace,
  type KnownPlace,
} from "@/lib/known-places";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { PickedLocation } from "./location-picker-map";

type GoogleSuggestion = {
  id: string;
  primary: string;
  secondary: string;
  placeId: string;
};

/** Two concentric orange circles with an orange centre dot (target reticle). */
function TargetReticle({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-block h-4 w-4 shrink-0", className)}
      aria-hidden="true"
    >
      <span className="absolute inset-0 rounded-full border-[1.5px] border-[#FF6B35]" />
      <span className="absolute inset-[4px] rounded-full border border-[#FF6B35]" />
      <span className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF6B35]" />
    </span>
  );
}

function parseGeocodeResult(
  result: google.maps.GeocoderResult,
  lat: number,
  lng: number,
): PickedLocation {
  const comps = result.address_components ?? [];
  const get = (type: string) =>
    comps.find((c) => c.types.includes(type))?.long_name ?? "";

  const area =
    get("neighborhood") ||
    get("sublocality") ||
    get("sublocality_level_1") ||
    get("route") ||
    get("administrative_area_level_2") ||
    "";
  const city =
    get("locality") ||
    get("administrative_area_level_1") ||
    get("country") ||
    "Nigeria";
  const label =
    result.formatted_address ||
    [area, city].filter(Boolean).join(", ") ||
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  return { lat, lng, label, city, area: area || city };
}

/**
 * inDrive-style address search no map. A prominent search field with
 * Google Places autocomplete (curated local places as extra suggestions),
 * tied to Google Maps via Places details / Geocoder, plus "Use my current
 * location". The confirmed address is shown as a checked chip so the field
 * is never "just a box".
 */
export function AddressAutocomplete({
  value,
  onChange,
  className,
}: {
  value?: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
  className?: string;
}) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const live = shouldUseLiveMaps();
  const { isLoaded } = useOnaGoogleMaps();

  const [query, setQuery] = useState(value?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [knownHits, setKnownHits] = useState<KnownPlace[]>([]);
  const [googleHits, setGoogleHits] = useState<GoogleSuggestion[]>([]);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const placesAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value?.label) setQuery(value.label);
  }, [value?.label]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const applyPick = useCallback(
    (picked: PickedLocation) => {
      setQuery(picked.label);
      onChange(picked);
      setOpenSuggest(false);
      setStatus(null);
    },
    [onChange],
  );

  const applyKnown = useCallback(
    (place: KnownPlace) => {
      applyPick(knownPlaceToPick(place));
    },
    [applyPick],
  );

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setBusy(true);
      try {
        const rest = await reverseGeocodeLatLng(lat, lng);
        if (rest) {
          applyPick({
            lat,
            lng,
            label: rest.label,
            city: rest.city,
            area: rest.area,
          });
          return;
        }
        if (window.google?.maps) {
          const geocoder = new google.maps.Geocoder();
          const { results } = await geocoder.geocode({
            location: { lat, lng },
          });
          if (results?.[0]) {
            applyPick(parseGeocodeResult(results[0], lat, lng));
            return;
          }
        }
        applyPick({
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          city: "Near you",
          area: "Selected pin",
        });
      } catch {
        setStatus(
          "We could not get the street name. Your location is still saved.",
        );
        onChange({
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          city: "Near you",
          area: "Selected pin",
        });
      } finally {
        setBusy(false);
      }
    },
    [applyPick, onChange],
  );

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("Location is not available on this device.");
      return;
    }
    setBusy(true);
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus(null);
        void reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setStatus(
          "Could not read GPS. Type your address and pick a suggestion.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5_000 },
    );
  }, [reverseGeocode]);

  const fetchGoogleSuggestions = useCallback(
    (text: string) => {
      if (!isLoaded || !live || !window.google?.maps?.places) {
        setGoogleHits([]);
        return;
      }
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current =
            new google.maps.places.AutocompleteSessionToken();
        }
        const svc = new google.maps.places.AutocompleteService();
        svc.getPlacePredictions(
          {
            input: text,
            componentRestrictions: { country: ["ng"] },
            sessionToken: sessionTokenRef.current,
          },
          (preds, s) => {
            if (
              s !== google.maps.places.PlacesServiceStatus.OK ||
              !preds?.length
            ) {
              setGoogleHits([]);
              return;
            }
            setGoogleHits(
              preds.slice(0, 5).map((p) => ({
                id: p.place_id,
                primary:
                  p.structured_formatting?.main_text ||
                  p.description.split(",")[0] ||
                  p.description,
                secondary:
                  p.structured_formatting?.secondary_text || p.description,
                placeId: p.place_id,
              })),
            );
          },
        );
      } catch {
        setGoogleHits([]);
      }
    },
    [isLoaded, live],
  );

  const onQueryChange = (text: string) => {
    setQuery(text);
    setOpenSuggest(true);
    setKnownHits(matchKnownPlaces(text, 4).map((r) => r.place));
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setGoogleHits([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      fetchGoogleSuggestions(text.trim());
    }, 220);
  };

  const selectGoogle = (s: GoogleSuggestion) => {
    const knownFromText = resolveKnownPlace(`${s.primary} ${s.secondary}`);
    if (knownFromText) {
      applyKnown(knownFromText);
      sessionTokenRef.current = null;
      return;
    }
    if (!window.google?.maps?.places || !placesAnchorRef.current) {
      setBusy(true);
      void (async () => {
        try {
          const known =
            resolveKnownPlace(`${s.primary} ${s.secondary}`) || knownHits[0];
          if (known) {
            applyKnown(known);
            return;
          }
          if (window.google?.maps) {
            const geocoder = new google.maps.Geocoder();
            const { results } = await geocoder.geocode({
              address: `${s.primary}, ${s.secondary}`,
              componentRestrictions: { country: "ng" },
            });
            if (results?.[0]?.geometry?.location) {
              const lat = results[0].geometry.location.lat();
              const lng = results[0].geometry.location.lng();
              applyPick(parseGeocodeResult(results[0], lat, lng));
            }
          }
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setBusy(true);
    const svc = new google.maps.places.PlacesService(placesAnchorRef.current);
    svc.getDetails(
      {
        placeId: s.placeId,
        fields: ["formatted_address", "geometry", "name", "address_components"],
        sessionToken: sessionTokenRef.current ?? undefined,
      },
      (place, st) => {
        setBusy(false);
        sessionTokenRef.current = null;
        if (
          st !== google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          setStatus("Could not open that place. Try again.");
          return;
        }
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        if (place.formatted_address) {
          applyPick({
            lat,
            lng,
            label: place.formatted_address,
            city: place.formatted_address,
            area: place.name || place.formatted_address,
          });
        } else {
          void reverseGeocode(lat, lng);
        }
      },
    );
  };

  const submitSearch = () => {
    const typed = query.trim();
    if (!typed) return;
    const known = resolveKnownPlace(typed);
    if (known) {
      applyKnown(known);
      return;
    }
    if (knownHits[0]) {
      applyKnown(knownHits[0]);
      return;
    }
    if (googleHits[0]) {
      selectGoogle(googleHits[0]);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        if (window.google?.maps) {
          const geocoder = new google.maps.Geocoder();
          const { results } = await geocoder.geocode({
            address: typed,
            componentRestrictions: { country: "ng" },
          });
          if (results?.[0]?.geometry?.location) {
            const lat = results[0].geometry.location.lat();
            const lng = results[0].geometry.location.lng();
            applyPick(parseGeocodeResult(results[0], lat, lng));
            return;
          }
        }
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
            typed,
          )}`,
          { headers: { Accept: "application/json" } },
        );
        const data = (await res.json()) as {
          lat?: string;
          lon?: string;
          display_name?: string;
        }[];
        const hit = data?.[0];
        if (hit?.lat && hit?.lon) {
          applyPick({
            lat: Number(hit.lat),
            lng: Number(hit.lon),
            label: hit.display_name || typed,
            city: hit.display_name || typed,
            area: hit.display_name || typed,
          });
          return;
        }
        setStatus("Could not find that place. Pick a suggestion instead.");
      } finally {
        setBusy(false);
      }
    })();
  };

  const showPanel =
    openSuggest &&
    query.trim().length >= 2 &&
    (knownHits.length > 0 || googleHits.length > 0);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <TargetReticle className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setKnownHits(matchKnownPlaces(query, 4).map((r) => r.place));
              setOpenSuggest(true);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setOpenSuggest(false), 180);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setOpenSuggest(false);
              submitSearch();
            }
            if (e.key === "Escape") setOpenSuggest(false);
          }}
          placeholder="Current Location…"
          autoComplete="off"
          aria-autocomplete="list"
          className={cn(
            "h-11 w-full rounded-md border-0 pl-10 pr-11 text-[13px] font-medium outline-none",
            isLight
              ? "bg-[#D8DCE4] text-slate-900 placeholder:text-slate-400"
              : "bg-white/[0.06] text-white placeholder:text-white/40",
          )}
        />

        <button
          type="button"
          onClick={useMyLocation}
          disabled={busy}
          aria-label="Use my current location"
          className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#FF6B35]/40 text-[#FF6B35] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
          ) : (
            <Locate className="h-4 w-4" strokeWidth={2.4} />
          )}
        </button>

        {showPanel ? (
          <ul
            role="listbox"
            className={cn(
              "absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-56 overflow-y-auto rounded-md shadow-lg",
              isLight ? "bg-[#D8DCE4]" : "bg-[#1c1c1e]",
            )}
          >
            {knownHits.map((p) => (
              <li key={p.id} role="option" aria-selected="false">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-[#FF6B35]/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyKnown(p)}
                >
                  <Building2
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6B35]"
                    strokeWidth={2.2}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[12px] font-bold",
                        isLight ? "text-slate-900" : "text-white",
                      )}
                    >
                      {p.name}
                    </span>
                    <span
                      className={cn(
                        "block text-[10px] font-medium",
                        isLight ? "text-slate-500" : "text-white/50",
                      )}
                    >
                      {p.address}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {googleHits.map((s) => (
              <li key={s.id} role="option" aria-selected="false">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-[#FF6B35]/10"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectGoogle(s)}
                >
                  <MapPin
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64748b]"
                    strokeWidth={2.2}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[12px] font-bold",
                        isLight ? "text-slate-900" : "text-white",
                      )}
                    >
                      {s.primary}
                    </span>
                    <span
                      className={cn(
                        "block text-[10px] font-medium",
                        isLight ? "text-slate-500" : "text-white/50",
                      )}
                    >
                      {s.secondary}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {value ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md px-2.5 py-2",
            isLight ? "bg-[#FF6B35]/10" : "bg-[#FF6B35]/15",
          )}
        >
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B35]"
            strokeWidth={2.5}
          />
          <span
            className={cn(
              "min-w-0 text-[12px] font-semibold leading-snug",
              isLight ? "text-slate-800" : "text-white/90",
            )}
          >
            {value.label}
          </span>
        </div>
      ) : null}

      {busy ? (
        <p
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium",
            isLight ? "text-slate-500" : "text-white/45",
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Getting address…
        </p>
      ) : null}
      {status ? (
        <p className="text-[11px] font-medium text-[#FF6B35]">{status}</p>
      ) : null}

      {/* Anchors PlacesService so details can resolve without a map instance */}
      <div ref={placesAnchorRef} className="hidden" />
    </div>
  );
}
