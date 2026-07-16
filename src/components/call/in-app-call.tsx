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
import { getAppSupabase } from "@/lib/supabase/app-client";
import { cn } from "@/lib/utils";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallTarget = {
  name: string;
  /** Optional PSTN fallback */
  phone?: string;
  photo?: string;
  roleLabel?: string;
  /** Callee auth user id — required for true in-app WebRTC */
  userId?: string;
  jobId?: string;
};

type CallPhase =
  | "idle"
  | "dialing"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended";

type CallMode = "webrtc" | "phone" | null;

type CallContextValue = {
  startCall: (target: CallTarget) => void;
  endCall: () => void;
  active: boolean;
};

type SignalPayload =
  | {
      type: "offer";
      callId: string;
      from: string;
      fromName: string;
      fromPhoto?: string;
      fromRole?: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "answer";
      callId: string;
      from: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "ice";
      callId: string;
      from: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: "hangup";
      callId: string;
      from: string;
    }
  | {
      type: "reject";
      callId: string;
      from: string;
    };

const CallContext = createContext<CallContextValue | null>(null);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Open the device dialer WITHOUT navigating the SPA away.
 * See docs/ANTI_REGRESSION.md — do not use window.location.href = tel:
 */
export function openTelDialer(phone: string): boolean {
  const n = (phone || "").replace(/[^\d+]/g, "");
  if (!n) return false;
  try {
    const a = document.createElement("a");
    a.href = `tel:${n}`;
    a.setAttribute("aria-hidden", "true");
    a.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(a);
    a.click();
    window.requestAnimationFrame(() => {
      try {
        a.remove();
      } catch {
        /* */
      }
    });
    return true;
  } catch {
    return false;
  }
}

