/**
 * Ona sounds pure Web Audio API (no audio files, zero network cost).
 * Person-specific tones for messages/calls + unique system motifs for key events.
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

export type ToneKind =
  "message" | "notification" | "call_ring" | "call_end" | "sent";

/** Distinct system events each has its own motif */
export type AppSoundKind =
  | "signup_complete"
  | "login_success"
  | "logout"
  | "request_new"
  | "request_accepted"
  | "offer_sent"
  | "price_agreed"
  | "payment_success"
  | "trip_started"
  | "arrived"
  | "job_complete"
  | "pro_live"
  | "pro_away"
  | "error"
  | "success_soft";

type ToneProfile = {
  base: number;
  step: number;
  wave: OscillatorType;
  notes: number;
};

/** Stable unique profile from any string (user id, name, etc.) */
export function toneProfileFor(id: string): ToneProfile {
  const h = hashId(id);
  const bases = [196, 220, 247, 262, 294, 330, 349, 392, 440, 494];
  const steps = [1.122, 1.26, 1.335, 1.498, 1.682];
  const waves: OscillatorType[] = ["sine", "triangle", "sine", "triangle"];
  return {
    base: bases[h % bases.length],
    step: steps[(h >>> 4) % steps.length],
    wave: waves[(h >>> 8) % waves.length],
    notes: 2 + ((h >>> 12) % 3),
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
  gainPeak: number,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainPeak), start + 0.02);
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
  kind: ToneKind = "message",
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
    for (let i = 0; i < Math.min(3, p.notes + 1); i++) {
      const f = p.base * Math.pow(p.step, i);
      beep(ctx, f, t0 + i * 0.11, 0.16, p.wave, 0.14);
    }
    return;
  }

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

/**
 * Strategic app event sounds each kind is a distinct, memorable motif.
 * Safe no-op when audio is blocked until user gesture (call unlockAudio first).
 */
export function playAppSound(kind: AppSoundKind): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.015;

  switch (kind) {
    case "signup_complete":
      // Bright rising fanfare C-E-G-C
      beep(ctx, 523.25, t0, 0.12, "triangle", 0.14);
      beep(ctx, 659.25, t0 + 0.12, 0.12, "triangle", 0.14);
      beep(ctx, 783.99, t0 + 0.24, 0.14, "triangle", 0.15);
      beep(ctx, 1046.5, t0 + 0.4, 0.22, "sine", 0.12);
      return;

    case "login_success":
      // Warm two-note welcome
      beep(ctx, 392, t0, 0.1, "sine", 0.12);
      beep(ctx, 523.25, t0 + 0.11, 0.16, "sine", 0.13);
      return;

    case "logout":
      // Soft descending exit
      beep(ctx, 440, t0, 0.1, "sine", 0.09);
      beep(ctx, 330, t0 + 0.12, 0.14, "sine", 0.07);
      return;

    case "request_new":
      // Urgent double-pulse for new motorist request
      beep(ctx, 880, t0, 0.09, "square", 0.1);
      beep(ctx, 880, t0 + 0.14, 0.09, "square", 0.1);
      beep(ctx, 1174.7, t0 + 0.28, 0.14, "triangle", 0.12);
      return;

    case "request_accepted":
      // Confident accept: low → high settle
      beep(ctx, 349.23, t0, 0.1, "triangle", 0.13);
      beep(ctx, 523.25, t0 + 0.12, 0.12, "triangle", 0.14);
      beep(ctx, 698.46, t0 + 0.26, 0.18, "sine", 0.12);
      return;

    case "offer_sent":
      // Short send chirp
      beep(ctx, 660, t0, 0.07, "sine", 0.1);
      beep(ctx, 880, t0 + 0.08, 0.09, "sine", 0.09);
      return;

    case "price_agreed":
      // Handshake chord (two tones close together)
      beep(ctx, 523.25, t0, 0.18, "sine", 0.11);
      beep(ctx, 659.25, t0, 0.2, "sine", 0.1);
      beep(ctx, 783.99, t0 + 0.18, 0.16, "triangle", 0.11);
      return;

    case "payment_success":
      // Cash register-ish rising arpeggio
      beep(ctx, 523.25, t0, 0.08, "triangle", 0.12);
      beep(ctx, 659.25, t0 + 0.09, 0.08, "triangle", 0.12);
      beep(ctx, 783.99, t0 + 0.18, 0.08, "triangle", 0.12);
      beep(ctx, 1046.5, t0 + 0.28, 0.2, "sine", 0.13);
      return;

    case "trip_started":
      // Engine-like low thump + lift
      beep(ctx, 196, t0, 0.14, "triangle", 0.12);
      beep(ctx, 294, t0 + 0.14, 0.12, "sine", 0.11);
      beep(ctx, 392, t0 + 0.28, 0.16, "sine", 0.1);
      return;

    case "arrived":
      // Destination ding-ding
      beep(ctx, 784, t0, 0.12, "sine", 0.13);
      beep(ctx, 1047, t0 + 0.16, 0.2, "sine", 0.12);
      return;

    case "job_complete":
      // Full success flourish
      beep(ctx, 392, t0, 0.1, "triangle", 0.12);
      beep(ctx, 523.25, t0 + 0.1, 0.1, "triangle", 0.12);
      beep(ctx, 659.25, t0 + 0.2, 0.1, "triangle", 0.13);
      beep(ctx, 784, t0 + 0.32, 0.22, "sine", 0.14);
      return;

    case "pro_live":
      // Go Live pulse
      beep(ctx, 523.25, t0, 0.08, "sine", 0.11);
      beep(ctx, 784, t0 + 0.1, 0.14, "sine", 0.12);
      return;

    case "pro_away":
      // Soft mute
      beep(ctx, 440, t0, 0.1, "sine", 0.08);
      beep(ctx, 330, t0 + 0.12, 0.12, "sine", 0.06);
      return;

    case "error":
      // Low buzzer
      beep(ctx, 220, t0, 0.12, "square", 0.08);
      beep(ctx, 185, t0 + 0.14, 0.16, "square", 0.07);
      return;

    case "success_soft":
      // Gentle single-pair success
      beep(ctx, 523.25, t0, 0.09, "sine", 0.1);
      beep(ctx, 659.25, t0 + 0.1, 0.12, "sine", 0.1);
      return;

    default:
      playSystemClick();
  }
}

/** Unlock audio on first user gesture (iOS/Safari) */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume();
}

/** Call once from app shell so later sounds work on iOS */
export function installAudioUnlockOnce(): void {
  if (typeof window === "undefined") return;
  const key = "__om_audio_unlock";
  if ((window as unknown as Record<string, boolean>)[key]) return;
  (window as unknown as Record<string, boolean>)[key] = true;
  const once = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
    window.removeEventListener("touchstart", once);
  };
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once);
  window.addEventListener("touchstart", once, { passive: true });
}
