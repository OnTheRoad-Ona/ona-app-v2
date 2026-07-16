"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * In-app voice player — play / pause + duration.
 * Works for sender preview and receiver listen.
 */
export function VoiceNotePlayer({
  url,
  durationSec,
  isLight,
  label = "Voice note",
  className,
}: {
  url: string;
  durationSec?: number | null;
  isLight: boolean;
  label?: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    audioRef.current = audio;

    const onTime = () => setCurrent(audio.currentTime || 0);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(Math.round(audio.duration));
      } else if (durationSec) {
        setDuration(durationSec);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onErr = () => {
      setPlaying(false);
      setError("Could not play this voice note");
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
      audioRef.current = null;
    };
  }, [url, durationSec]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    try {
      if (playing) {
        audio.pause();
        setPlaying(false);
        return;
      }
      await audio.play();
      setPlaying(true);
    } catch {
      setError("Tap play again or check sound is on");
      setPlaying(false);
    }
  };

  const total = duration || durationSec || 0;
  const pct =
    total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-md px-2.5 py-2",
        isLight ? "bg-black/[0.06]" : "bg-white/[0.08]",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggle()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[#e07a3d] text-white"
          aria-label={playing ? "Pause voice note" : "Play voice note"}
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[12px] font-bold",
              isLight ? "text-slate-800" : "text-white"
            )}
          >
            {label}
          </p>
          <div
            className={cn(
              "mt-1 h-1.5 overflow-hidden rounded-full",
              isLight ? "bg-black/10" : "bg-white/15"
            )}
          >
            <div
              className="h-full rounded-full bg-[#e07a3d] transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 text-[11px] font-bold tabular-nums",
            isLight ? "text-slate-600" : "text-white/70"
          )}
        >
          {formatSec(playing || current > 0 ? current : total)}
          {total > 0 && !playing && current === 0 ? `s` : ""}
        </span>
      </div>
      {error && (
        <p className="text-[11px] font-semibold text-red-500">{error}</p>
      )}
    </div>
  );
}

function formatSec(n: number) {
  const s = Math.max(0, Math.floor(n));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}`;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
