import type { ProService } from "@/lib/types";

/**
 * Map Repair Pro trade icons — same solid orange as the Message button.
 * Clean glyph only: no dual-tone rim, glow, drop-shadow, or disc plate.
 */
export const MESSAGE_ORANGE = "#FF6B35";

/**
 * Lucide-style trade paths in solid Message orange (24 viewBox).
 * No background circle.
 */
function tradeGlyph(type: ProService, color: string): string {
  const filled = `fill="${color}" stroke="none"`;
  const stroked = `fill="none" stroke="${color}" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"`;
  const dual = `fill="${color}" stroke="${color}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"`;

  switch (type) {
    case "mechanic":
      // Wrench / spanner
      return `<path ${filled} d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.2 6.2a1.8 1.8 0 0 1-2.5-2.5l6.2-6.2a5 5 0 0 1 6.6-6.6l-3 3z"/>`;
    case "vulcanizer":
      // Tire ring
      return `<circle ${stroked} cx="12" cy="12" r="7.5"/><circle ${stroked} cx="12" cy="12" r="2.6" stroke-width="2"/>`;
    case "towing":
      return `<path ${stroked} d="M5 17h-1a1 1 0 0 1-1-1v-3.2c0-.5.2-1 .6-1.3L6 9.5h7.2c.4 0 .8.2 1 .5L16 12h2.5c.8 0 1.5.7 1.5 1.5V16a1 1 0 0 1-1 1h-1"/><circle ${dual} cx="7.5" cy="17" r="1.9"/><circle ${dual} cx="16.5" cy="17" r="1.9"/><path ${stroked} d="M5 17h9"/>`;
    case "battery":
      // Car battery block with top posts (+ / −) — not phone battery
      return `<rect ${stroked} x="3" y="8" width="18" height="12" rx="1.5"/><path ${stroked} d="M6 8V5.5A1.5 1.5 0 0 1 7.5 4h1A1.5 1.5 0 0 1 10 5.5V8M14 8V5.5A1.5 1.5 0 0 1 15.5 4h1A1.5 1.5 0 0 1 18 5.5V8"/><path ${stroked} d="M7 13h2.5M8.25 11.75v2.5M14.5 13h2.5"/>`;
    case "ac":
      return `<path ${stroked} d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/><circle ${dual} cx="12" cy="12" r="2.2"/>`;
    case "body":
      return `<path ${filled} d="m14.5 5.5 4 4-8.5 8.5H6v-4z"/><path ${stroked} d="M13 7l4 4"/>`;
    case "electrical":
      return `<path ${stroked} d="M9 3v5M15 3v5M8 8h8v3.5a4 4 0 0 1-8 0V8zM12 15.5V21"/>`;
    case "diagnostics":
      return `<rect ${dual} x="5" y="5" width="14" height="14" rx="1.5"/><rect ${dual} x="9" y="9" width="6" height="6" rx="0.5"/><path ${stroked} d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>`;
    case "fashion":
      return `<path ${stroked} d="M4 20 14.5 9.5M8 16l5-5"/><path ${stroked} d="M20 4 8 16a3 3 0 0 1-4.2 0"/>`;
    case "plumber":
      return `<path ${stroked} d="M12 3v4M8 7h8"/><path ${stroked} d="M9 11v7a3 3 0 0 0 6 0v-7"/><path ${stroked} d="M9 14h6"/>`;
    case "carpenter":
      return `<path ${stroked} d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path ${stroked} d="M17.64 15 22 10.64"/><path ${stroked} d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>`;
    case "painter":
      return `<path ${stroked} d="M18 4v4M18 12v8"/><rect ${stroked} x="4" y="4" width="10" height="8" rx="1"/><path ${stroked} d="M8 12v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-1"/>`;
    case "solar":
      return `<circle ${stroked} cx="12" cy="12" r="4"/><path ${stroked} d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`;
    case "generator":
      return `<path ${stroked} d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>`;
    default:
      return `<path ${filled} d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.2 6.2a1.8 1.8 0 0 1-2.5-2.5l6.2-6.2a5 5 0 0 1 6.6-6.6l-3 3z"/>`;
  }
}

/**
 * Trade icon = solid Message-orange glyph only (no plate, no glow).
 * `selected` / `flat` kept for call-site compatibility; color is always Message orange.
 */
export function tradeIconDataUrl(
  type: ProService | string,
  opts?: { size?: number; selected?: boolean; flat?: boolean }
): string {
  const size = opts?.size ?? 22;
  const svc = (type || "mechanic") as ProService;
  const body = tradeGlyph(svc, MESSAGE_ORANGE);

  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">${body}</svg>`
  );
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

/**
 * Leaflet marker HTML: solid Message-orange trade glyph.
 * When `live` (default true for discovery map), glyph gently pulses.
 */
export function tradeIconHtml(
  type: ProService | string,
  opts?: { size?: number; selected?: boolean; live?: boolean }
): string {
  const size = opts?.size ?? 22;
  const live = opts?.live !== false;
  const url = tradeIconDataUrl(type, { size, selected: opts?.selected });
  const box = Math.max(size + 4, 28);
  const pulseClass = live ? "om-live-glyph om-live-glyph--pulse" : "om-live-glyph";
  return `<div class="om-live-pin" style="width:${box}px;height:${box}px;position:relative;background:transparent;border:none">
    <span style="position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center">
      <img loading="lazy" decoding="async" src="${url}" width="${size}" height="${size}" alt="" class="${pulseClass}" style="width:${size}px;height:${size}px;background:transparent;border:none;display:block;filter:none" draggable="false"/>
    </span>
  </div>`;
}
