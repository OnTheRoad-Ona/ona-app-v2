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
import { playPersonTone, unlockAudio } from "@/lib/sound-tone";
import { useApp } from "@/lib/store";
import { getAppSupabase } from "@/lib/supabase/app-client";
import { cn } from "@/lib/utils";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallTarget = {
  name: string;
  phone?: string;
  photo?: string;
  roleLabel?: string;
  /** Callee auth user id — required for WebRTC */
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
  | { type: "hangup"; callId: string; from: string }
  | { type: "reject"; callId: string; from: string };

const CallContext = createContext<CallContextValue | null>(null);

/** STUN + free public TURN so mobile NAT can connect (STUN-only often fails) */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:80?transport=tcp",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

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
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

async function waitSubscribed(ch: RealtimeChannel, ms = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const t = window.setTimeout(() => finish(false), ms);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(t);
        finish(true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(t);
        finish(false);
      }
    });
  });
}

/**
 * In-app WebRTC voice + phone fallback.
 * Uses STUN+TURN and dual signaling (session channel + peer inbox).
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
  const timerRef = useRef<number | null>(null);
  const failTimerRef = useRef<number | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);
  const phaseRef = useRef<CallPhase>("idle");
  const myIdRef = useRef<string | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    myIdRef.current = backendUserId;
  }, [backendUserId]);

  useEffect(() => {
    setMount(document.getElementById("oga-mecho-phone") || document.body);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (failTimerRef.current) {
      window.clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
    if (ringTimerRef.current) {
      window.clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
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
    makingOfferRef.current = false;
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

  /** Dual-path signal: session channel + direct peer inbox */
  const sendSignal = useCallback(
    async (toUserId: string, payload: SignalPayload) => {
      const sb = getAppSupabase();
      if (!sb) return false;

      // Session channel (preferred once both joined)
      if (sessionChRef.current) {
        try {
          await sessionChRef.current.send({
            type: "broadcast",
            event: "signal",
            payload,
          });
        } catch {
          /* fall through to inbox */
        }
      }

      // Always also push to peer inbox (more reliable for first messages)
      const ch = sb.channel(`call-inbox:${toUserId}`, {
        config: { broadcast: { ack: false } },
      });
      const ok = await waitSubscribed(ch, 3000);
      if (ok) {
        try {
          await ch.send({
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
      }, 600);
      return true;
    },
    []
  );

  const endCall = useCallback(async () => {
    const peer = peerIdRef.current;
    const callId = callIdRef.current;
    const me = myIdRef.current;
    if (peer && callId && me) {
      void sendSignal(peer, { type: "hangup", callId, from: me });
    }
    playPersonTone(peer || me || "self", "call_end");
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
    }, 600);
  }, [clearTimers, closePeer, leaveSessionChannel, sendSignal, stopMedia]);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    let el = remoteAudioRef.current;
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      el.style.display = "none";
      document.body.appendChild(el);
      remoteAudioRef.current = el;
    }
    el.srcObject = stream;
    el.volume = 1;
    void el.play().catch(() => undefined);
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

  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    const pending = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* ignore bad candidates */
      }
    }
  }, []);

  const createPeer = useCallback(
    (local: MediaStream) => {
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 4,
      });
      local.getTracks().forEach((track) => {
        pc.addTrack(track, local);
      });
      // Ensure we can receive remote audio
      try {
        pc.addTransceiver("audio", { direction: "sendrecv" });
      } catch {
        /* already have track */
      }

      pc.ontrack = (ev) => {
        const stream =
          ev.streams[0] ||
          new MediaStream(ev.track ? [ev.track] : []);
        if (stream.getTracks().length) attachRemoteStream(stream);
      };

      pc.onicecandidate = (ev) => {
        const peer = peerIdRef.current;
        const callId = callIdRef.current;
        const me = myIdRef.current;
        if (!ev.candidate || !peer || !callId || !me) return;
        void sendSignal(peer, {
          type: "ice",
          callId,
          from: me,
          candidate: ev.candidate.toJSON(),
        });
      };

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        if (st === "connected" || st === "completed") {
          setPhase("connected");
          setStatusHint("In-app voice connected");
          if (!timerRef.current) {
            timerRef.current = window.setInterval(() => {
              setSeconds((s) => s + 1);
            }, 1000);
          }
          if (failTimerRef.current) {
            window.clearTimeout(failTimerRef.current);
            failTimerRef.current = null;
          }
          if (ringTimerRef.current) {
            window.clearInterval(ringTimerRef.current);
            ringTimerRef.current = null;
          }
        } else if (st === "checking") {
          setStatusHint("Connecting voice…");
          setPhase("connecting");
        } else if (st === "failed") {
          setStatusHint("Connection failed — try Call on phone");
          // Attempt ICE restart once
          try {
            if (pc.restartIce) pc.restartIce();
          } catch {
            /* */
          }
        } else if (st === "disconnected") {
          setStatusHint("Reconnecting…");
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setPhase("connected");
          setStatusHint("In-app voice connected");
        } else if (pc.connectionState === "failed") {
          setStatusHint("Connection failed — try Call on phone");
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [attachRemoteStream, sendSignal]
  );

  const joinSessionChannel = useCallback(
    async (
      callId: string,
      onSignal: (p: SignalPayload) => void
    ): Promise<RealtimeChannel | null> => {
      const sb = getAppSupabase();
      if (!sb) return null;
      await leaveSessionChannel();
      const ch = sb.channel(`call-session:${callId}`, {
        config: { broadcast: { self: false } },
      });
      ch.on("broadcast", { event: "signal" }, ({ payload }) => {
        onSignal(payload as SignalPayload);
      });
      const ok = await waitSubscribed(ch, 5000);
      if (!ok) {
        // still keep channel; may recover
        console.warn("call session subscribe slow");
      }
      sessionChRef.current = ch;
      return ch;
    },
    [leaveSessionChannel]
  );

  const handleSignalRef = useRef<(p: SignalPayload) => void>(() => {});

  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      const me = myIdRef.current;
      if (!me || payload.from === me) return;

      if (payload.type === "hangup" || payload.type === "reject") {
        if (callIdRef.current && payload.callId !== callIdRef.current) return;
        playPersonTone(payload.from, "call_end");
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
        if (pc && pc.remoteDescription && payload.candidate) {
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
          if (pc.signalingState === "stable") return; // already set
          await pc.setRemoteDescription(payload.sdp);
          await flushIce(pc);
          setPhase("connecting");
          setStatusHint("Connecting voice…");
        } catch (e) {
          console.warn("answer apply failed", e);
          setStatusHint("Could not connect — try phone");
        }
        return;
      }

      if (payload.type === "offer") {
        const p = phaseRef.current;
        if (p !== "idle" && p !== "ended") return;

        callIdRef.current = payload.callId;
        peerIdRef.current = payload.from;
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
        playPersonTone(payload.from, "call_ring");
        // Ring loop unique to caller
        if (ringTimerRef.current) window.clearInterval(ringTimerRef.current);
        ringTimerRef.current = window.setInterval(() => {
          if (phaseRef.current === "ringing") {
            playPersonTone(payload.from, "call_ring");
          }
        }, 2200);

        // Join session early so ICE/answer path is ready
        void joinSessionChannel(payload.callId, (sig) =>
          handleSignalRef.current(sig)
        );
      }
    },
    [
      clearTimers,
      closePeer,
      flushIce,
      joinSessionChannel,
      leaveSessionChannel,
      stopMedia,
    ]
  );

  useEffect(() => {
    handleSignalRef.current = (p) => {
      void handleSignal(p);
    };
  }, [handleSignal]);

  // Persistent inbox for incoming offers
  useEffect(() => {
    if (!backendUserId) return;
    const sb = getAppSupabase();
    if (!sb) return;

    const ch = sb.channel(`call-inbox:${backendUserId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "signal" }, ({ payload }) => {
      handleSignalRef.current(payload as SignalPayload);
    });
    void waitSubscribed(ch, 5000);

    return () => {
      void sb.removeChannel(ch);
    };
  }, [backendUserId]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || !backendUserId) return;
    unlockAudio();
    setPhase("connecting");
    setStatusHint("Answering…");
    setMode("webrtc");
    callIdRef.current = incoming.callId;
    peerIdRef.current = incoming.from;
    if (ringTimerRef.current) {
      window.clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }

    const local = await ensureLocalMic();
    if (!local) {
      setStatusHint("Allow microphone to answer");
      setPhase("ringing");
      return;
    }

    await joinSessionChannel(incoming.callId, (p) =>
      handleSignalRef.current(p)
    );

    const pc = createPeer(local);
    try {
      await pc.setRemoteDescription(incoming.sdp);
      await flushIce(pc);
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

      failTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== "connected") {
          setStatusHint("Still connecting… try Call on phone if this fails");
        }
      }, 12000);
      failTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== "connected") {
          setStatusHint("Connection failed — try Call on phone");
        }
      }, 25000);
    } catch (e) {
      console.warn("accept failed", e);
      setStatusHint("Could not answer — try phone");
      void endCall();
    }
  }, [
    backendUserId,
    createPeer,
    endCall,
    ensureLocalMic,
    flushIce,
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
    if (ringTimerRef.current) {
      window.clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    setIncoming(null);
    setPhase("idle");
    setTarget(null);
    setMode(null);
    callIdRef.current = null;
    peerIdRef.current = null;
    closePeer();
    await leaveSessionChannel();
  }, [backendUserId, closePeer, incoming, leaveSessionChannel, sendSignal]);

  const startPhoneCall = useCallback(
    (t: CallTarget) => {
      const phone = (t.phone || "").replace(/[^\d+]/g, "");
      if (!phone) return;
      unlockAudio();
      clearTimers();
      stopMedia();
      closePeer();
      void leaveSessionChannel();
      setTarget({ ...t, phone });
      setMode("phone");
      setPhase("dialing");
      setSeconds(0);
      setStatusHint("Opening phone dialer…");
      window.setTimeout(() => {
        openTelDialer(phone);
        setPhase("connected");
        setStatusHint("Phone dialer · stay on this screen");
        timerRef.current = window.setInterval(
          () => setSeconds((s) => s + 1),
          1000
        );
      }, 350);
    },
    [clearTimers, closePeer, leaveSessionChannel, stopMedia]
  );

  const startWebRtcCall = useCallback(
    async (t: CallTarget) => {
      if (!backendUserId || !t.userId) return false;
      if (t.userId === backendUserId) {
        setStatusHint("Cannot call yourself");
        return false;
      }
      unlockAudio();
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
        if ((t.phone || "").replace(/[^\d+]/g, "")) {
          startPhoneCall(t);
          return true;
        }
        setPhase("ended");
        setStatusHint("Microphone needed for in-app call");
        window.setTimeout(() => {
          setPhase("idle");
          setTarget(null);
          setMode(null);
        }, 1600);
        return false;
      }

      // Join session BEFORE offer so answer/ICE have a home
      await joinSessionChannel(callId, (p) => handleSignalRef.current(p));

      const pc = createPeer(local);
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        // Brief wait for first ICE candidates (helps slow mobiles)
        await new Promise((r) => window.setTimeout(r, 400));

        setStatusHint("Ringing…");
        setPhase("ringing");
        playPersonTone(t.userId, "call_ring");
        ringTimerRef.current = window.setInterval(() => {
          if (phaseRef.current === "ringing") {
            playPersonTone(t.userId!, "call_ring");
          }
        }, 2200);

        await sendSignal(t.userId, {
          type: "offer",
          callId,
          from: backendUserId,
          fromName: myName,
          fromPhoto: myPhoto || undefined,
          fromRole: myRole,
          sdp: pc.localDescription || offer,
        });
        makingOfferRef.current = false;

        failTimerRef.current = window.setTimeout(() => {
          if (phaseRef.current === "ringing") {
            setStatusHint("No answer yet…");
          }
        }, 15000);
        failTimerRef.current = window.setTimeout(() => {
          if (
            phaseRef.current !== "connected" &&
            phaseRef.current !== "idle" &&
            phaseRef.current !== "ended"
          ) {
            setStatusHint("Connection failed — try Call on phone");
            if ((t.phone || "").replace(/[^\d+]/g, "")) {
              // soft fail — user can tap phone
            }
          }
        }, 28000);

        return true;
      } catch (e) {
        console.warn("offer failed", e);
        makingOfferRef.current = false;
        if ((t.phone || "").replace(/[^\d+]/g, "")) {
          startPhoneCall(t);
          return true;
        }
        setStatusHint("Could not start call");
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
      joinSessionChannel,
      leaveSessionChannel,
      myName,
      myPhoto,
      myRole,
      sendSignal,
      startPhoneCall,
      stopMedia,
    ]
  );

  const startCall = useCallback(
    (t: CallTarget) => {
      unlockAudio();
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
      if (remoteAudioRef.current) {
        try {
          remoteAudioRef.current.remove();
        } catch {
          /* */
        }
        remoteAudioRef.current = null;
      }
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
      remoteAudioRef.current.volume = speaker ? 1 : 0.12;
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
                <p className="mt-3 max-w-[280px] text-center text-[11px] leading-snug text-white/55">
                  {statusHint}
                </p>
              )}

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

              {mode === "webrtc" &&
                phase !== "ringing" &&
                phase !== "connected" &&
                (target.phone || "").replace(/[^\d+]/g, "") && (
                  <button
                    type="button"
                    onClick={() => startPhoneCall(target)}
                    className="mt-5 rounded-md border-0 bg-[#e07a3d] px-4 py-2.5 text-[12px] font-bold text-white"
                  >
                    Call on phone line
                  </button>
                )}

              {mode === "webrtc" &&
                phase === "connected" &&
                (target.phone || "").replace(/[^\d+]/g, "") && (
                  <button
                    type="button"
                    onClick={() => startPhoneCall(target)}
                    className="mt-4 border-0 bg-transparent text-[12px] font-bold text-brand"
                  >
                    Switch to phone line
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
        unlockAudio();
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
