import type { ProService } from "@/lib/types";

/**
 * Filled metallic orange — readable on green/red map stages.
 * Bright face + deep rim so pins never blend into the basemap.
 */
const ORANGE_FACE = "#f06a1e";
const ORANGE_MID = "#e85a12";
const ORANGE_DEEP = "#b8430c";
const ORANGE_RIM = "#7c2d0a";
const ORANGE_SELECTED_FACE = "#ff8a3d";
const ORANGE_SELECTED_MID = "#ff6b1a";
const ORANGE_SELECTED_DEEP = "#d14f0e";
const ORANGE_SELECTED_RIM = "#9a3412";
const GLYPH = "#ffffff";

/**
 * Compact Lucide-style paths (24 viewBox).
 * White filled glyphs on a metallic orange disc.
 */
function tradeGlyph(type: ProService): string {
  const s = `fill="none" stroke="${GLYPH}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"`;
  switch (type) {
    case "mechanic":
      return `<path ${s} d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.2 6.2a1.8 1.8 0 0 1-2.5-2.5l6.2-6.2a5 5 0 0 1 6.6-6.6l-3 3z"/>`;
    case "vulcanizer":
      return `<circle ${s} cx="12" cy="12" r="7.2"/><circle ${s} cx="12" cy="12" r="2.4"/>`;
    case "towing":
      return `<path ${s} d="M5 17h-1a1 1 0 0 1-1-1v-3.2c0-.5.2-1 .6-1.3L6 9.5h7.2c.4 0 .8.2 1 .5L16 12h2.5c.8 0 1.5.7 1.5 1.5V16a1 1 0 0 1-1 1h-1"/><circle ${s} cx="7.5" cy="17" r="1.8"/><circle ${s} cx="16.5" cy="17" r="1.8"/><path ${s} d="M5 17h9"/>`;
    case "battery":
      return `<rect ${s} x="3" y="7.5" width="15" height="9" rx="1.5"/><path ${s} d="M20 10.5v3M7 11v2M11 11v2"/>`;
    case "ac":
      return `<path ${s} d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/><circle ${s} cx="12" cy="12" r="2.2"/>`;
    case "body":
      return `<path ${s} d="m14.5 5.5 4 4-8.5 8.5H6v-4zM13 7l4 4"/>`;
    case "electrical":
      return `<path ${s} d="M9 3v5M15 3v5M8 8h8v3.5a4 4 0 0 1-8 0V8zM12 15.5V21"/>`;
    case "diagnostics":
      return `<rect ${s} x="5" y="5" width="14" height="14" rx="1.5"/><rect ${s} x="9" y="9" width="6" height="6" rx="0.5"/><path ${s} d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>`;
    case "wash":
      return `<path ${s} d="M8 14.5c1.7 0 3-1.4 3-3.1 0-2.2-3-5.4-3-5.4s-3 3.2-3 5.4c0 1.7 1.3 3.1 3 3.1z"/><path ${s} d="M15.5 18c1.4 0 2.5-1.1 2.5-2.5 0-1.8-2.5-4.5-2.5-4.5s-2.5 2.7-2.5 4.5c0 1.4 1.1 2.5 2.5 2.5z"/>`;
    default:
      return `<path ${s} d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.2 6.2a1.8 1.8 0 0 1-2.5-2.5l6.2-6.2a5 5 0 0 1 6.6-6.6l-3 3z"/>`;
  }
}

/**
 * Filled metallic-orange trade pin (disc + white glyph).
 * Selected = brighter face so it pops next to other pros.
 */
export function tradeIconDataUrl(
  type: ProService | string,
  opts?: { size?: number; selected?: boolean }
): string {
  const size = opts?.size ?? 20;
  const selected = opts?.selected ?? false;
  const face = selected ? ORANGE_SELECTED_FACE : ORANGE_FACE;
  const mid = selected ? ORANGE_SELECTED_MID : ORANGE_MID;
  const deep = selected ? ORANGE_SELECTED_DEEP : ORANGE_DEEP;
  const rim = selected ? ORANGE_SELECTED_RIM : ORANGE_RIM;
  const svc = (type || "mechanic") as ProService;
  const glyph = tradeGlyph(svc);
  const gid = selected ? "omMetalSel" : "omMetal";

  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
      <defs>
        <radialGradient id="${gid}" cx="32%" cy="28%" r="78%">
          <stop offset="0%" stop-color="${face}"/>
          <stop offset="48%" stop-color="${mid}"/>
          <stop offset="100%" stop-color="${deep}"/>
        </radialGradient>
        <filter id="${gid}s" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-color="${rim}" flood-opacity="0.55"/>
        </filter>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill="url(#${gid})" stroke="${rim}" stroke-width="1.35" filter="url(#${gid}s)"/>
      <circle cx="12" cy="12" r="10.4" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
      <g transform="translate(12 12) scale(0.72) translate(-12 -12)">
        ${glyph}
      </g>
    </svg>`
  );
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

/**
 * Leaflet marker HTML: filled metallic-orange trade pin + live beam.
 */
export function tradeIconHtml(
  type: ProService | string,
  opts?: { size?: number; selected?: boolean }
): string {
  const size = opts?.size ?? 20;
  const selected = opts?.selected ?? false;
  const url = tradeIconDataUrl(type, { size, selected });
  const pulse = selected ? 28 : 26;
  return `<div class="om-live-pin" style="width:${pulse}px;height:${pulse}px;position:relative;background:transparent;border:none">
    <span class="om-live-beam om-live-beam--orange" aria-hidden="true"></span>
    <span class="om-live-beam om-live-beam-delay om-live-beam--orange" aria-hidden="true"></span>
    <img src="${url}" width="${size}" height="${size}" alt="" class="om-live-glyph" style="width:${size}px;height:${size}px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:transparent;border:none;display:block;filter:drop-shadow(0 1px 2px rgba(124,45,10,0.45))" draggable="false"/>
  </div>`;
}
