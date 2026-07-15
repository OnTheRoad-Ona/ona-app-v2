"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export type CallTarget = {
  name: string;
  phone: string;
  photo?: string;
  roleLabel?: string;
};

type CallPhase = "idle" | "dialing" | "connected" | "ended";

type CallContextValue = {
  startCall: (target: CallTarget) => void;
  endCall: () => void;
  active: boolean;
};

const CallContext = createContext<CallContextValue | null>(null);

export function useInAppCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    // Fallback when provider missing — still usable
    return {
      startCall: (t) => {
        const n = (t.phone || "").replace(/\s/g, "");
        if (n) window.location.href = `tel:${n}`;
      },
      endCall: () => {},
      active: false,
    };
  }
  return ctx;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * In-app call UI: dials carrier via tel: while showing a full-screen call sheet
 * (mute / speaker / end). Real PSTN still uses the device dialer; the sheet
 * is the in-app experience before and during the call handoff.
 */
export function InAppCallProvider({ children }: { children: ReactNode }) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const [target, setTarget] = useState<CallTarget | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setMount(
      document.getElementById("oga-mecho-phone") || document.body
    );
  }, []);

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const endCall = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopMic();
    setPhase((p) => (p === "idle" ? "idle" : "ended"));
    window.setTimeout(() => {
      setTarget(null);
      setPhase("idle");
      setSeconds(0);
      setMuted(false);
    }, 600);
  }, [stopMic]);

  const startCall = useCallback(
    (t: CallTarget) => {
      const phone = (t.phone || "").replace(/\s/g, "");
      if (!phone) return;
      setTarget({ ...t, phone });
      setPhase("dialing");
      setSeconds(0);

      // Open mic for in-app audio presence (optional permission)
      void navigator.mediaDevices
        ?.getUserMedia?.({ audio: true })
        .then((stream) => {
          streamRef.current = stream;
        })
        .catch(() => {
          /* mic optional — call still proceeds */
        });

      // Hand off to carrier dialer (real PSTN) after brief in-app dial UI
      window.setTimeout(() => {
        try {
          window.location.href = `tel:${phone}`;
        } catch {
          /* ignore */
        }
        setPhase("connected");
        timerRef.current = window.setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      }, 900);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopMic();
    };
  }, [stopMic]);

  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted;
    });
  }, [muted]);

  const value = useMemo(
    () => ({
      startCall,
      endCall,
      active: phase !== "idle" && phase !== "ended",
    }),
    [startCall, endCall, phase]
  );

  const sheet =
    phase !== "idle" && target && mount
      ? createPortal(
          <div
            className={cn(
              "absolute inset-0 z-[200] flex flex-col",
              isLight ? "bg-[#0a1610]" : "bg-[#0a0000]"
            )}
            role="dialog"
            aria-modal
            aria-label="In-app call"
          >
            <div className="flex flex-1 flex-col items-center justify-center px-6 pt-10">
              <div className="relative mb-6">
                <span className="om-call-ring absolute inset-[-10px] rounded-full" />
                <span className="om-call-ring om-call-ring-delay absolute inset-[-10px] rounded-full" />
                <Avatar className="relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-brand/50">
                  <AvatarImage
                    src={target.photo?.trim() || DEFAULT_VENDOR_PHOTO}
                    alt={target.name}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-brand text-lg font-bold text-white">
                    {avatarInitials(target.name)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <p className="text-center text-[20px] font-black text-white">
                {target.name}
              </p>
              {target.roleLabel && (
                <p className="mt-0.5 text-[12px] font-semibold text-white/55">
                  {target.roleLabel}
                </p>
              )}
              <p className="mt-3 text-[14px] font-bold tabular-nums text-brand">
                {phase === "dialing" && "Calling…"}
                {phase === "connected" && formatDuration(seconds)}
                {phase === "ended" && "Call ended"}
              </p>
              <p className="mt-1 text-[11px] text-white/40">{target.phone}</p>
              <p className="mt-4 max-w-[240px] text-center text-[11px] leading-snug text-white/45">
                In-app call · connecting via your phone line for a clear
                roadside conversation
              </p>
            </div>

            <div className="flex items-center justify-center gap-6 px-8 pb-10">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className={cn(
                  "flex h-14 w-14 flex-col items-center justify-center rounded-full border-0",
                  muted ? "bg-white/20 text-white" : "bg-white/10 text-white"
                )}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={endCall}
                className="flex h-16 w-16 items-center justify-center rounded-full border-0 bg-red-500 text-white shadow-lg"
                aria-label="End call"
              >
                <PhoneOff className="h-7 w-7" />
              </button>
              <button
                type="button"
                onClick={() => setSpeaker((s) => !s)}
                className={cn(
                  "flex h-14 w-14 flex-col items-center justify-center rounded-full border-0",
                  speaker ? "bg-white/20 text-white" : "bg-white/10 text-white"
                )}
                aria-label={speaker ? "Speaker off" : "Speaker on"}
              >
                {speaker ? (
                  <Volume2 className="h-5 w-5" />
                ) : (
                  <VolumeX className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>,
          mount
        )
      : null;

  return (
    <CallContext.Provider value={value}>
      {children}
      {sheet}
    </CallContext.Provider>
  );
}

/** Compact call button for profiles / job cards */
export function CallButton({
  target,
  className,
  label = "Call",
  variant = "solid",
}: {
  target: CallTarget;
  className?: string;
  label?: string;
  variant?: "solid" | "ghost";
}) {
  const { startCall } = useInAppCall();
  const disabled = !(target.phone || "").replace(/\s/g, "");

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => startCall(target)}
      className={cn(
        "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-0 text-[13px] font-bold disabled:opacity-40",
        variant === "solid"
          ? "bg-[#2c2c2e] text-white"
          : "bg-transparent text-brand",
        className
      )}
    >
      <Phone className="h-4 w-4" />
      {label}
    </button>
  );
}
