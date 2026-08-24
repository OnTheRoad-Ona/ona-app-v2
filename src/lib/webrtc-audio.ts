/**
 * Low-bandwidth in-app voice helpers (WebRTC audio only).
 * Silent adaptive Opus bitrate from WebRTC stats (+ optional Network Information API).
 */

export type NetQuality = "excellent" | "good" | "fair" | "poor" | "very_poor";

/** Target average Opus bitrate (bps) by quality */
export const BITRATE_BY_QUALITY: Record<NetQuality, number> = {
  excellent: 24_000,
  good: 18_000,
  fair: 14_000,
  poor: 12_000,
  very_poor: 9_000,
};

/** Default when quality unknown Fair */
export const DEFAULT_BITRATE_BPS = BITRATE_BY_QUALITY.fair;

/**
 * Capture: audio only, mono, 16 kHz preference, AEC/NS/AGC.
 * Never creates a video track.
 */
export async function getLowBandwidthAudioStream(): Promise<MediaStream | null> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return null;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Prefer low sample rate + mono (browser may clamp)
        sampleRate: { ideal: 16000 },
        channelCount: { ideal: 1, max: 1 },
      } as MediaTrackConstraints,
      video: false,
    });
  } catch {
    // Fallback without sampleRate (some browsers reject ideal 16k)
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
    } catch {
      return null;
    }
  }
}

/**
 * Force Opus low-bitrate / mono / FEC / DTX in SDP.
 * Applies maxaveragebitrate from `bitrateBps` (default Fair 14 kbps).
 */
export function mungeOpusSdp(
  sdp: string,
  bitrateBps: number = DEFAULT_BITRATE_BPS,
): string {
  if (!sdp) return sdp;
  const br = Math.max(8_000, Math.min(32_000, Math.round(bitrateBps)));

  let out = sdp;

  // Opus fmtp lines (various browser formats)
  out = out.replace(
    /a=fmtp:(\d+) (.*opus[^\r\n]*)/gi,
    (_m, pt: string, rest: string) => {
      let params = rest;
      // Strip existing bitrate / stereo / fec / dtx
      params = params
        .replace(/;?\s*maxaveragebitrate=\d+/gi, "")
        .replace(/;?\s*maxplaybackrate=\d+/gi, "")
        .replace(/;?\s*stereo=\d+/gi, "")
        .replace(/;?\s*sprop-stereo=\d+/gi, "")
        .replace(/;?\s*useinbandfec=\d+/gi, "")
        .replace(/;?\s*usedtx=\d+/gi, "")
        .replace(/;?\s*cbr=\d+/gi, "")
        .trim();
      if (params.endsWith(";")) params = params.slice(0, -1);
      const extra = `maxaveragebitrate=${br};maxplaybackrate=16000;stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=1;cbr=0`;
      return `a=fmtp:${pt} ${params}${params ? ";" : ""}${extra}`;
    },
  );

  // If opus rtpmap exists but no fmtp for that payload type, inject fmtp
  const opusPts: string[] = [];
  const rtpmapRe = /a=rtpmap:(\d+) opus\/\d+/gi;
  let match: RegExpExecArray | null;
  while ((match = rtpmapRe.exec(out)) !== null) {
    opusPts.push(match[1]);
  }
  for (const pt of opusPts) {
    if (!new RegExp(`a=fmtp:${pt}\\b`, "i").test(out)) {
      out = out.replace(
        new RegExp(`(a=rtpmap:${pt} opus\\/[^\\r\\n]+)`, "i"),
        `$1\r\na=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=${br};maxplaybackrate=16000`,
      );
    }
  }

  // Prefer lower bandwidth in b= lines when present under audio m-line (optional soft hint)
  out = out.replace(/b=AS:\d+/gi, `b=AS:${Math.ceil(br / 1000) + 5}`);
  out = out.replace(/b=TIAS:\d+/gi, `b=TIAS:${br + 2000}`);

  return out;
}

/** Apply max bitrate on the audio RTCRtpSender (runtime adaptation). */
export async function applyAudioSenderBitrate(
  pc: RTCPeerConnection,
  bitrateBps: number,
): Promise<void> {
  const br = Math.max(8_000, Math.min(32_000, Math.round(bitrateBps)));
  const senders = pc.getSenders().filter((s) => s.track?.kind === "audio");
  for (const sender of senders) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      for (const enc of params.encodings) {
        enc.maxBitrate = br;
        // Some browsers support priority
        try {
          (enc as RTCRtpEncodingParameters & { priority?: string }).priority =
            br <= 12_000 ? "low" : "medium";
        } catch {
          /* */
        }
      }
      await sender.setParameters(params);
    } catch {
      /* setParameters unsupported or invalid mid-negotiation */
    }
  }
}

type StatsSnapshot = {
  rttMs: number | null;
  loss: number | null; // 0-1
  jitter: number | null;
};

