"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import {
  VOICE_MAX_SEC,
  blobToDataUrl,
  createMediaRecorder,
  extForMime,
  getMicStream,
  waitRecorderStart,
} from "@/lib/voice-record";
import { cn } from "@/lib/utils";
import type { JobMedia } from "@/lib/jobs/types";

type Phase = "idle" | "arming" | "recording" | "saving";

function wallClockMs(): number {
  return Date.now();
}

/**
 * Browser MediaRecorder voice note — record, listen back, re-record.
 * Tuned to avoid UI lag: instant button feedback, low bitrate, less re-render.
 */
export function VoiceNoteRecorder({
  value,
  onChange,
  userId,
  isLight,
  onPhaseChange,
  leading,
}: {
  value: JobMedia | null;
  onChange: (v: JobMedia | null) => void;
  userId: string;
  isLight: boolean;
  onPhaseChange?: (phase: Phase) => void;
  /** Optional control rendered in front of the Record button. */
  leading?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const elapsedEl = useRef<HTMLSpanElement | null>(null);
  const stopLock = useRef(false);

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* */
      }
    });
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearTimer();
      try {
        mediaRef.current?.stop();
      } catch {
        /* */
      }
      releaseStream();
    };
  }, []);

  const paintElapsed = (sec: number) => {
    setElapsed(sec);
    if (elapsedEl.current) {
      elapsedEl.current.textContent = `${sec}s`;
    }
  };

  const start = async () => {
    if (phase !== "idle" || stopLock.current) return;
    setError(null);
    setPhase("arming");
    paintElapsed(0);

    if (typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported on this device.");
      setPhase("idle");
      return;
    }

    try {
      const stream = await getMicStream();
      streamRef.current = stream;
      const rec = createMediaRecorder(stream);
      chunks.current = [];
      stopLock.current = false;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.current.push(e.data);
      };

      rec.onerror = () => {
        setError("Recording failed. Try again.");
        clearTimer();
        releaseStream();
        mediaRef.current = null;
        setPhase("idle");
      };

      rec.onstop = () => {
        // Handled in stop() after requestData — keep handler light
      };

      mediaRef.current = rec;
      // 1s timeslice: fewer callbacks than 200ms (was a source of main-thread lag)
      rec.start(1000);
      await waitRecorderStart(rec);
      startedAt.current = wallClockMs();
      setPhase("recording");
      paintElapsed(0);

      clearTimer();
      // 250ms is enough for a smooth counter without thrashing React
      timer.current = window.setInterval(() => {
        const sec = Math.floor((wallClockMs() - startedAt.current) / 1000);
        paintElapsed(sec);
        if (sec >= VOICE_MAX_SEC) {
          void finishRecording();
        }
      }, 250);
    } catch {
      releaseStream();
      mediaRef.current = null;
      setError("Allow microphone access to record a voice note.");
      setPhase("idle");
    }
  };

  const finishRecording = async () => {
    if (stopLock.current) return;
    const rec = mediaRef.current;
    if (!rec || rec.state === "inactive") {
      setPhase("idle");
      return;
    }
    stopLock.current = true;
    clearTimer();
    // Leave "recording" UI immediately so Stop doesn't feel stuck
    setPhase("saving");

    const blobType = rec.mimeType || "audio/webm";
    const durationSec = Math.max(
      1,
      Math.min(
        VOICE_MAX_SEC,
        Math.round((wallClockMs() - startedAt.current) / 1000)
      )
    );

    const blob = await new Promise<Blob>((resolve) => {
      const finalize = () => {
        resolve(new Blob(chunks.current, { type: blobType }));
      };
      rec.onstop = () => {
        releaseStream();
        mediaRef.current = null;
        finalize();
      };
      try {
        if (rec.state === "recording") {
          try {
            rec.requestData();
          } catch {
            /* */
          }
          rec.stop();
        } else {
          releaseStream();
          mediaRef.current = null;
          finalize();
        }
      } catch {
        releaseStream();
        mediaRef.current = null;
        finalize();
      }
    });

    if (!blob.size) {
      setError("No audio captured. Hold closer and try again.");
      setPhase("idle");
      stopLock.current = false;
      return;
    }

    try {
      // Yield so the "Saving…" paint lands before heavy FileReader work
      await new Promise((r) => window.setTimeout(r, 0));
      const dataUrl = await blobToDataUrl(blob);
      const ext = extForMime(blobType);
      onChange({
        id: `voice_${Date.now()}`,
        kind: "voice",
        url: dataUrl,
        name: `voice-${durationSec}s.${ext}`,
        mime: blobType,
        durationSec,
        createdAt: new Date().toISOString(),
        uploadedBy: userId,
      });
      setPhase("idle");
    } catch {
      setError("Could not save voice note. Try again.");
      setPhase("idle");
    } finally {
      stopLock.current = false;
    }
  };

  const stop = () => {
    void finishRecording();
  };

  const reset = () => {
    onChange(null);
    paintElapsed(0);
    setError(null);
  };

  const recording = phase === "recording";
  const busy = phase === "arming" || phase === "saving";

  return (
    <div className="py-1">
      <div className="mb-2.5 flex items-center justify-between">
        <p
          className={cn(
            "text-[12px] font-bold",
            isLight ? "text-slate-700" : "text-white/70"
          )}
        >
          Voice note
        </p>
        {(phase !== "idle" || value) && (
          <span
            ref={elapsedEl}
            className="text-[12px] font-black tabular-nums text-[#FF6B35]"
          >
            {phase === "arming"
              ? "…"
              : phase === "saving"
                ? "Saving"
                : recording
                  ? `${elapsed}s`
                  : value?.durationSec
                    ? `${value.durationSec}s`
                    : ""}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {leading}
        {!value && phase === "idle" && (
          <button
            type="button"
            onClick={() => void start()}
            className="inline-flex h-11 items-center gap-2 rounded-md border-0 bg-[#FF6B35] px-4 text-[13px] font-bold text-white"
          >
            <Mic className="h-4 w-4" />
            Record
          </button>
        )}
        {phase === "arming" && (
          <button
            type="button"
            disabled
            className="inline-flex h-11 items-center gap-2 rounded-md border-0 bg-[#FF6B35]/80 px-4 text-[13px] font-bold text-white"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting…
          </button>
        )}
        {recording && (
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-11 items-center gap-2 rounded-md border-0 bg-red-500 px-4 text-[13px] font-bold text-white"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop
          </button>
        )}
        {phase === "saving" && (
          <button
            type="button"
            disabled
            className="inline-flex h-11 items-center gap-2 rounded-md border-0 bg-red-500/80 px-4 text-[13px] font-bold text-white"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </button>
        )}
        {value && !busy && !recording && (
          <button
            type="button"
            onClick={reset}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-md border-0 px-4 text-[13px] font-bold",
              isLight ? "bg-black/10 text-slate-800" : "bg-white/10 text-white"
            )}
          >
            <RotateCcw className="h-4 w-4" />
            Re-record
          </button>
        )}
      </div>

      {value?.url && phase === "idle" && (
        <div className="mt-3">
          <VoiceNotePlayer
            url={value.url}
            durationSec={value.durationSec}
            isLight={isLight}
            label="Your voice note · tap play"
          />
        </div>
      )}

      {error && (
        <p className="mt-2 text-[12px] font-semibold text-red-500">{error}</p>
      )}
      <p
        className={cn(
          "mt-2 text-[11px]",
          isLight ? "text-slate-500" : "text-white/45"
        )}
      >
        Optional. Describe the problem out loud (max {VOICE_MAX_SEC}s). Play it
        back before you send.
      </p>
    </div>
  );
}
