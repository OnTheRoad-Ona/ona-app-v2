"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobMedia } from "@/lib/jobs/types";

/**
 * Browser MediaRecorder voice note — record / play / re-record.
 * Stores as data URL (works without Storage keys; swap to Supabase Storage later).
 */
export function VoiceNoteRecorder({
  value,
  onChange,
  userId,
  isLight,
}: {
  value: JobMedia | null;
  onChange: (v: JobMedia | null) => void;
  userId: string;
  isLight: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      mediaRef.current?.stop();
    };
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - startedAt.current) / 1000)
        );
        const dataUrl = await blobToDataUrl(blob);
        onChange({
          id: `voice_${Date.now()}`,
          kind: "voice",
          url: dataUrl,
          name: `voice-${durationSec}s.webm`,
          mime: "audio/webm",
          durationSec,
          createdAt: new Date().toISOString(),
          uploadedBy: userId,
        });
        setRecording(false);
        if (timer.current) window.clearInterval(timer.current);
      };
      mediaRef.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      timer.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      }, 250);
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone permission is needed for voice notes.");
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
  };

  const play = () => {
    if (!value?.url) return;
    if (!audioRef.current) audioRef.current = new Audio(value.url);
    else audioRef.current.src = value.url;
    audioRef.current.onended = () => setPlaying(false);
    void audioRef.current.play();
    setPlaying(true);
  };

  const pause = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  const reset = () => {
    pause();
    onChange(null);
    setElapsed(0);
  };

  const card = isLight
    ? "border border-black/8 bg-white/80 shadow-sm backdrop-blur-xl"
    : "border border-white/10 bg-white/[0.06] backdrop-blur-xl";

  return (
    <div className={cn("rounded-2xl p-4", card)}>
      <div className="mb-3 flex items-center justify-between">
        <p
          className={cn(
            "text-[12px] font-bold uppercase tracking-wide",
            isLight ? "text-slate-600" : "text-white/60"
          )}
        >
          Voice note
        </p>
        {(recording || value) && (
          <span className="text-[12px] font-black tabular-nums text-[#e07a3d]">
            {recording
              ? `${elapsed}s`
              : value?.durationSec
                ? `${value.durationSec}s`
                : ""}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!value && !recording && (
          <button
            type="button"
            onClick={() => void start()}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#e07a3d] px-4 text-[13px] font-bold text-white shadow-lg shadow-[#e07a3d]/25"
          >
            <Mic className="h-4 w-4" />
            Record
          </button>
        )}
        {recording && (
          <button
            type="button"
            onClick={stop}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-red-500 px-4 text-[13px] font-bold text-white"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop
          </button>
        )}
        {value && !recording && (
          <>
            <button
              type="button"
              onClick={playing ? pause : play}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[13px] font-bold",
                isLight
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-900"
              )}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={reset}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[13px] font-bold",
                isLight ? "bg-black/8 text-slate-800" : "bg-white/10 text-white"
              )}
            >
              <RotateCcw className="h-4 w-4" />
              Re-record
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-[12px] font-semibold text-red-500">{error}</p>
      )}
      <p
        className={cn(
          "mt-2 text-[11px]",
          isLight ? "text-slate-500" : "text-white/45"
        )}
      >
        Optional — describe the problem out loud.
      </p>
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}
