/**
 * Travel integrity audit only. Never changes Call-Out Fee.
 */

export const INTEGRITY_STATUSES = [
  "NORMAL",
  "MINOR_ANOMALY",
  "SUSPICIOUS",
  "HIGH_RISK",
] as const;
export type IntegrityStatus = (typeof INTEGRITY_STATUSES)[number];

export type GpsSample = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  capturedAt: string;
  mockLocation?: boolean | null;
};

export type IntegrityInput = {
  acceptance: GpsSample;
  arrival?: GpsSample | null;
  laterSamples?: GpsSample[];
  customer: { lat: number; lng: number };
  arrivalProximityM?: number;
};

export type IntegrityResult = {
  status: IntegrityStatus;
  anomalies: string[];
};

const POOR_ACCURACY_M = 80;
const UNUSABLE_ACCURACY_M = 250;
const IMPOSSIBLE_KMH = 180;
const ARRIVAL_PROXIMITY_M = 200;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function speedKmh(a: GpsSample, b: GpsSample): number | null {
  const t0 = Date.parse(a.capturedAt);
  const t1 = Date.parse(b.capturedAt);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  const hours = (t1 - t0) / 3_600_000;
  if (hours <= 0) return null;
  return haversineMeters(a, b) / 1000 / hours;
}

export function assessTravelIntegrity(input: IntegrityInput): IntegrityResult {
  const anomalies: string[] = [];
  const acc = Number(input.acceptance.accuracyM);
  if (Number.isFinite(acc) && acc > UNUSABLE_ACCURACY_M) {
    anomalies.push("acceptance_accuracy_unusable");
  } else if (Number.isFinite(acc) && acc > POOR_ACCURACY_M) {
    anomalies.push("acceptance_accuracy_poor");
  }
  if (input.acceptance.mockLocation) anomalies.push("mock_location_flag");

  const samples = [
    input.acceptance,
    ...(input.laterSamples || []),
    ...(input.arrival ? [input.arrival] : []),
  ];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const cur = samples[i]!;
    const t0 = Date.parse(prev.capturedAt);
    const t1 = Date.parse(cur.capturedAt);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 < t0) {
      anomalies.push("timestamp_went_backwards");
    }
    const spd = speedKmh(prev, cur);
    if (spd != null && spd > IMPOSSIBLE_KMH) {
      anomalies.push("impossible_location_jump");
    }
  }

  if (input.arrival) {
    const near = input.arrivalProximityM ?? ARRIVAL_PROXIMITY_M;
    const d = haversineMeters(input.arrival, input.customer);
    if (d > near) anomalies.push("arrival_far_from_customer");
    const aAcc = Number(input.arrival.accuracyM);
    if (Number.isFinite(aAcc) && aAcc > UNUSABLE_ACCURACY_M) {
      anomalies.push("arrival_accuracy_unusable");
    }
  }

  const high = anomalies.filter((a) =>
    /impossible|mock_location|unusable/.test(a),
  );
  const suspicious = anomalies.filter((a) =>
    /jump|far_from_customer|went_backwards/.test(a),
  );
  let status: IntegrityStatus = "NORMAL";
  if (high.length >= 2) status = "HIGH_RISK";
  else if (high.length === 1 || suspicious.length >= 2) status = "SUSPICIOUS";
  else if (anomalies.length > 0) status = "MINOR_ANOMALY";
  return { status, anomalies };
}

/** GPS usable as Call-Out origin not invented, not hours-old, not junk accuracy. */
export function isUsableAcceptanceFix(input: {
  capturedAt: string;
  accuracyM?: number | null;
  nowMs?: number;
  maxAgeMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const now = input.nowMs ?? Date.now();
  const t = Date.parse(input.capturedAt);
  if (!Number.isFinite(t)) return { ok: false, reason: "missing_timestamp" };
  const maxAge = input.maxAgeMs ?? 60_000;
  if (now - t > maxAge) return { ok: false, reason: "stale_fix" };
  if (t - now > 30_000) return { ok: false, reason: "future_timestamp" };
  const acc = Number(input.accuracyM);
  if (Number.isFinite(acc) && acc > UNUSABLE_ACCURACY_M) {
    return { ok: false, reason: "accuracy_too_poor" };
  }
  return { ok: true };
}
