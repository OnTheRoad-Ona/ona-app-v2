/**
 * Unique notification / message / call tones per person.
 * Pure Web Audio API — no audio files, tiny data cost.
 * Each userId hashes to a distinct pitch set + rhythm.
 */

function hashId(id: string): number {
  let h = 2166136261;
  const s = id || "guest";
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type ToneKind = "message" | "notification" | "call_ring" | "call_end" | "sent";

type ToneProfile = {
  /** Base frequency Hz */
  base: number;
  /** Second interval multiplier */
  step: number;
  /** Waveform */
  wave: OscillatorType;
  /** How many notes in the motif */
  notes: number;
};

/** Stable unique profile from any string (user id, name, etc.) */
export function toneProfileFor(id: string): ToneProfile {
  const h = hashId(id);
  const bases = [196, 220, 247, 262, 294, 330, 349, 392, 440, 494];
  const steps = [1.122, 1.26, 1.335, 1.498, 1.682]; // roughly musical
  const waves: OscillatorType[] = ["sine", "triangle", "sine", "triangle"];
  return {
    base: bases[h % bases.length],
    step: steps[(h >>> 4) % steps.length],
    wave: waves[(h >>> 8) % waves.length],
    notes: 2 + ((h >>> 12) % 3), // 2–4 notes
  };
}

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx) sharedCtx = new AC();
    if (sharedCtx.state === "suspended") {
      void sharedCtx.resume();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function beep(
  ctx: AudioContext,
  freq: number,
  start: number,
  dur: number,
  wave: OscillatorType,
  gainPeak: number
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/**
 * Play a short motif unique to `personId`.
 * kind controls pattern / intensity.
 */
export function playPersonTone(
  personId: string,
  kind: ToneKind = "message"
): void {
  const ctx = getCtx();
  if (!ctx) return;
  const p = toneProfileFor(personId);
  const t0 = ctx.currentTime + 0.01;

  if (kind === "sent") {
    beep(ctx, p.base * p.step, t0, 0.08, p.wave, 0.08);
    return;
  }

  if (kind === "call_end") {
    beep(ctx, p.base, t0, 0.12, "sine", 0.1);
    beep(ctx, p.base / p.step, t0 + 0.14, 0.18, "sine", 0.08);
    return;
  }

  if (kind === "call_ring") {
    // Longer ring motif, unique pitches
    for (let r = 0; r < 2; r++) {
      const base = t0 + r * 0.85;
      for (let i = 0; i < p.notes; i++) {
        const f = p.base * Math.pow(p.step, i % 3);
        beep(ctx, f, base + i * 0.12, 0.14, p.wave, 0.12);
      }
    }
    return;
  }

  if (kind === "notification") {
    // Attention-grabbing 3-note unique fanfare
    for (let i = 0; i < Math.min(3, p.notes + 1); i++) {
      const f = p.base * Math.pow(p.step, i);
      beep(ctx, f, t0 + i * 0.11, 0.16, p.wave, 0.14);
    }
    return;
  }

  // message (default) — short unique chirp
  for (let i = 0; i < Math.min(2, p.notes); i++) {
    const f = p.base * Math.pow(p.step, i);
    beep(ctx, f, t0 + i * 0.09, 0.11, p.wave, 0.11);
  }
}

/** Soft system blip (not person-specific) */
export function playSystemClick(): void {
  const ctx = getCtx();
  if (!ctx) return;
  beep(ctx, 880, ctx.currentTime + 0.01, 0.04, "sine", 0.05);
}

/** Unlock audio on first user gesture (iOS/Safari) */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume();
}
