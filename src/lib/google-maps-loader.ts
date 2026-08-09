"use client";

/**
 * Single shared Google Maps JS loader for the whole app.
 *
 * @react-google-maps/api throws:
 *   "Loader must not be called again with different options"
 * if any component passes a different apiKey / id / libraries / version
 * under the same loader id. That crash showed up when a pro declined/later
 * and the customer hit the searching map after home had loaded with
 * googleMapsApiKey: "disabled".
 *
 * Rule: every map surface must call useOnaGoogleMaps() — never invent local options.
 */

import { useJsApiLoader } from "@react-google-maps/api";
import {
  getGoogleMapsApiKey,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
  GOOGLE_MAPS_LOADER_VERSION,
  shouldUseLiveMaps,
} from "@/lib/google-maps";

/** Frozen options object — property values must never diverge between callers. */
export function getOnaGoogleMapsLoaderOptions(): {
  id: string;
  googleMapsApiKey: string;
  libraries: typeof GOOGLE_MAPS_LIBRARIES;
  version: typeof GOOGLE_MAPS_LOADER_VERSION;
} {
  // Always the same key string for a given env. Do NOT use "disabled" here —
  // that was the permanent crash (loader options change between mounts).
  const key = getGoogleMapsApiKey();
  return {
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: key.length > 0 ? key : "ona-maps-key-unset",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: GOOGLE_MAPS_LOADER_VERSION,
  };
}

/**
 * App-wide Maps loader. Safe to call from many components at once.
 * `isLoaded` is true only when live maps are enabled and the key looks valid.
 */
export function useOnaGoogleMaps(): {
  isLoaded: boolean;
  loadError: Error | undefined;
  /** Script finished loading (even if live maps disabled / key missing). */
  scriptLoaded: boolean;
} {
  const options = getOnaGoogleMapsLoaderOptions();
  const { isLoaded: scriptLoaded, loadError } = useJsApiLoader(options);
  const live = shouldUseLiveMaps();
  return {
    scriptLoaded,
    isLoaded: Boolean(scriptLoaded && live && getGoogleMapsApiKey()),
    loadError,
  };
}
