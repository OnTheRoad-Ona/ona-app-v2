import type { ProService } from "@/lib/types";

/**
 * Metallic orange on the glyph itself — no disc / circle plate.
 * Selected = same size, brighter shade only.
 */
const ORANGE = "#e85a12";
const ORANGE_DEEP = "#9a3412";
const ORANGE_SEL = "#ff7a2e";
const ORANGE_SEL_DEEP = "#c2410c";

/**
 * Lucide-style trade paths filled/stroked in metallic orange (24 viewBox).
 * No background circle.
 */
function tradeGlyph(type: ProService, fill: string, rim: string): string {
  // Closed shapes: solid orange fill + deep rim. Open strokes: thick orange stroke.
  const filled = `fill="${fill}" stroke="${rim}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"`;
  const stroked = `fill="none" stroke="${fill}" stroke-width="2.65" stroke-linecap="round" stroke-linejoin="round"`;
  const dual = `fill="${fill}" stroke="${rim}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"`;

  switch (type) {
    case "mechanic":
      // Wrench — solid filled body
      return `<path ${filled} d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.2 6.2a1.8 1.8 0 0 1-2.5-2.5l6.2-6.2a5 5 0 0 1 6.6-6.6l-3 3z"/>`;
    case "vulcanizer":
      // Tire: orange ring (no solid disc plate)
      return `<circle ${stroked} cx="12" cy="12" r="7.5" stroke-width="2.6"/><circle ${stroked} cx="12" cy="12" r="2.6" stroke-width="2.2"/>`;
    case "towing":
      return `<path ${stroked} d="M5 17h-1a1 1 0 0 1-1-1v-3.2c0-.5.2-1 .6-1.3L6 9.5h7.2c.4 0 .8.2 1 .5L16 12h2.5c.8 0 1.5.7 1.5 1.5V16a1 1 0 0 1-1 1h-1"/><circle ${dual} cx="7.5" cy="17" r="1.9"/><circle ${dual} cx="16.5" cy="17" r="1.9"/><path ${stroked} d="M5 17h9"/>`;
    case "battery":
      return `<rect ${dual} x="3" y="7.5" width="15" height="9" rx="1.5"/><path ${stroked} d="M20 10.5v3M7 11v2M11 11v2"/>`;
    case "ac":
      return `<path ${stroked} d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/><circle ${dual} cx="12" cy="12" r="2.2"/>`;
    case "body":
      return `<path ${filled} d="m14.5 5.5 4 4-8.5 8.5H6v-4z"/><path ${stroked} d="M13 7l4 4"/>`;
    case "electrical":
      return `<path ${stroked} d="M9 3v5M15 3v5M8 8h8v3.5a4 4 0 0 1-8 0V8zM12 15.5V21"/>`;
    case "diagnostics":
      return `<rect ${dual} x="5" y="5" width="14" height="14" rx="1.5"/><rect ${dual} x="9" y="9" width="6" height="6" rx="0.5"/><path ${stroked} d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>`;
    case "wash":
      return `<path ${filled} d="M8 14.5c1.7 0 3-1.4 3-3.1 0-2.2-3-5.4-3-5.4s-3 3.2-3 5.4c0 1.7 1.3 3.1 3 3.1z"/><path ${filled} d="M15.5 18c1.4 0 2.5-1.1 2.5-2.5 0-1.8-2.5-4.5-2.5-4.5s-2.5 2.7-2.5 4.5c0 1.4 1.1 2.5 2.5 2.5z"/>`;
    default:
      return `<path ${filled} d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.2 6.2a1.8 1.8 0 0 1-2.5-2.5l6.2-6.2a5 5 0 0 1 6.6-6.6l-3 3z"/>`;
  }
}

/**
 * Trade icon = orange filled/stroked glyph only (no circle plate).
 * Selected uses a brighter orange — same size.
 */
export function tradeIconDataUrl(
  type: ProService | string,
  opts?: { size?: number; selected?: boolean; flat?: boolean }
): string {
  const size = opts?.size ?? 22;
  const selected = opts?.selected ?? false;
  const flat = opts?.flat === true;
  const fill = selected ? ORANGE_SEL : ORANGE;
  const rim = selected ? ORANGE_SEL_DEEP : ORANGE_DEEP;
  const svc = (type || "mechanic") as ProService;
  const body = tradeGlyph(svc, fill, rim);
  const gid = selected ? "omGSel" : "omG";

  // flat: no drop-shadow / glow (trip map spanner)
  const svg = encodeURIComponent(
    flat
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">${body}</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
      <defs>
        <filter id="${gid}" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.05" flood-color="${rim}" flood-opacity="0.5"/>
        </filter>
      </defs>
      <g filter="url(#${gid})">
        ${body}
      </g>
    </svg>`
  );
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

/**
 * Leaflet marker HTML: orange trade glyph only + live beam (no disc).
 */
export function tradeIconHtml(
  type: ProService | string,
  opts?: { size?: number; selected?: boolean }
): string {
  // Same size selected or not — shade only
  const size = opts?.size ?? 22;
  const selected = opts?.selected ?? false;
  const url = tradeIconDataUrl(type, { size, selected });
  const pulse = 28;
  return `<div class="om-live-pin" style="width:${pulse}px;height:${pulse}px;position:relative;background:transparent;border:none">
    <span class="om-live-beam om-live-beam--orange" aria-hidden="true"></span>
    <span class="om-live-beam om-live-beam-delay om-live-beam--orange" aria-hidden="true"></span>
    <img src="${url}" width="${size}" height="${size}" alt="" class="om-live-glyph" style="width:${size}px;height:${size}px;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:transparent;border:none;display:block;filter:drop-shadow(0 1px 2px rgba(124,45,10,0.4))" draggable="false"/>
  </div>`;
}
