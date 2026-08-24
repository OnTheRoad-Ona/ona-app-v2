/**
 * Side-menu icons solid #FF6B35 shapes, no border (Dashboard style).
 * Uses inline style so no global CSS can force hollow outlines.
 */

import type { CSSProperties, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type MenuIconName =
  | "dashboard"
  | "history"
  | "profile"
  | "referral"
  | "settings"
  | "jobs"
  | "payments"
  | "notifications"
  | "service";

type Props = SVGProps<SVGSVGElement> & {
  name: MenuIconName;
};

const ORANGE = "#FF6B35";

const solidStyle: CSSProperties = {
  fill: ORANGE,
  stroke: "none",
  strokeWidth: 0,
};

export function MenuIcon({ name, className, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
      className={cn("om-menu-icon", className)}
      style={{ overflow: "visible", display: "block" }}
      {...rest}
    >
      {name === "dashboard" && (
        <>
          <rect style={solidStyle} width="7" height="9" x="3" y="3" rx="1" />
          <rect style={solidStyle} width="7" height="5" x="14" y="3" rx="1" />
          <rect style={solidStyle} width="7" height="9" x="14" y="12" rx="1" />
          <rect style={solidStyle} width="7" height="5" x="3" y="16" rx="1" />
        </>
      )}
      {name === "history" && (
        <>
          <rect style={solidStyle} width="14" height="16" x="5" y="5" rx="2" />
          <rect style={solidStyle} width="8" height="4" x="8" y="2" rx="1" />
        </>
      )}
      {name === "profile" && (
        <>
          <circle style={solidStyle} cx="12" cy="8" r="4" />
          <path
            style={solidStyle}
            d="M5 20.5c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"
          />
        </>
      )}
      {name === "referral" && (
        <rect style={solidStyle} width="20" height="12" x="2" y="6" rx="2" />
      )}
      {name === "settings" && (
        <>
          <circle style={solidStyle} cx="17" cy="17" r="3.25" />
          <circle style={solidStyle} cx="7" cy="7" r="3.25" />
          <rect
            style={solidStyle}
            x="4"
            y="15.5"
            width="8"
            height="3"
            rx="1.5"
          />
          <rect
            style={solidStyle}
            x="12"
            y="5.5"
            width="8"
            height="3"
            rx="1.5"
          />
        </>
      )}
      {name === "jobs" && (
        <>
          <rect style={solidStyle} x="3" y="4" width="6" height="6" rx="1" />
          <rect style={solidStyle} x="3" y="14" width="6" height="6" rx="1" />
          <rect style={solidStyle} x="12" y="5" width="9" height="3" rx="1.5" />
          <rect
            style={solidStyle}
            x="12"
            y="15.5"
            width="9"
            height="3"
            rx="1.5"
          />
        </>
      )}
      {name === "payments" && (
        <circle style={solidStyle} cx="12" cy="12" r="9" />
      )}
      {name === "notifications" && (
        <>
          <path
            style={solidStyle}
            d="M6 17h12l-1.2-1.5C15.5 14 14.5 12.2 14.5 9.5a2.5 2.5 0 0 0-5 0c0 2.7-1 4.5-2.3 6L6 17z"
          />
          <path style={solidStyle} d="M10 19a2 2 0 0 0 4 0" />
          <circle style={solidStyle} cx="17.5" cy="5.5" r="2.5" />
        </>
      )}
      {name === "service" && (
        <>
          <rect style={solidStyle} width="20" height="14" x="2" y="6" rx="2" />
          <path
            style={solidStyle}
            d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"
          />
        </>
      )}
    </svg>
  );
}
