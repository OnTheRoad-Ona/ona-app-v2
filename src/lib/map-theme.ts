/**
 * Customer map theme — dark green (light mode) / dark red (black mode).
 *
 * IMPORTANT: Export plain helpers first. Avoid evaluating anything that can
 * throw at module load (that made mapContainerStyle look "not a function"
 * under Turbopack partial init).
 *
 * Never set Google Maps `renderingType` after create — unsupported crash.
 */

/* ─── Palette ─── */
export const MAP_BG_LIGHT = "#0a1610";
export const MAP_LAND_LIGHT = "#0f1f16";
export const MAP_ROAD_LIGHT = "#2d5540";
export const MAP_ROAD_LIGHT_HI = "#3d7054";
export const MAP_LABEL_LIGHT = "#f0f7f3";

export const MAP_BG_DARK = "#0a0000";
export const MAP_LAND_DARK = "#1a0808";
export const MAP_ROAD_DARK = "#4d2222";
export const MAP_ROAD_DARK_HI = "#6e3030";
export const MAP_LABEL_DARK = "#fff0f0";

export const MAP_STYLE_REVISION = "map-theme-labels-v8";

export const OSM_DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export const MAP_ROUTE_STROKE = "#FF6B35";

/** Map style entries (compatible with google.maps.MapTypeStyle) */
export type OnaMapStyle = {
  featureType?: string;
  elementType?: string;
  stylers: Array<Record<string, string | number | boolean>>;
};

/**
 * GoogleMap mapContainerStyle prop — always a real function.
 * Defined early so any import gets a callable even if styles fail below.
 */
export function mapContainerStyle(
  isLight: boolean,
  extra?: Record<string, string | number>
): Record<string, string | number> {
  return {
    width: "100%",
    height: "100%",
    backgroundColor: isLight ? MAP_BG_LIGHT : MAP_BG_DARK,
    filter: "none",
    opacity: 1,
    ...(extra || {}),
  };
}

export function mapSurfaceStyle(isLight: boolean): {
  backgroundColor: string;
} {
  return {
    backgroundColor: isLight ? MAP_BG_LIGHT : MAP_BG_DARK,
  };
}

export function mapTileChromaKill(): string {
  return "none";
}

export function mapSurfaceFilter(_isLight: boolean): string {
  return "none";
}

