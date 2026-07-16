"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Square } from "lucide-react";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { cn } from "@/lib/utils";
import type { JobMedia } from "@/lib/jobs/types";

const MAX_SEC = 60;

function pickMime(): string {
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

/**
 * Browser MediaRecorder voice note — record, listen back, re-record.
 * Stores as data URL so sender + receiver can play without storage bucket.
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
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      try {
        mediaRef.current?.stop();
      } catch {
        /* */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot record audio. Try Chrome or Safari.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunks.current = [];

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.current.push(e.data);
      };

      rec.onerror = () => {
        setError("Recording failed. Try again.");
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
      };

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timer.current) {
          window.clearInterval(timer.current);
          timer.current = null;
        }

        const blobType = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        if (!blob.size) {
          setError("No audio captured. Hold closer and try again.");
          setRecording(false);
          return;
        }
        const durationSec = Math.max(
          1,
          Math.min(MAX_SEC, Math.round((Date.now() - startedAt.current) / 1000))
        );
        try {
          const dataUrl = await blobToDataUrl(blob);
          const ext = blobType.includes("mp4")
            ? "m4a"
            : blobType.includes("ogg")
              ? "ogg"
              : "webm";
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
        } catch {
          setError("Could not save voice note. Try again.");
        }
        setRecording(false);
      };

      mediaRef.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      // timeslice so data arrives on all browsers (not only at stop)
      rec.start(200);
      setRecording(true);
      timer.current = window.setInterval(() => {
        const sec = Math.round((Date.now() - startedAt.current) / 1000);
        setElapsed(sec);
        if (sec >= MAX_SEC) {
          try {
            rec.stop();
          } catch {
            /* */
          }
        }
      }, 200);
    } catch {
      setError("Allow microphone access to record a voice note.");
    }
  };

  const stop = () => {
    const rec = mediaRef.current;
    if (!rec || rec.state === "inactive") {
      setRecording(false);
      return;
    }
    try {
      if (rec.state === "recording") rec.requestData();
      rec.stop();
    } catch {
      setRecording(false);
    }
  };

  const reset = () => {
    onChange(null);
    setElapsed(0);
    setError(null);
  };

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
            className="inline-flex h-11 items-center gap-2 rounded-md border-0 bg-[#e07a3d] px-4 text-[13px] font-bold text-white"
          >
            <Mic className="h-4 w-4" />
            Record
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
        {value && !recording && (
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

      {/* Sender listens back with same player receivers use */}
      {value?.url && !recording && (
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
        Optional. Describe the problem out loud (max {MAX_SEC}s). Play it back
        before you send.
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
