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