/** Light mode: dark green tiles */
export const MAP_STYLES_LIGHT: OnaMapStyle[] = [
  { elementType: "geometry", stylers: [{ color: MAP_LAND_LIGHT }] },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#050a08" }, { weight: 3 }],
  },
  { elementType: "labels.text.fill", stylers: [{ color: MAP_LABEL_LIGHT }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a3d2e" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e8f5ee" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: MAP_ROAD_LIGHT }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0a1610" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: MAP_LABEL_LIGHT }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#050a08" }, { weight: 3 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: MAP_ROAD_LIGHT_HI }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0f1f16" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#346348" }],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ color: "#274a38" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#06100c" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#12241a" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0c1c14" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: MAP_BG_LIGHT }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: MAP_LAND_LIGHT }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry",
    stylers: [{ color: "#101e16" }],
  },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#c7d6cd" }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#050a08" }, { weight: 2 }] },
  { featureType: "landmark", elementType: "labels.text.fill", stylers: [{ color: "#eaf4ef" }] },
  { featureType: "landmark", elementType: "labels.text.stroke", stylers: [{ color: "#050a08" }, { weight: 2 }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#b9c8c0" }] },
  { featureType: "transit.station", elementType: "labels.text.stroke", stylers: [{ color: "#050a08" }, { weight: 2 }] },
];

/** Black mode: dark red tiles */
export const MAP_STYLES_DARK: OnaMapStyle[] = [
  { elementType: "geometry", stylers: [{ color: MAP_LAND_DARK }] },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#050000" }, { weight: 3 }],
  },
  { elementType: "labels.text.fill", stylers: [{ color: MAP_LABEL_DARK }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#3d1515" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#ffe8e8" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: MAP_ROAD_DARK }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#120606" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: MAP_LABEL_DARK }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#050000" }, { weight: 3 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: MAP_ROAD_DARK_HI }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a0808" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#5a2828" }],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ color: "#42201c" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#080000" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#1f0a0a" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#160606" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: MAP_BG_DARK }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: MAP_LAND_DARK }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry",
    stylers: [{ color: "#140606" }],
  },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d8c9b5" }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#050000" }, { weight: 2 }] },
  { featureType: "landmark", elementType: "labels.text.fill", stylers: [{ color: "#ffe8d6" }] },
  { featureType: "landmark", elementType: "labels.text.stroke", stylers: [{ color: "#050000" }, { weight: 2 }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#cfbfa8" }] },
  { featureType: "transit.station", elementType: "labels.text.stroke", stylers: [{ color: "#050000" }, { weight: 2 }] },
];

export function mapThemeForApp(isLight: boolean): {
  styles: OnaMapStyle[];
  backgroundColor: string;
  osmTileUrl: string;
  osmFilter: string;
} {
  return {
    styles: isLight ? MAP_STYLES_LIGHT : MAP_STYLES_DARK,
    backgroundColor: isLight ? MAP_BG_LIGHT : MAP_BG_DARK,
    osmTileUrl: OSM_DARK_TILE_URL,
    osmFilter: "none",
  };
}

/** Initial GoogleMap options — no renderingType (post-create crashes). */
export function mapRenderOptions(isLight: boolean): {
  styles: google.maps.MapTypeStyle[];
  backgroundColor: string;
  mapTypeId: string;
  clickableIcons: boolean;
} {
  const theme = mapThemeForApp(isLight);
  return {
    styles: theme.styles as google.maps.MapTypeStyle[],
    backgroundColor: theme.backgroundColor,
    mapTypeId: "roadmap",
    clickableIcons: false,
  };
}

/**
 * Apply dark-green / dark-red styles on a live map.
 * Never touches renderingType.
 */
export function applyOnaMapTheme(map: unknown, isLight: boolean): void {
  if (!map || typeof google === "undefined" || !google.maps) return;
  const gmap = map as google.maps.Map;
  const theme = mapThemeForApp(isLight);
  const typeId = isLight ? "ona_safe_green_v7" : "ona_safe_red_v7";
  const bg = theme.backgroundColor;

  try {
    const div = gmap.getDiv?.();
    if (div) {
      div.style.setProperty("filter", "none", "important");
      div.style.setProperty("opacity", "1", "important");
      div.style.backgroundColor = bg;
    }
  } catch {
    /* ignore */
  }

  try {
    const styles = theme.styles as google.maps.MapTypeStyle[];
    gmap.setOptions({
      styles,
      backgroundColor: bg,
    });
  } catch {
    /* ignore */
  }

  try {
    const styles = theme.styles as google.maps.MapTypeStyle[];
    if (typeof google.maps.StyledMapType === "function") {
      const styled = new google.maps.StyledMapType(styles, {
        name: isLight ? "Ona Dark Green" : "Ona Dark Red",
        alt: isLight ? "Dark green map" : "Dark red map",
      });
      gmap.mapTypes.set(typeId, styled);
      gmap.setMapTypeId(typeId as google.maps.MapTypeId);
      gmap.setOptions({
        styles,
        backgroundColor: bg,
      });
    } else {
      gmap.setMapTypeId(google.maps.MapTypeId.ROADMAP);
    }
  } catch {
    try {
      const styles = theme.styles as google.maps.MapTypeStyle[];
      gmap.setMapTypeId(google.maps.MapTypeId.ROADMAP);
      gmap.setOptions({
        styles,
        backgroundColor: bg,
      });
    } catch {
      /* ignore */
    }
  }
}

export function mapThemeForTrackTrip(isLight: boolean): {
  styles: google.maps.MapTypeStyle[];
  backgroundColor: string;
  routeStroke: string;
} {
  const base = mapThemeForApp(isLight);
  return {
    styles: base.styles as google.maps.MapTypeStyle[],
    backgroundColor: base.backgroundColor,
    routeStroke: MAP_ROUTE_STROKE,
  };
}