async function readRtcStats(pc: RTCPeerConnection): Promise<StatsSnapshot> {
  let rttMs: number | null = null;
  let loss: number | null = null;
  let jitter: number | null = null;
  try {
    const report = await pc.getStats();
    let packetsLost = 0;
    let packetsReceived = 0;
    report.forEach((stat) => {
      if (
        stat.type === "candidate-pair" &&
        (stat as { state?: string }).state === "succeeded"
      ) {
        const rtt = (stat as { currentRoundTripTime?: number })
          .currentRoundTripTime;
        if (typeof rtt === "number" && Number.isFinite(rtt)) {
          rttMs = rtt * 1000;
        }
      }
      if (
        stat.type === "remote-inbound-rtp" &&
        (stat as { kind?: string }).kind === "audio"
      ) {
        const rtt = (stat as { roundTripTime?: number }).roundTripTime;
        if (typeof rtt === "number" && Number.isFinite(rtt)) {
          rttMs = rtt * 1000;
        }
        const frac = (stat as { fractionLost?: number }).fractionLost;
        if (typeof frac === "number") loss = Math.min(1, Math.max(0, frac));
      }
      if (
        stat.type === "inbound-rtp" &&
        (stat as { kind?: string }).kind === "audio"
      ) {
        const lost = Number(
          (stat as { packetsLost?: number }).packetsLost || 0,
        );
        const recv = Number(
          (stat as { packetsReceived?: number }).packetsReceived || 0,
        );
        packetsLost += lost;
        packetsReceived += recv;
        const j = (stat as { jitter?: number }).jitter;
        if (typeof j === "number") jitter = j;
      }
    });
    if (loss == null && packetsReceived + packetsLost > 20) {
      loss = packetsLost / (packetsReceived + packetsLost);
    }
  } catch {
    /* */
  }
  return { rttMs, loss, jitter };
}

function connectionHint(): NetQuality | null {
  try {
    const nav = navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
      };
    };
    const c = nav.connection;
    if (!c) return null;
    if (c.saveData) return "poor";
    const et = (c.effectiveType || "").toLowerCase();
    if (et === "4g" && (c.downlink == null || c.downlink >= 2)) return "good";
    if (et === "4g") return "fair";
    if (et === "3g") return "poor";
    if (et === "2g" || et === "slow-2g") return "very_poor";
    if (typeof c.rtt === "number") {
      if (c.rtt > 800) return "very_poor";
      if (c.rtt > 400) return "poor";
      if (c.rtt > 200) return "fair";
    }
  } catch {
    /* */
  }
  return null;
}

/**
 * Best-effort quality: WebRTC stats primary, Network Information API soft hint.
 * Defaults to fair when unknown.
 */
export function qualityFromStats(
  stats: StatsSnapshot,
  hint: NetQuality | null,
): NetQuality {
  const { rttMs, loss, jitter } = stats;
  let score = 3; // fair baseline (1=vpoor … 5=excellent)

  if (rttMs != null) {
    if (rttMs < 80) score += 1;
    else if (rttMs < 150) score += 0.5;
    else if (rttMs < 250) score += 0;
    else if (rttMs < 400) score -= 0.5;
    else if (rttMs < 700) score -= 1;
    else score -= 1.5;
  }
  if (loss != null) {
    if (loss < 0.01) score += 0.5;
    else if (loss < 0.03) score += 0;
    else if (loss < 0.06) score -= 0.5;
    else if (loss < 0.12) score -= 1;
    else score -= 1.5;
  }
  if (jitter != null) {
    if (jitter > 0.05) score -= 0.5;
    if (jitter > 0.1) score -= 0.5;
  }

  // Soft bias from navigator.connection (never sole source)
  if (hint === "excellent" || hint === "good") score += 0.25;
  if (hint === "poor" || hint === "very_poor") score -= 0.35;

  if (score >= 4.5) return "excellent";
  if (score >= 3.6) return "good";
  if (score >= 2.6) return "fair";
  if (score >= 1.7) return "poor";
  return "very_poor";
}

export async function estimateCallBitrateBps(
  pc: RTCPeerConnection,
): Promise<number> {
  const stats = await readRtcStats(pc);
  const hint = connectionHint();
  // No stats yet → Fair default
  if (stats.rttMs == null && stats.loss == null) {
    const h = hint;
    if (h) return BITRATE_BY_QUALITY[h];
    return DEFAULT_BITRATE_BPS;
  }
  const q = qualityFromStats(stats, hint);
  return BITRATE_BY_QUALITY[q];
}

/**
 * Every `intervalMs` seconds, re-estimate quality and set sender maxBitrate.
 * Silent no UI. Returns a stop function.
 */
export function startAdaptiveBitrateLoop(
  pc: RTCPeerConnection,
  intervalMs = 3000,
): () => void {
  let stopped = false;
  let lastBr = DEFAULT_BITRATE_BPS;

  const tick = async () => {
    if (stopped) return;
    if (
      pc.connectionState === "closed" ||
      pc.connectionState === "failed" ||
      pc.iceConnectionState === "closed"
    ) {
      return;
    }
    try {
      const br = await estimateCallBitrateBps(pc);
      // Hysteresis: only change if ≥1.5 kbps difference (avoid thrash)
      if (Math.abs(br - lastBr) >= 1500) {
        lastBr = br;
        await applyAudioSenderBitrate(pc, br);
      }
    } catch {
      /* */
    }
  };

  // Initial Fair (or connection hint)
  void applyAudioSenderBitrate(pc, DEFAULT_BITRATE_BPS).then(() => tick());
  const id = window.setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    window.clearInterval(id);
  };
}

/** Munge local description SDP after createOffer/createAnswer */
export function descriptionWithMungedSdp(
  desc: RTCSessionDescriptionInit,
  bitrateBps: number = DEFAULT_BITRATE_BPS,
): RTCSessionDescriptionInit {
  if (!desc.sdp) return desc;
  return {
    type: desc.type,
    sdp: mungeOpusSdp(desc.sdp, bitrateBps),
  };
}
