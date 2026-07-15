"use client";

import { OverlayViewF, OVERLAY_MOUSE_TARGET } from "@react-google-maps/api";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
import type { Technician } from "@/lib/types";

/**
 * HTML map pin with CSS live pulse — shows Repair Pro is Live/active.
 */
export function LiveProPin({
  tech,
  selected,
  onSelect,
}: {
  tech: Technician;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const size = selected ? 24 : 20;
  const box = selected ? 36 : 32;
  const url = tradeIconDataUrl(tech.serviceType, { size, selected });

  return (
    <OverlayViewF
      position={{ lat: tech.location.lat, lng: tech.location.lng }}
      mapPaneName={OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={(w, h) => ({
        x: -(w ?? box) / 2,
        y: -(h ?? box) / 2,
      })}
    >
      <button
        type="button"
        className="om-live-pin om-live-pin--map border-0 bg-transparent p-0"
        style={{
          width: box,
          height: box,
          position: "relative",
          cursor: "pointer",
        }}
        title={`${tech.name} · ${tech.roleLabel} · Live`}
        aria-label={`${tech.name}, live repair pro`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(tech.id);
        }}
      >
        <span className="om-live-beam" aria-hidden />
        <span className="om-live-beam om-live-beam-delay" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          width={size}
          height={size}
          alt=""
          className="om-live-glyph"
          style={{
            width: size,
            height: size,
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "block",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </button>
    </OverlayViewF>
  );
}
