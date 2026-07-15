/**
 * Motorist “You” map pin — small slate human silhouette.
 * Sized to sit cleanly beside trade icons (~20–24px).
 */

/** Google Maps Marker data-URL */
export function userMapPinUrl(size = 28): string {
  // Simple person silhouette on soft slate disc
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill="#64748b" fill-opacity="0.92"/>
      <circle cx="16" cy="11" r="4.2" fill="#f1f5f9"/>
      <path d="M8.5 24.5c1.2-4.2 3.8-6.2 7.5-6.2s6.3 2 7.5 6.2" fill="none" stroke="#f1f5f9" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`
  );
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

export const USER_MAP_PIN_SIZE = 28;
export const USER_MAP_PIN_ANCHOR = 14;

/** Leaflet divIcon HTML */
export function userMapPinLeafletHtml(): string {
  return `<div style="width:28px;height:28px;margin-left:-14px;margin-top:-14px;position:relative">
    <div style="width:28px;height:28px;border-radius:9999px;background:#64748b;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="8" r="3.2" fill="#f1f5f9"/>
        <path d="M5.5 19c1.2-3.6 3.4-5.2 6.5-5.2s5.3 1.6 6.5 5.2" stroke="#f1f5f9" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
  </div>`;
}
