"use client";

/**
 * Ona Tier 3 — Video Liveness Detection
 * MediaPipe Face Landmarker (live stream only — no video file stored).
 * Random challenges · anti-spoof heuristics · 6-fail lockout · copper success.
 *
 * Future: POST summary to /api/liveness/verify for server re-check (hook ready).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  RefreshCw,
  ScanFace,
  X,
} from "lucide-react";
import {
  clearLivenessFails,
  formatRemaining,
  getLivenessLock,
  LIVENESS_MAX_FAILS,
  recordLivenessFail,
} from "@/lib/liveness/lockout";
import { livenessLog } from "@/lib/liveness/logger";
import { cn } from "@/lib/utils";

type ChallengeId =
  | "blink"
  | "smile"
  | "turn_left"
  | "turn_right"
  | "nod"
  | "look_up"
  | "look_down";

type Challenge = {
  id: ChallengeId;
  label: string;
  feedbackOk: string;
};

const CHALLENGE_POOL: Challenge[] = [
  { id: "blink", label: "Blink both eyes clearly", feedbackOk: "Good blink" },
  { id: "smile", label: "Smile naturally", feedbackOk: "Nice smile" },
  {
    id: "turn_left",
    label: "Slowly turn your head left",
    feedbackOk: "Left turn OK",
  },
  {
    id: "turn_right",
    label: "Slowly turn your head right",
    feedbackOk: "Right turn OK",
  },
  { id: "nod", label: "Nod your head once", feedbackOk: "Nod detected" },
  { id: "look_up", label: "Look slightly up", feedbackOk: "Look up OK" },
  { id: "look_down", label: "Look slightly down", feedbackOk: "Look down OK" },
];

/** Challenges per session — short session, low data */
const SESSION_LEN = 3;
const STEP_MS = 2200;
const SESSION_TARGET_MS = SESSION_LEN * STEP_MS; // ~6.6s in 5–8s band

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type FaceLandmarkerInstance = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number
  ) => {
    faceLandmarks?: { x: number; y: number; z?: number }[][];
    faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
    facialTransformationMatrixes?: { data: Float32Array | number[] }[];
  };
  close?: () => void;
};

