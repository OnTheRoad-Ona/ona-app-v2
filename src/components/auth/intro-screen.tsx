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
    // Skip available almost immediately so boot never feels stuck
    const t = window.setTimeout(() => setCanSkip(true), 350);
    // Cap intro hard — never block the app for a long video download
    const max = window.setTimeout(() => finish(), 6000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(max);
    };
  }, [finish]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const play = async () => {
      try {
        v.muted = true;
        await v.play();
      } catch {
        // Autoplay blocked — finish quickly so user is not stuck on black
        window.setTimeout(() => finish(), 800);
      }
    };
    void play();
  }, [finish]);

  return (
    <div
      className="absolute inset-0 z-[300] flex flex-col bg-black"
      role="dialog"
      aria-label="OgaMecho intro"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover bg-black"
        src={INTRO_SRC}
        playsInline
        muted
        autoPlay
        // metadata only — full preload was making first open very slow
        preload="metadata"
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