export function useInAppCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    return {
      startCall: (t) => {
        if (t.phone) openTelDialer(t.phone);
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

function newCallId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * True in-app voice: WebRTC audio + Supabase Realtime signaling.
 * Phone-line dialer remains a secondary fallback when no peer userId.
 */
export function InAppCallProvider({ children }: { children: ReactNode }) {
  const { theme, backendUserId, displayName, userProfile, accountType } =
    useApp();
  const isLight = theme === "light";
  const myName =
    userProfile?.fullName?.trim() || displayName || "OgaMecho user";
  const myPhoto = userProfile?.avatarUrl || "";
  const myRole =
    accountType === "professional" ? "Repair Pro" : "Motorist";

  const [target, setTarget] = useState<CallTarget | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [mode, setMode] = useState<CallMode>(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [statusHint, setStatusHint] = useState("");
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [incoming, setIncoming] = useState<{
    callId: string;
    from: string;
    fromName: string;
    fromPhoto?: string;
    fromRole?: string;
    sdp: RTCSessionDescriptionInit;
  } | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const sessionChRef = useRef<RealtimeChannel | null>(null);
  const inboxChRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<number | null>(null);
  const dialTimerRef = useRef<number | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    setMount(document.getElementById("oga-mecho-phone") || document.body);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (dialTimerRef.current) {
      window.clearTimeout(dialTimerRef.current);
      dialTimerRef.current = null;
    }
  }, []);

  const stopMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const closePeer = useCallback(() => {
    try {
      pcRef.current?.close();
    } catch {
      /* */
    }
    pcRef.current = null;
    pendingIceRef.current = [];
  }, []);

  const leaveSessionChannel = useCallback(async () => {
    const sb = getAppSupabase();
    const ch = sessionChRef.current;
    sessionChRef.current = null;
    if (sb && ch) {
      try {
        await sb.removeChannel(ch);
      } catch {
        /* */
      }
    }
  }, []);

  const sendSignal = useCallback(
    async (toUserId: string, payload: SignalPayload) => {
      const sb = getAppSupabase();
      if (!sb) return false;
      // Ephemeral channel to callee inbox
      const ch = sb.channel(`call-inbox:${toUserId}`);
      await new Promise<void>((resolve) => {
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") resolve();
        });
        window.setTimeout(() => resolve(), 2000);
      });
      await ch.send({
        type: "broadcast",
        event: "signal",
        payload,
      });
      // Also send on session channel if open
      if (sessionChRef.current) {
        try {
          await sessionChRef.current.send({
            type: "broadcast",
            event: "signal",
            payload,
          });
        } catch {
          /* */
        }
      }
      window.setTimeout(() => {
        void sb.removeChannel(ch);
      }, 800);
      return true;
    },
    []
  );

  const endCall = useCallback(async () => {
    const peer = peerIdRef.current;
    const callId = callIdRef.current;
    const me = backendUserId;
    if (peer && callId && me) {
      void sendSignal(peer, { type: "hangup", callId, from: me });
    }
    clearTimers();
    stopMedia();
    closePeer();
    await leaveSessionChannel();
    callIdRef.current = null;
    peerIdRef.current = null;
    setIncoming(null);
    setPhase((p) => (p === "idle" ? "idle" : "ended"));
    setStatusHint("");
    window.setTimeout(() => {
      setTarget(null);
      setPhase("idle");
      setMode(null);
      setSeconds(0);
      setMuted(false);
      setSpeaker(true);
    }, 500);
  }, [
    backendUserId,
    clearTimers,
    closePeer,
    leaveSessionChannel,
    sendSignal,
    stopMedia,
  ]);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    let el = remoteAudioRef.current;
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      remoteAudioRef.current = el;
    }
    el.srcObject = stream;
    el.muted = false;
    void el.play().catch(() => {
      /* autoplay policies — user already interacted via Call */
    });
  }, []);

  const ensureLocalMic = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;
      return stream;
    } catch {
      return null;
    }
  }, []);

  const createPeer = useCallback(
    (local: MediaStream) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      local.getTracks().forEach((track) => pc.addTrack(track, local));
      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (stream) attachRemoteStream(stream);
      };
      pc.onicecandidate = (ev) => {
        if (!ev.candidate || !peerIdRef.current || !callIdRef.current || !backendUserId)
          return;
        void sendSignal(peerIdRef.current, {
          type: "ice",
          callId: callIdRef.current,
          from: backendUserId,
          candidate: ev.candidate.toJSON(),
        });
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") {
          setPhase("connected");
          setStatusHint("In-app voice connected");
          if (!timerRef.current) {
            timerRef.current = window.setInterval(() => {
              setSeconds((s) => s + 1);
            }, 1000);
          }
        } else if (st === "failed" || st === "disconnected") {
          setStatusHint(
            st === "failed"
              ? "Connection failed — try Call on phone"
              : "Reconnecting…"
          );
        } else if (st === "closed") {
          /* ended */
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [attachRemoteStream, backendUserId, sendSignal]
  );

  const joinSessionChannel = useCallback(
    async (callId: string, onSignal: (p: SignalPayload) => void) => {
      const sb = getAppSupabase();
      if (!sb) return null;
      await leaveSessionChannel();
      const ch = sb.channel(`call-session:${callId}`, {
        config: { broadcast: { self: false } },
      });
      ch.on("broadcast", { event: "signal" }, ({ payload }) => {
        onSignal(payload as SignalPayload);
      });
      await new Promise<void>((resolve) => {
        ch.subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") resolve();
        });
        window.setTimeout(() => resolve(), 2500);
      });
      sessionChRef.current = ch;
      return ch;
    },
    [leaveSessionChannel]
  );

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (!backendUserId) return;
      if (payload.from === backendUserId) return;

      if (payload.type === "hangup" || payload.type === "reject") {
        if (callIdRef.current && payload.callId !== callIdRef.current) return;
        clearTimers();
        stopMedia();
        closePeer();
        await leaveSessionChannel();
        callIdRef.current = null;
        peerIdRef.current = null;
        setIncoming(null);
        setPhase("ended");
        setStatusHint(
          payload.type === "reject" ? "Call declined" : "Call ended"
        );
        window.setTimeout(() => {
          setTarget(null);
          setPhase("idle");
          setMode(null);
          setSeconds(0);
          setStatusHint("");
        }, 1200);
        return;
      }

      if (payload.type === "ice") {
        if (callIdRef.current && payload.callId !== callIdRef.current) return;
        const pc = pcRef.current;
        if (pc && payload.candidate) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch {
            pendingIceRef.current.push(payload.candidate);
          }
        } else if (payload.candidate) {
          pendingIceRef.current.push(payload.candidate);
        }
        return;
      }

      if (payload.type === "answer") {
        if (callIdRef.current && payload.callId !== callIdRef.current) return;
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(payload.sdp);
          for (const c of pendingIceRef.current) {
            try {
              await pc.addIceCandidate(c);
            } catch {
              /* */
            }
          }
          pendingIceRef.current = [];
          setPhase("connecting");
          setStatusHint("Connecting voice…");
        } catch (e) {
          console.warn("answer failed", e);
          setStatusHint("Could not connect voice");
        }
        return;
      }

      if (payload.type === "offer") {
        // Incoming call while idle
        if (phase !== "idle" && phase !== "ended") return;
        setIncoming({
          callId: payload.callId,
          from: payload.from,
          fromName: payload.fromName,
          fromPhoto: payload.fromPhoto,
          fromRole: payload.fromRole,
          sdp: payload.sdp,
        });
        setPhase("ringing");
        setMode("webrtc");
        setTarget({
          name: payload.fromName,
          photo: payload.fromPhoto,
          roleLabel: payload.fromRole || "Incoming",
          userId: payload.from,
          phone: "",
        });
        callIdRef.current = payload.callId;
        peerIdRef.current = payload.from;
      }
    },
    [
      backendUserId,
      clearTimers,
      closePeer,
      leaveSessionChannel,
      phase,
      stopMedia,
    ]
  );

  // Inbox: always listen for incoming WebRTC offers when signed in
  useEffect(() => {
    if (!backendUserId) return;
    const sb = getAppSupabase();
    if (!sb) return;

    const ch = sb.channel(`call-inbox:${backendUserId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "signal" }, ({ payload }) => {
      void handleSignal(payload as SignalPayload);
    });
    ch.subscribe();
    inboxChRef.current = ch;

    return () => {
      void sb.removeChannel(ch);
      inboxChRef.current = null;
    };
  }, [backendUserId, handleSignal]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || !backendUserId) return;
    setPhase("connecting");
    setStatusHint("Answering…");
    setMode("webrtc");
    callIdRef.current = incoming.callId;
    peerIdRef.current = incoming.from;

    const local = await ensureLocalMic();
    if (!local) {
      setStatusHint("Microphone permission needed");
      setPhase("ringing");
      return;
    }

    await joinSessionChannel(incoming.callId, (p) => void handleSignal(p));

    const pc = createPeer(local);
    try {
      await pc.setRemoteDescription(incoming.sdp);
      for (const c of pendingIceRef.current) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* */
        }
      }
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(incoming.from, {
        type: "answer",
        callId: incoming.callId,
        from: backendUserId,
        sdp: answer,
      });
      setIncoming(null);
      setStatusHint("Connecting voice…");
    } catch (e) {
      console.warn("accept failed", e);
      setStatusHint("Could not answer call");
      void endCall();
    }
  }, [
    backendUserId,
    createPeer,
    endCall,
    ensureLocalMic,
    handleSignal,
    incoming,
    joinSessionChannel,
    sendSignal,
  ]);

  const rejectIncoming = useCallback(async () => {
    if (incoming && backendUserId) {
      await sendSignal(incoming.from, {
        type: "reject",
        callId: incoming.callId,
        from: backendUserId,
      });
    }
    setIncoming(null);
    setPhase("idle");
    setTarget(null);
    setMode(null);
    callIdRef.current = null;
    peerIdRef.current = null;
  }, [backendUserId, incoming, sendSignal]);

  const startWebRtcCall = useCallback(
    async (t: CallTarget) => {
      if (!backendUserId || !t.userId) return false;
      if (t.userId === backendUserId) {
        setStatusHint("Cannot call yourself");
        return false;
      }

      clearTimers();
      stopMedia();
      closePeer();
      await leaveSessionChannel();

      const callId = newCallId();
      callIdRef.current = callId;
      peerIdRef.current = t.userId;
      setTarget(t);
      setMode("webrtc");
      setPhase("dialing");
      setSeconds(0);
      setMuted(false);
      setSpeaker(true);
      setStatusHint("Starting in-app call…");
      setIncoming(null);

      const local = await ensureLocalMic();
      if (!local) {
        setStatusHint("Allow microphone for in-app call");
        // Fall back to phone if available
        if (t.phone?.replace(/[^\d+]/g, "")) {
          setMode("phone");
          setPhase("dialing");
          dialTimerRef.current = window.setTimeout(() => {
            openTelDialer(t.phone || "");
            setPhase("connected");
            setStatusHint("Opened phone dialer");
            timerRef.current = window.setInterval(
              () => setSeconds((s) => s + 1),
              1000
            );
          }, 400);
          return true;
        }
        setPhase("ended");
        window.setTimeout(() => {
          setPhase("idle");
          setTarget(null);
          setMode(null);
        }, 1500);
        return false;
      }

      await joinSessionChannel(callId, (p) => void handleSignal(p));
      const pc = createPeer(local);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        setStatusHint("Ringing…");
        setPhase("ringing");
        await sendSignal(t.userId, {
          type: "offer",
          callId,
          from: backendUserId,
          fromName: myName,
          fromPhoto: myPhoto || undefined,
          fromRole: myRole,
          sdp: offer,
        });

        // Timeout if no answer
        dialTimerRef.current = window.setTimeout(() => {
          if (pcRef.current && phase !== "connected") {
            setStatusHint("No answer — try Call on phone");
          }
        }, 45000);

        return true;
      } catch (e) {
        console.warn("offer failed", e);
        setStatusHint("Could not start in-app call");
        void endCall();
        return false;
      }
    },
    [
      backendUserId,
      clearTimers,
      closePeer,
      createPeer,
      endCall,
      ensureLocalMic,
      handleSignal,
      joinSessionChannel,
      leaveSessionChannel,
      myName,
      myPhoto,
      myRole,
      phase,
      sendSignal,
      stopMedia,
    ]
  );

  const startPhoneCall = useCallback(
    (t: CallTarget) => {
      const phone = (t.phone || "").replace(/[^\d+]/g, "");
      if (!phone) return;
      clearTimers();
      stopMedia();
      closePeer();
      setTarget({ ...t, phone });
      setMode("phone");
      setPhase("dialing");
      setSeconds(0);
      setStatusHint("Opening phone dialer…");
      void ensureLocalMic();
      dialTimerRef.current = window.setTimeout(() => {
        openTelDialer(phone);
        setPhase("connected");
        setStatusHint("Phone dialer · stay on this screen");
        timerRef.current = window.setInterval(
          () => setSeconds((s) => s + 1),
          1000
        );
      }, 400);
    },
    [clearTimers, closePeer, ensureLocalMic, stopMedia]
  );

  const startCall = useCallback(
    (t: CallTarget) => {
      const hasPeer = Boolean(t.userId && backendUserId);
      const hasPhone = Boolean((t.phone || "").replace(/[^\d+]/g, ""));
      if (hasPeer) {
        void startWebRtcCall(t);
        return;
      }
      if (hasPhone) {
        startPhoneCall(t);
        return;
      }
      // Nothing to dial
      setTarget(t);
      setPhase("ended");
      setStatusHint("No phone or in-app peer available");
      window.setTimeout(() => {
        setPhase("idle");
        setTarget(null);
        setStatusHint("");
      }, 1800);
    },
    [backendUserId, startPhoneCall, startWebRtcCall]
  );

  useEffect(() => {
    return () => {
      clearTimers();
      stopMedia();
      closePeer();
      void leaveSessionChannel();
    };
  }, [clearTimers, closePeer, leaveSessionChannel, stopMedia]);

  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted;
    });
  }, [muted]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = speaker ? 1 : 0.15;
    }
  }, [speaker]);

  const value = useMemo(
    () => ({
      startCall,
      endCall: () => void endCall(),
      active: phase !== "idle" && phase !== "ended",
    }),
    [startCall, endCall, phase]
  );

  const phaseLabel = (() => {
    if (phase === "dialing") return "Calling…";
    if (phase === "ringing" && incoming) return "Incoming call";
    if (phase === "ringing") return "Ringing…";
    if (phase === "connecting") return "Connecting…";
    if (phase === "connected") return formatDuration(seconds);
    if (phase === "ended") return "Call ended";
    return "";
  })();

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
                {(phase === "dialing" ||
                  phase === "ringing" ||
                  phase === "connecting") && (
                  <>
                    <span className="om-call-ring absolute inset-[-10px] rounded-full" />
                    <span className="om-call-ring om-call-ring-delay absolute inset-[-10px] rounded-full" />
                  </>
                )}
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
                {phaseLabel}
              </p>
              {mode === "webrtc" && (
                <p className="mt-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                  In-app voice
                </p>
              )}
              {mode === "phone" && target.phone && (
                <p className="mt-1 text-[11px] text-white/40">{target.phone}</p>
              )}
              {statusHint && (
                <p className="mt-3 max-w-[260px] text-center text-[11px] leading-snug text-white/55">
                  {statusHint}
                </p>
              )}
              {!statusHint && mode === "webrtc" && phase === "connected" && (
                <p className="mt-3 max-w-[260px] text-center text-[11px] leading-snug text-white/45">
                  Voice call inside OgaMecho · mute or end anytime
                </p>
              )}

              {/* Incoming accept / decline */}
              {phase === "ringing" && incoming && (
                <div className="mt-8 flex w-full max-w-[280px] gap-3">
                  <button
                    type="button"
                    onClick={() => void rejectIncoming()}
                    className="flex h-12 flex-1 items-center justify-center rounded-md border-0 bg-red-500/90 text-[13px] font-bold text-white"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => void acceptIncoming()}
                    className="flex h-12 flex-1 items-center justify-center rounded-md border-0 bg-emerald-500 text-[13px] font-bold text-white"
                  >
                    Accept
                  </button>
                </div>
              )}

              {/* Fallback to phone during WebRTC */}
              {mode === "webrtc" &&
                phase !== "ringing" &&
                (target.phone || "").replace(/[^\d+]/g, "") && (
                  <button
                    type="button"
                    onClick={() => startPhoneCall(target)}
                    className="mt-4 border-0 bg-transparent text-[12px] font-bold text-brand"
                  >
                    Use phone line instead
                  </button>
                )}
            </div>

            {!(phase === "ringing" && incoming) && (
              <div className="flex items-center justify-center gap-6 px-8 pb-10">
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full border-0",
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
                  onClick={() => void endCall()}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-0 bg-red-500 text-white shadow-lg"
                  aria-label="End call"
                >
                  <PhoneOff className="h-7 w-7" />
                </button>
                <button
                  type="button"
                  onClick={() => setSpeaker((s) => !s)}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full border-0",
                    speaker ? "bg-white/20 text-white" : "bg-white/10 text-white"
                  )}
                  aria-label={speaker ? "Speaker lower" : "Speaker full"}
                >
                  {speaker ? (
                    <Volume2 className="h-5 w-5" />
                  ) : (
                    <VolumeX className="h-5 w-5" />
                  )}
                </button>
              </div>
            )}
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
  const hasPhone = Boolean((target.phone || "").replace(/[^\d+]/g, ""));
  const hasPeer = Boolean(target.userId);
  const disabled = !hasPhone && !hasPeer;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startCall(target);
      }}
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
