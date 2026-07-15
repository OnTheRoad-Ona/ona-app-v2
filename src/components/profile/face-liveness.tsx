"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";

type Gesture = "center" | "left" | "right" | "blink";

const STEPS: { gesture: Gesture; label: string }[] = [
  { gesture: "center", label: "Look straight at the camera" },
  { gesture: "left", label: "Slowly turn your head left" },
  { gesture: "right", label: "Slowly turn your head right" },
  { gesture: "blink", label: "Blink twice" },
];

/**
 * Tier-2 face liveness: camera + motion-based gesture checks.
 * Production scaffolding — pairs with NIN/BVN before Verification Mark (Tier 3).
 */
export function FaceLiveness({
  isLight,
  onPassed,
  onCancel,
}: {
  isLight: boolean;
  onPassed: () => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const prevFrame = useRef<ImageData | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setErr("Camera access is required for Face ID liveness.");
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  const sampleMotion = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return 0;
    const w = 80;
    const h = 60;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h);
    const prev = prevFrame.current;
    prevFrame.current = frame;
    if (!prev) return 0;
    let diff = 0;
    for (let i = 0; i < frame.data.length; i += 16) {
      diff += Math.abs(frame.data[i]! - prev.data[i]!);
    }
    return diff / (frame.data.length / 16);
  }, []);

  const confirmStep = async () => {
    setChecking(true);
    setErr(null);
    // Sample motion over ~1.2s
    const samples: number[] = [];
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 150));
      samples.push(sampleMotion());
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const needMotion = STEPS[step]?.gesture !== "center";
    const ok = needMotion ? avg > 4 : avg < 18;
    setChecking(false);
    if (!ok) {
      setErr(
        needMotion
          ? "We didn’t detect enough movement. Try again."
          : "Hold still looking at the camera, then continue."
      );
      return;
    }
    if (step >= STEPS.length - 1) {
      stop();
      onPassed();
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl p-3",
        isLight ? "bg-transparent" : "bg-[#1c1c1e]"
      )}
    >
      <div className="flex items-center gap-2">
        <ScanFace className="h-5 w-5 text-brand" />
        <div>
          <p
            className={cn(
              "text-[14px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Live Face ID
          </p>
          <p
            className={cn(
              "text-[11px]",
              isLight ? "text-slate-600" : "text-[#a1a1a6]"
            )}
          >
            Step {step + 1} of {STEPS.length} · {STEPS[step]?.label}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "relative mx-auto aspect-[3/4] w-full max-w-[240px] overflow-hidden rounded-2xl",
          isLight ? "bg-black/10" : "bg-black"
        )}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
        />
        {!ready && !err && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-brand/70" />
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {err && (
        <p className="text-center text-[11px] font-semibold text-red-500">
          {err}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            stop();
            onCancel();
          }}
          className={cn(
            "h-10 flex-1 rounded-xl border-0 text-[12px] font-bold",
            isLight ? "bg-black/10 text-slate-800" : "bg-[#2c2c2e] text-white"
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready || checking}
          onClick={() => void confirmStep()}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border-0 bg-brand text-[12px] font-bold text-white disabled:opacity-50"
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step >= STEPS.length - 1 ? (
            <>
              <Check className="h-4 w-4" /> Finish
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" /> Continue
            </>
          )}
        </button>
      </div>
    </div>
  );
}
