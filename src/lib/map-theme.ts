/**
 * Shared map look — same as home / dashboard ServiceMap.
 * Light app theme → dark green-black map.
 * Dark app theme → deep red-black map.
 */

export const MAP_BG_LIGHT = "#0a1610";
export const MAP_BG_DARK = "#0a0000";

/** Light toggle map: dark green mixed with black */
export const MAP_STYLES_LIGHT: google.maps.MapTypeStyle[] = [
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

/** Dark toggle map: deep red mixed with black */
export const MAP_STYLES_DARK: google.maps.MapTypeStyle[] = [
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

/** Carto dark tiles (OSM fallback) — same base as dashboard OSM map */
export const OSM_DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function mapThemeForApp(isLight: boolean): {
  styles: google.maps.MapTypeStyle[];
  backgroundColor: string;
  osmTileUrl: string;
  osmFilter: string;
} {
  return {
    styles: isLight ? MAP_STYLES_LIGHT : MAP_STYLES_DARK,
    backgroundColor: isLight ? MAP_BG_LIGHT : MAP_BG_DARK,
    osmTileUrl: OSM_DARK_TILE_URL,
    osmFilter: isLight
      ? "none"
      : "sepia(0.55) hue-rotate(-25deg) saturate(1.35) brightness(0.88)",
  };
}
