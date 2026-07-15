/**
 * Automated evidence verification (stubbed providers).
 * Structure matches Rekognition / AssemblyAI / Distance Matrix;
 * scores are deterministic heuristics until live keys are wired.
 */

import type { EvidenceScores, JobMedia, JobRecord } from "@/lib/jobs/types";
import { ARRIVAL_DISTANCE_METERS } from "@/lib/jobs/constants";

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
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

/** Mock photo score: presence of photos + name heuristics */
export function scorePhotos(photos: JobMedia[]): {
  score: number;
  flags: string[];
} {
  const flags: string[] = [];
  if (!photos.length) {
    flags.push("no_photos");
    return { score: 20, flags };
  }
  let score = 55;
  for (const p of photos) {
    const name = (p.name || p.url || "").toLowerCase();
    if (/\.(jpg|jpeg|png|webp)/.test(name) || p.mime?.startsWith("image/")) {
      score += 8;
    }
    if (/blur|dark|screenshot/.test(name)) {
      score -= 15;
      flags.push("low_quality_filename");
    }
    if (/car|vehicle|engine|tire|tyre|damage|hood|bumper/.test(name)) {
      score += 12;
      flags.push("vehicle_related_filename");
    }
  }
  score = Math.max(0, Math.min(100, score));
  if (score < 40) flags.push("photo_weak");
  return { score, flags };
}

const VOICE_KEYWORDS = [
  "not finished",
  "incomplete",
  "scam",
  "late",
  "arrived",
  "never came",
  "damage",
  "poor",
  "excellent",
  "done",
];

/** Mock voice: duration + keyword scan on filename/description proxy */
export function scoreVoice(
  voice: JobMedia | null | undefined,
  transcriptHint?: string
): { score: number; flags: string[]; transcript: string } {
  const flags: string[] = [];
  if (!voice) {
    flags.push("no_voice");
    return { score: 30, flags, transcript: "" };
  }
  let score = 50;
  const dur = voice.durationSec ?? 0;
  if (dur > 0 && dur < 2) {
    score -= 20;
    flags.push("voice_too_short");
  } else if (dur >= 5) {
    score += 15;
  }
  const transcript = (transcriptHint || voice.name || "").toLowerCase();
  let hits = 0;
  for (const k of VOICE_KEYWORDS) {
    if (transcript.includes(k)) hits += 1;
  }
  score += Math.min(25, hits * 8);
  if (hits) flags.push(`keyword_hits:${hits}`);
  score = Math.max(0, Math.min(100, score));
  return { score, flags, transcript };
}

export function scoreLocation(job: JobRecord): {
  score: number;
  flags: string[];
  distanceM: number | null;
} {
  const flags: string[] = [];
  if (!job.proLocation || !job.motoristLocation) {
    flags.push("missing_gps");
    return { score: 40, flags, distanceM: null };
  }
  const distanceM = haversineMeters(job.proLocation, job.motoristLocation);
  if (distanceM <= ARRIVAL_DISTANCE_METERS) {
    return { score: 95, flags: ["within_150m"], distanceM };
  }
  if (distanceM <= 500) {
    flags.push("near_but_outside_150m");
    return { score: 60, flags, distanceM };
  }
  flags.push("far_from_motorist");
  return { score: 25, flags, distanceM };
}

export function scoreTimestamps(job: JobRecord, media: JobMedia[]): {
  score: number;
  flags: string[];
} {
  const flags: string[] = [];
  if (!media.length) return { score: 50, flags: ["no_media_timestamps"] };
  const start = new Date(job.createdAt).getTime();
  const end = new Date(job.updatedAt).getTime() + 60 * 60 * 1000;
  let inWindow = 0;
  for (const m of media) {
    const t = new Date(m.createdAt).getTime();
    if (t >= start && t <= end) inWindow += 1;
    else flags.push("media_outside_job_window");
  }
  const ratio = inWindow / media.length;
  return {
    score: Math.round(ratio * 100),
    flags,
  };
}

/**
 * Weighted composite:
 * photo 0.35 + voice 0.25 + location 0.25 + timestamp 0.15
 */
export function computeEvidenceScores(
  job: JobRecord,
  extra?: { transcriptHint?: string }
): EvidenceScores {
  const media = [
    ...job.photos,
    ...(job.voiceNote ? [job.voiceNote] : []),
    ...(job.dispute?.media || []),
  ];
  const photo = scorePhotos(job.photos.concat(job.dispute?.media.filter((m) => m.kind === "photo") || []));
  const voice = scoreVoice(job.voiceNote, extra?.transcriptHint);
  const loc = scoreLocation(job);
  const ts = scoreTimestamps(job, media);

  const composite = Math.round(
    photo.score * 0.35 +
      voice.score * 0.25 +
      loc.score * 0.25 +
      ts.score * 0.15
  );

  const flags = [
    ...photo.flags,
    ...voice.flags,
    ...loc.flags,
    ...ts.flags,
  ];

  let priority: EvidenceScores["priority"] = "normal";
  if (composite >= 75) priority = "auto_priority";
  else if (composite < 40) priority = "request_more";

  return {
    photoScore: photo.score,
    voiceScore: voice.score,
    locationScore: loc.score,
    timestampScore: ts.score,
    composite,
    flags,
    priority,
    computedAt: new Date().toISOString(),
  };
}
