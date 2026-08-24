"use client";

import { OverlayViewF, OVERLAY_MOUSE_TARGET } from "@react-google-maps/api";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
import {
  formatMoney,
  getBaseLabourPrice,
  type AppCurrency,
} from "@/lib/pricing";
import type { Technician } from "@/lib/types";

/** Same pixel size always solid Message-orange glyph only. */
const ICON_SIZE = 24;
const BOX = 32;

/**
 * Live Repair Pro map pin: solid Message-orange trade icon.
 * Name above + labour below (stacked, never overlapping).
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
  const isLive = tech.status === "available" || tech.hasLiveLocation !== false;

  const short =
    (tech.shortName || tech.name || "Pro").trim().slice(0, 12) || "Pro";
  const cur = (tech.pricingCurrency || "NGN") as AppCurrency;
  const labour = getBaseLabourPrice(tech.servicePrices, tech.serviceType);
  const priceLabel =
    labour != null && Number.isFinite(labour) ? formatMoney(labour, cur) : null;

  // Taller hit box so name (above) and price (below) never share the icon pixel
  const labelW = 88;
  const totalH = BOX + 28;

  return (
    <OverlayViewF
      position={{ lat: tech.location.lat, lng: tech.location.lng }}
      mapPaneName={OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={(w, h) => ({
        x: -(w ?? labelW) / 2,
        y: -(h ?? totalH) / 2,
      })}
    >
      <button
        type="button"
        className="om-live-pin om-live-pin--map border-0 bg-transparent p-0"
        style={{
          width: labelW,
          height: totalH,
          position: "relative",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
        title={`${tech.name} · ${tech.roleLabel} · Live${priceLabel ? ` · ${priceLabel}` : ""}`}
        aria-label={`${tech.name}, live repair pro${priceLabel ? `, labour ${priceLabel}` : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(tech.id);
        }}
      >
        {/* Name above icon */}
        <span
          className="pointer-events-none max-w-full truncate text-center text-[9px] font-bold leading-tight"
          style={{
            color: selected ? "#FF6B35" : "#ffffff",
            textShadow: "0 1px 2px rgba(0,0,0,0.85)",
            marginBottom: 2,
            maxWidth: labelW,
          }}
        >
          {short}
        </span>

        {/* Icon */}
        <span
          className="relative flex items-center justify-center"
          style={{ width: BOX, height: BOX }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            loading="lazy"
            decoding="async"
            src={url}
            width={ICON_SIZE}
            height={ICON_SIZE}
            alt=""
            className={
              isLive ? "om-live-glyph om-live-glyph--pulse" : "om-live-glyph"
            }
            style={{
              width: ICON_SIZE,
              height: ICON_SIZE,
              display: "block",
              pointerEvents: "none",
              filter: "none",
            }}
            draggable={false}
          />
        </span>

        {/* Labour below icon (₦ when set) */}
        {priceLabel ? (
          <span
            className="pointer-events-none max-w-full truncate text-center text-[9px] font-bold leading-tight tabular-nums"
            style={{
              color: "#FF6B35",
              textShadow: "0 1px 2px rgba(0,0,0,0.9)",
              marginTop: 2,
              maxWidth: labelW,
            }}
          >
            {priceLabel}
          </span>
        ) : (
          <span style={{ height: 11 }} aria-hidden />
        )}
      </button>
    </OverlayViewF>
  );
}
