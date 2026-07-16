"use client";

import { OverlayViewF, OVERLAY_MOUSE_TARGET } from "@react-google-maps/api";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
import type { Technician } from "@/lib/types";

/** Same pixel size always — selected only changes orange shade (no circle plate). */
const ICON_SIZE = 24;
const BOX = 32;

/**
 * Repair Pro map pin: filled metallic-orange trade icon only (no disc).
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
  const url = tradeIconDataUrl(tech.serviceType, {
    size: ICON_SIZE,
    selected,
  });

  return (
    <OverlayViewF
      position={{ lat: tech.location.lat, lng: tech.location.lng }}
      mapPaneName={OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={(w, h) => ({
        x: -(w ?? BOX) / 2,
        y: -(h ?? BOX) / 2,
      })}
    >
      <button
        type="button"
        className="om-live-pin om-live-pin--map border-0 bg-transparent p-0"
        style={{
          width: BOX,
          height: BOX,
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
          width={ICON_SIZE}
          height={ICON_SIZE}
          alt=""
          className="om-live-glyph"
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
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
