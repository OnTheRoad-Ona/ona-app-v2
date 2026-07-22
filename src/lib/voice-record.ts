/**
 * Low-latency browser voice capture helpers (MediaRecorder).
 * Shared by request VoiceNoteRecorder and chat mic.
 */

export const VOICE_MAX_SEC = 60;

export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

/** Prefer mono + AEC; keep constraints light so start is fast. */
export async function getMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("no_media");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch {
    // Fallback for browsers that reject advanced constraints
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

export function createMediaRecorder(stream: MediaStream): MediaRecorder {
  const mime = pickAudioMime();
  const opts: MediaRecorderOptions = {};
  if (mime) opts.mimeType = mime;
  // Lower bitrate → less encode work + smaller blobs (faster stop/save)
  opts.audioBitsPerSecond = 48_000;
  try {
    return mime
      ? new MediaRecorder(stream, opts)
      : new MediaRecorder(stream, { audioBitsPerSecond: 48_000 });
  } catch {
    return mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export function extForMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
    return "m4a";
  }
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Wait until MediaRecorder actually starts (or short timeout).
 * Avoids counting lag before the encoder is live.
 */
export function waitRecorderStart(
  rec: MediaRecorder,
  timeoutMs = 800
): Promise<void> {
  if (rec.state === "recording") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      rec.removeEventListener("start", onStart);
      window.clearTimeout(t);
      resolve();
    };
    const onStart = () => done();
    rec.addEventListener("start", onStart);
    const t = window.setTimeout(done, timeoutMs);
  });
}
