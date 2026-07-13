"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INTRO_SRC = "/media/om-intro.mp4";

/**
 * Full-screen intro played when the user opens OgaMecho.
 * Completes on video end, error, or Skip.
 */
export function IntroScreen({ onComplete }: { onComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const [canSkip, setCanSkip] = useState(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const t = window.setTimeout(() => setCanSkip(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const play = async () => {
      try {
        v.muted = true;
        await v.play();
      } catch {
        // Autoplay blocked — still allow skip / end
      }
    };
    void play();
  }, []);

  return (
    <div
      className="absolute inset-0 z-[300] flex flex-col bg-black"
      role="dialog"
      aria-label="OgaMecho intro"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={INTRO_SRC}
        playsInline
        muted
        autoPlay
        preload="auto"
        onEnded={finish}
        onError={finish}
      />

      {canSkip && (
        <button
          type="button"
          onClick={finish}
          className="absolute right-3 top-3 z-10 rounded-full border-0 bg-black/45 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md"
        >
          Skip
        </button>
      )}
    </div>
  );
}
