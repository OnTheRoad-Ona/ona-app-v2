import {
  AUTO_NIGHT_END_HOUR,
  AUTO_NIGHT_START_HOUR,
  AUTO_REMOTE_BAND_MAX_KM,
  AUTO_REMOTE_BAND_MIN_KM,
} from "@/lib/callout/constants";

export const CALLOUT_URGENCY_KINDS = [
  "normal",
  "emergency",
  "remote",
  "night",
] as const;

export type CalloutUrgencyKind = (typeof CALLOUT_URGENCY_KINDS)[number];

export const CALLOUT_URGENCY_OPTIONS: {
  id: CalloutUrgencyKind;
  label: string;
  multiplier: number;
}[] = [
  { id: "normal", label: "Normal", multiplier: 1 },
  { id: "emergency", label: "Emergency", multiplier: 1.25 },
  { id: "remote", label: "Remote", multiplier: 1.35 },
  { id: "night", label: "Night", multiplier: 1.5 },
];

export function isCalloutUrgencyKind(v: string): v is CalloutUrgencyKind {
  return (CALLOUT_URGENCY_KINDS as readonly string[]).includes(v);
}

export function calloutUrgencyMultiplier(
  kind?: CalloutUrgencyKind | string | null
): number {
  const hit = CALLOUT_URGENCY_OPTIONS.find((o) => o.id === kind);
  return hit?.multiplier ?? 1;
}

/**
 * Auto-select the urgency chip so the customer doesn't have to choose it.
 * Matches the engine's auto bands: Night (9pm–5am Lagos) and Remote
 * (4.95–5 km) win over a diagnosis Emergency; otherwise Normal.
 */
export function autoCalloutUrgency(input: {
  /** Diagnosis says it's not safe to drive / use. */
  unsafe?: boolean;
  /** Distance to the nearest matched pro (km). */
  distanceKm?: number | null;
  /** Clock for the Night band (defaults to now, Lagos time). */
  now?: Date;
}): CalloutUrgencyKind {
  const d = input.now ?? new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Lagos",
    }).format(d)
  );
  const night =
    hour >= AUTO_NIGHT_START_HOUR || hour < AUTO_NIGHT_END_HOUR;
  if (night) return "night";
  if (input.unsafe) return "emergency";
  const km = input.distanceKm;
  if (
    km != null &&
    Number.isFinite(km) &&
    km >= AUTO_REMOTE_BAND_MIN_KM &&
    km <= AUTO_REMOTE_BAND_MAX_KM + 1e-9
  ) {
    return "remote";
  }
  return "normal";
}