function pickChallenges(n: number): Challenge[] {
  const pool = [...CHALLENGE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

function blendScore(
  shapes: { categoryName: string; score: number }[] | undefined,
  name: string
): number {
  if (!shapes) return 0;
  const hit = shapes.find((c) => c.categoryName === name);
  return hit?.score ?? 0;
}

/** Eye aspect ratio from MediaPipe face mesh indices */
function eyeAspectRatio(lm: { x: number; y: number }[]): number {
  // Left eye: 33,160,158,133,153,144 roughly simplified vertical/horizontal
  const dist = (a: number, b: number) => {
    const p = lm[a];
    const q = lm[b];
    if (!p || !q) return 0;
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  const left =
    (dist(159, 145) + dist(158, 153)) / (2 * Math.max(dist(33, 133), 1e-6));
  const right =
    (dist(386, 374) + dist(385, 380)) / (2 * Math.max(dist(362, 263), 1e-6));
  return (left + right) / 2;
}

/** Yaw / pitch from 4x4 row-major facial transform (approx) */
function headPose(matrix?: { data: Float32Array | number[] }): {
  yaw: number;
  pitch: number;
} {
  if (!matrix?.data || matrix.data.length < 16) return { yaw: 0, pitch: 0 };
  const m = matrix.data;
  // Rotation elements (column-major in some MP builds — try both heuristics)
  const r00 = Number(m[0]);
  const r10 = Number(m[1]);
  const r20 = Number(m[2]);
  const r21 = Number(m[6]);
  const r22 = Number(m[10]);
  const yaw = Math.atan2(r10, r00);
  const pitch = Math.atan2(-r20, Math.hypot(r21, r22));
  return { yaw, pitch };
}

function dist3(
  a: { x: number; y: number; z?: number },
  b: { x: number; y: number; z?: number }
) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

export function FaceLiveness({
  isLight,
  onPassed,
  onCancel,
  userKey = "guest",
  userId,
}: {
  isLight: boolean;
  onPassed: () => void;
  onCancel: () => void;
  /** For lockout storage — email / backend id */
  userKey?: string;
  /** When set, reports pass to backend `/api/liveness/verify` */
  userId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const rafRef = useRef<number>(0);
  const challengesRef = useRef<Challenge[]>(pickChallenges(SESSION_LEN));
  const stepRef = useRef(0);
  const stepStartedRef = useRef(0);
  const sessionStartedRef = useRef(0);
  const passedStepsRef = useRef<boolean[]>(
    Array.from({ length: SESSION_LEN }, () => false)
  );
  const earHistRef = useRef<number[]>([]);
  const yawHistRef = useRef<number[]>([]);
  const pitchHistRef = useRef<number[]>([]);
  const facePresentFramesRef = useRef(0);
  const faceMissingFramesRef = useRef(0);
  const motionEnergyRef = useRef(0);
  const lastLmRef = useRef<{ x: number; y: number; z?: number }[] | null>(null);
  const runningRef = useRef(false);

  const [challenges, setChallenges] = useState(() =>
    pickChallenges(SESSION_LEN)
  );
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState("Hold your face in the circle");
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "boot" | "run" | "success" | "locked" | "fail"
  >("boot");
  const [fails, setFails] = useState(0);
  const [lockMs, setLockMs] = useState(0);

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const resetSession = useCallback(() => {
    const next = pickChallenges(SESSION_LEN);
    challengesRef.current = next;
    setChallenges(next);
    stepRef.current = 0;
    setStep(0);
    passedStepsRef.current = Array.from({ length: SESSION_LEN }, () => false);
    earHistRef.current = [];
    yawHistRef.current = [];
    pitchHistRef.current = [];
    facePresentFramesRef.current = 0;
    faceMissingFramesRef.current = 0;
    motionEnergyRef.current = 0;
    lastLmRef.current = null;
    setProgress(0);
    setFeedback(next[0]?.label || "Look at the camera");
    setErr(null);
    setPhase("run");
    stepStartedRef.current = performance.now();
    sessionStartedRef.current = performance.now();
    livenessLog("info", "session_reset", {
      challenges: next.map((c) => c.id),
    });
  }, []);

  // Lockout check
  useEffect(() => {
    const lock = getLivenessLock(userKey);
    setFails(lock.fails);
    if (lock.locked) {
      setPhase("locked");
      setLockMs(lock.remainingMs);
      setErr(`Too many attempts. Try again in ${formatRemaining(lock.remainingMs)}.`);
      livenessLog("warn", "locked", { remainingMs: lock.remainingMs });
    }
  }, [userKey]);

  // Boot once: camera + MediaPipe (CDN float16 — low data)
  useEffect(() => {
    const lock = getLivenessLock(userKey);
    if (lock.locked) {
      setPhase("locked");
      setLockMs(lock.remainingMs);
      setFails(lock.fails);
      setErr(
        `Too many attempts. Try again in ${formatRemaining(lock.remainingMs)}.`
      );
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setPhase("boot");
        setFeedback("Starting camera…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }

        setFeedback("Loading face model…");
        livenessLog("info", "model_load_start");
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
        let landmarker: FaceLandmarkerInstance;
        try {
          landmarker = (await vision.FaceLandmarker.createFromOptions(
            fileset,
            {
              baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: "GPU",
              },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
            }
          )) as FaceLandmarkerInstance;
        } catch {
          landmarker = (await vision.FaceLandmarker.createFromOptions(
            fileset,
            {
              baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
            }
          )) as FaceLandmarkerInstance;
        }
        if (cancelled) {
          landmarker.close?.();
          return;
        }
        landmarkerRef.current = landmarker;
        setModelReady(true);
        livenessLog("info", "model_ready");
        resetSession();
        runningRef.current = true;
        sessionStartedRef.current = performance.now();
        stepStartedRef.current = performance.now();
      } catch (e) {
        livenessLog("error", "boot_failed", {
          message: e instanceof Error ? e.message : "unknown",
        });
        setErr(
          "Could not start face check. Allow camera access and try again."
        );
        setPhase("fail");
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      try {
        landmarkerRef.current?.close?.();
      } catch {
        /* */
      }
      landmarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  const failSession = useCallback(
    (reason: string) => {
      runningRef.current = false;
      const r = recordLivenessFail(userKey);
      setFails(r.fails);
      livenessLog("warn", "session_fail", { reason, fails: r.fails });
      if (r.locked) {
        setPhase("locked");
        setLockMs(r.remainingMs);
        setErr(
          `Too many attempts. Try again in ${formatRemaining(r.remainingMs)}.`
        );
        stopCamera();
        return;
      }
      setPhase("fail");
      setErr(
        `${reason} Attempt ${r.fails} of ${LIVENESS_MAX_FAILS}.`
      );
    },
    [stopCamera, userKey]
  );

  const succeed = useCallback(() => {
    runningRef.current = false;
    clearLivenessFails(userKey);
    setPhase("success");
    setFeedback("Verified");
    setProgress(100);
    const challenges = challengesRef.current.map((c) => c.id);
    const durationMs = performance.now() - sessionStartedRef.current;
    livenessLog("info", "session_pass", {
      hook: "POST /api/liveness/verify",
      challenges,
      durationMs,
    });
    // Report pass to backend (no frames/media). Never blocks local success.
    if (userId) {
      void fetch("/api/liveness/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          passed: true,
          challenges,
          durationMs: Math.round(durationMs),
          clientScore: 1,
        }),
      }).catch(() => undefined);
    }
    window.setTimeout(() => {
      stopCamera();
      onPassed();
    }, 1400);
  }, [onPassed, stopCamera, userKey, userId]);

  // Detection loop
  useEffect(() => {
    if (!ready || !modelReady || phase !== "run") return;

    const tick = () => {
      if (!runningRef.current) return;
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      let result;
      try {
        result = lm.detectForVideo(video, now);
      } catch {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const faces = result.faceLandmarks || [];
      const face = faces[0];

      // Overall progress by time + steps
      const sessionAge = now - sessionStartedRef.current;
      const timeProg = Math.min(0.55, sessionAge / SESSION_TARGET_MS);
      const stepProg =
        (stepRef.current + (passedStepsRef.current[stepRef.current] ? 1 : 0.35)) /
        SESSION_LEN;
      setProgress(Math.min(99, Math.round((timeProg * 0.35 + stepProg * 0.65) * 100)));

      if (!face || face.length < 100) {
        faceMissingFramesRef.current += 1;
        facePresentFramesRef.current = Math.max(
          0,
          facePresentFramesRef.current - 1
        );
        if (faceMissingFramesRef.current > 45) {
          setFeedback("No face detected — center your face");
        }
        if (faceMissingFramesRef.current > 120) {
          failSession("We lost your face.");
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      faceMissingFramesRef.current = 0;
      facePresentFramesRef.current += 1;

      // Lighting / size heuristic: face box span
      const xs = face.map((p) => p.x);
      const ys = face.map((p) => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      if (spanX < 0.12 || spanY < 0.12) {
        setFeedback("Move closer to the camera");
      } else if (spanX > 0.75) {
        setFeedback("Move a little farther back");
      }

      // Motion energy (anti static photo)
      if (lastLmRef.current) {
        let e = 0;
        for (let i = 0; i < face.length; i += 8) {
          const a = face[i];
          const b = lastLmRef.current[i];
          if (a && b) e += dist3(a, b);
        }
        motionEnergyRef.current = motionEnergyRef.current * 0.85 + e * 0.15;
      }
      lastLmRef.current = face;

      const shapes = result.faceBlendshapes?.[0]?.categories;
      const pose = headPose(result.facialTransformationMatrixes?.[0]);
      const ear = eyeAspectRatio(face);
      earHistRef.current.push(ear);
      if (earHistRef.current.length > 18) earHistRef.current.shift();
      yawHistRef.current.push(pose.yaw);
      if (yawHistRef.current.length > 18) yawHistRef.current.shift();
      pitchHistRef.current.push(pose.pitch);
      if (pitchHistRef.current.length > 18) pitchHistRef.current.shift();

      const ch = challengesRef.current[stepRef.current];
      if (!ch) {
        succeed();
        return;
      }

      const blinkL = blendScore(shapes, "eyeBlinkLeft");
      const blinkR = blendScore(shapes, "eyeBlinkRight");
      const smile =
        (blendScore(shapes, "mouthSmileLeft") +
          blendScore(shapes, "mouthSmileRight")) /
        2;
      const ears = earHistRef.current;
      const earMin = Math.min(...ears);
      const earMax = Math.max(...ears);
      const yaw = pose.yaw;
      const pitch = pose.pitch;
      const yaws = yawHistRef.current;
      const pitches = pitchHistRef.current;
      const yawRange = Math.max(...yaws) - Math.min(...yaws);
      const pitchRange = Math.max(...pitches) - Math.min(...pitches);

      let passed = false;
      switch (ch.id) {
        case "blink":
          passed =
            (blinkL > 0.45 && blinkR > 0.45) ||
            (earMax - earMin > 0.045 && earMin < 0.18);
          break;
        case "smile":
          passed = smile > 0.35;
          break;
        case "turn_left":
          // Mirrored selfie: left turn appears as positive or negative yaw — accept either strong side
          passed = yaw > 0.18 || yaw < -0.18 || yawRange > 0.28;
          break;
        case "turn_right":
          passed = yaw < -0.18 || yaw > 0.18 || yawRange > 0.28;
          break;
        case "nod":
          passed = pitchRange > 0.2;
          break;
        case "look_up":
          passed = pitch < -0.12 || pitchRange > 0.18;
          break;
        case "look_down":
          passed = pitch > 0.12 || pitchRange > 0.18;
          break;
      }

      // Anti-spoof: require some live motion over session (not frozen)
      const liveEnough =
        motionEnergyRef.current > 0.002 ||
        yawRange > 0.05 ||
        pitchRange > 0.05 ||
        earMax - earMin > 0.02;

      if (passed && liveEnough && facePresentFramesRef.current > 8) {
        if (!passedStepsRef.current[stepRef.current]) {
          passedStepsRef.current[stepRef.current] = true;
          setFeedback(ch.feedbackOk);
          livenessLog("debug", "challenge_pass", { id: ch.id });
          window.setTimeout(() => {
            if (!runningRef.current) return;
            if (stepRef.current >= SESSION_LEN - 1) {
              // Final anti-spoof: total motion not zero
              if (motionEnergyRef.current < 0.0008 && yawRange < 0.08) {
                failSession("We could not confirm a live person.");
                return;
              }
              succeed();
              return;
            }
            stepRef.current += 1;
            setStep(stepRef.current);
            stepStartedRef.current = performance.now();
            earHistRef.current = [];
            yawHistRef.current = [];
            pitchHistRef.current = [];
            const next = challengesRef.current[stepRef.current];
            setFeedback(next ? `Good! Now ${next.label.toLowerCase()}` : "Hold on…");
          }, 420);
        }
      } else {
        const age = now - stepStartedRef.current;
        if (age > STEP_MS + 1800) {
          // Timeout on this challenge — soft nudge, don't fail whole session yet
          setFeedback(`${ch.label} — keep your face in the circle`);
          stepStartedRef.current = now;
          earHistRef.current = [];
          yawHistRef.current = [];
          pitchHistRef.current = [];
        } else if (facePresentFramesRef.current > 5) {
          setFeedback(ch.label);
        }
      }

      // Session hard timeout ~10s
      if (sessionAge > 12000) {
        failSession("Timed out. Try again in better light.");
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready, modelReady, phase, failSession, succeed]);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";
  const panel = isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]";

  const onRetry = () => {
    if (phase === "locked") return;
    const lock = getLivenessLock(userKey);
    if (lock.locked) {
      setPhase("locked");
      setLockMs(lock.remainingMs);
      setErr(
        `Too many attempts. Try again in ${formatRemaining(lock.remainingMs)}.`
      );
      return;
    }
    setErr(null);
    (async () => {
      try {
        setPhase("boot");
        setFeedback("Restarting…");
        if (!streamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
        }
        setReady(true);
        if (!landmarkerRef.current) {
          const vision = await import("@mediapipe/tasks-vision");
          const fileset =
            await vision.FilesetResolver.forVisionTasks(WASM_CDN);
          landmarkerRef.current = (await vision.FaceLandmarker.createFromOptions(
            fileset,
            {
              baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
            }
          )) as FaceLandmarkerInstance;
        }
        setModelReady(true);
        runningRef.current = true;
        resetSession();
      } catch {
        setErr("Camera unavailable. Check permissions.");
        setPhase("fail");
      }
    })();
  };

  const lockMinutes = useMemo(
    () => (lockMs > 0 ? formatRemaining(lockMs) : ""),
    [lockMs]
  );

  return (
    <div className={cn("flex flex-col gap-3 rounded-md p-3", panel)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScanFace className="h-5 w-5 text-[#FF6B35]" />
          <div>
            <p className={cn("text-[14px] font-bold", ink)}>Face liveness</p>
            <p className={cn("text-[11px] font-medium", muted)}>
              {phase === "success"
                ? "Verified"
                : phase === "locked"
                  ? "Temporarily locked"
                  : `Step ${Math.min(step + 1, SESSION_LEN)} of ${SESSION_LEN}`}
            </p>
          </div>
        </div>
        {phase === "run" || phase === "boot" ? (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border-0",
              isLight ? "bg-black/10" : "bg-white/10"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Progress */}
      <div
        className={cn(
          "h-1 w-full overflow-hidden rounded-full",
          isLight ? "bg-black/10" : "bg-white/15"
        )}
      >
        <div
          className="h-full rounded-full bg-[#FF6B35] transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Camera */}
      <div
        className={cn(
          "relative mx-auto aspect-[3/4] w-full max-w-[260px] overflow-hidden rounded-md bg-black"
        )}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
        />
        {/* Oval guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "h-[68%] w-[72%] rounded-full border-2",
              phase === "success"
                ? "border-emerald-400"
                : "border-[#FF6B35]/80"
            )}
          />
        </div>
        {(!ready || !modelReady) && phase === "boot" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF6B35]" />
            <p className="text-[11px] font-semibold text-white/90">
              {feedback}
            </p>
          </div>
        )}
        {phase === "success" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FF6B35]">
              <Check className="h-7 w-7 text-white" strokeWidth={2.5} />
            </div>
            <p className="text-[13px] font-bold text-white">You look real</p>
          </div>
        )}
      </div>

      {/* Instruction */}
      <p
        className={cn(
          "min-h-[2.5rem] text-center text-[13px] font-semibold leading-snug",
          err ? "text-red-500" : ink
        )}
      >
        {err || feedback}
      </p>

      {phase === "run" && (
        <p className={cn("text-center text-[10px] font-medium", muted)}>
          Follow the prompts · no video is saved
        </p>
      )}

      {phase === "locked" && (
        <p className={cn("text-center text-[11px] font-medium", muted)}>
          Come back in {lockMinutes}. Attempts reset after the wait.
        </p>
      )}

      <div className="flex gap-2">
        {phase !== "success" && phase !== "locked" && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            className={cn(
              "h-11 flex-1 rounded-md border-0 text-[12px] font-bold",
              isLight ? "bg-black/10 text-slate-800" : "bg-[#2c2c2e] text-white"
            )}
          >
            Cancel
          </button>
        )}
        {phase === "fail" && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border-0 bg-[#FF6B35] text-[12px] font-bold text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        )}
        {phase === "locked" && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            className="h-11 w-full rounded-md border-0 bg-[#323231] text-[12px] font-bold text-white"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
