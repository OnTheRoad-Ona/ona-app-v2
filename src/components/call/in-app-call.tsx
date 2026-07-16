"use client";

/**
 * In-app voice:
 * 1) WebRTC with durable HTTP signaling (/api/call/signal) + STUN/TURN
 * 2) Auto phone dialer fallback if peer not connected in ~8s
 *
 * Previous failures: Realtime broadcast-only signaling dropped offers on mobile;
 * STUN-only ICE failed behind carrier NAT.
 */

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
import {
  pollCallSignals,
  postCallSignal,
  type CallSignalRow,
} from "@/lib/call-signal";
import { playPersonTone, unlockAudio } from "@/lib/sound-tone";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export type CallTarget = {
  name: string;
  phone?: string;
  photo?: string;
  roleLabel?: string;
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

const CallContext = createContext<CallContextValue | null>(null);

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:80?transport=tcp",
      "turn:openrelay.metered.ca:443",
      "turns:openrelay.metered.ca:443?transport=tcp",
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
    a.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(a);
    a.click();
    window.requestAnimationFrame(() => a.remove());
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

function isUuid(s: string | undefined | null): boolean {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

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
  const phoneRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);
  const failTimerRef = useRef<number | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const phaseRef = useRef<CallPhase>("idle");
  const myIdRef = useRef<string | null>(null);
  const processedIds = useRef<Set<string>>(new Set());
  const targetRef = useRef<CallTarget | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    myIdRef.current = backendUserId;
  }, [backendUserId]);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

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
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
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

  const pushSignal = useCallback(
    async (
      toUserId: string,
      kind: "offer" | "answer" | "ice" | "hangup" | "reject",
      callId: string,
      payload: Record<string, unknown>
    ) => {
      const me = myIdRef.current;
      if (!me || !isUuid(toUserId) || !isUuid(me)) return "invalid ids";
      return postCallSignal({
        callId,
        toUserId,
        fromUserId: me,
        kind,
        payload,
      });
    },
    []
  );

  const fallToPhone = useCallback(
    (reason: string) => {
      const phone = phoneRef.current.replace(/[^\d+]/g, "");
      if (!phone) {
        setStatusHint(reason || "Call failed");
        return false;
      }
      setMode("phone");
      setPhase("dialing");
      setStatusHint("Opening phone line…");
      clearTimers();
      stopMedia();
      closePeer();
      window.setTimeout(() => {
        openTelDialer(phone);
        setPhase("connected");
        setStatusHint("Phone dialer open");
        timerRef.current = window.setInterval(
          () => setSeconds((s) => s + 1),
          1000
        );
      }, 300);
      return true;
    },
    [clearTimers, closePeer, stopMedia]
  );

  const endCall = useCallback(async () => {
    const peer = peerIdRef.current;
    const callId = callIdRef.current;
    if (peer && callId) {
      void pushSignal(peer, "hangup", callId, {});
    }
    playPersonTone(peer || myIdRef.current || "self", "call_end");
    clearTimers();
    stopMedia();
    closePeer();
    callIdRef.current = null;
    peerIdRef.current = null;
    phoneRef.current = "";
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
  }, [clearTimers, closePeer, pushSignal, stopMedia]);

  const attachRemote = useCallback((stream: MediaStream) => {
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

  const ensureMic = useCallback(async () => {
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
    const list = pendingIceRef.current.splice(0);
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* */
      }
    }
  }, []);

  const markConnected = useCallback(() => {
    setPhase("connected");
    setStatusHint("In-app voice connected");
    if (!timerRef.current) {
      timerRef.current = window.setInterval(
        () => setSeconds((s) => s + 1),
        1000
      );
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

  const createPeer = useCallback(
    (local: MediaStream) => {
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 8,
      });

      // Only add local tracks — do NOT also addTransceiver (that broke SDP)
      local.getAudioTracks().forEach((track) => {
        pc.addTrack(track, local);
      });

      pc.ontrack = (ev) => {
        const stream =
          ev.streams[0] ||
          (ev.track ? new MediaStream([ev.track]) : null);
        if (stream) attachRemote(stream);
      };

      pc.onicecandidate = (ev) => {
        const peer = peerIdRef.current;
        const callId = callIdRef.current;
        if (!ev.candidate || !peer || !callId) return;
        void pushSignal(peer, "ice", callId, {
          candidate: ev.candidate.toJSON(),
        });
      };

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        if (st === "connected" || st === "completed") {
          markConnected();
        } else if (st === "failed") {
          if (!fallToPhone("WebRTC failed")) {
            setStatusHint("Connection failed — try Call on phone");
          }
        } else if (st === "checking") {
          setPhase("connecting");
          setStatusHint("Connecting voice…");
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") markConnected();
        if (pc.connectionState === "failed") {
          if (!fallToPhone("Connection failed")) {
            setStatusHint("Connection failed — try Call on phone");
          }
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [attachRemote, fallToPhone, markConnected, pushSignal]
  );

  const processSignal = useCallback(
    async (row: CallSignalRow) => {
      if (processedIds.current.has(row.id)) return;
      processedIds.current.add(row.id);
      // Bound set size
      if (processedIds.current.size > 200) {
        processedIds.current = new Set([...processedIds.current].slice(-80));
      }

      const me = myIdRef.current;
      if (!me || row.from === me) return;

      if (row.kind === "hangup" || row.kind === "reject") {
        if (callIdRef.current && row.callId !== callIdRef.current) return;
        playPersonTone(row.from, "call_end");
        clearTimers();
        stopMedia();
        closePeer();
        callIdRef.current = null;
        peerIdRef.current = null;
        setIncoming(null);
        setPhase("ended");
        setStatusHint(row.kind === "reject" ? "Call declined" : "Call ended");
        window.setTimeout(() => {
          setTarget(null);
          setPhase("idle");
          setMode(null);
          setSeconds(0);
          setStatusHint("");
        }, 1000);
        return;
      }

      if (row.kind === "ice") {
        if (callIdRef.current && row.callId !== callIdRef.current) return;
        const cand = row.payload.candidate as RTCIceCandidateInit | undefined;
        if (!cand) return;
        const pc = pcRef.current;
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(cand);
          } catch {
            pendingIceRef.current.push(cand);
          }
        } else {
          pendingIceRef.current.push(cand);
        }
        return;
      }

      if (row.kind === "answer") {
        if (callIdRef.current && row.callId !== callIdRef.current) return;
        const pc = pcRef.current;
        const sdp = row.payload.sdp as RTCSessionDescriptionInit | undefined;
        if (!pc || !sdp) return;
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(sdp);
            await flushIce(pc);
            setPhase("connecting");
            setStatusHint("Connecting voice…");
          }
        } catch (e) {
          console.warn("answer", e);
          if (!fallToPhone("Answer failed")) {
            setStatusHint("Could not connect — try phone");
          }
        }
        return;
      }

      if (row.kind === "offer") {
        const p = phaseRef.current;
        if (p !== "idle" && p !== "ended") return;
        const sdp = row.payload.sdp as RTCSessionDescriptionInit | undefined;
        if (!sdp) return;
        const fromName = String(row.payload.fromName || "Caller");
        const fromPhoto = row.payload.fromPhoto
          ? String(row.payload.fromPhoto)
          : undefined;
        const fromRole = row.payload.fromRole
          ? String(row.payload.fromRole)
          : undefined;

        callIdRef.current = row.callId;
        peerIdRef.current = row.from;
        setIncoming({
          callId: row.callId,
          from: row.from,
          fromName,
          fromPhoto,
          fromRole,
          sdp,
        });
        setPhase("ringing");
        setMode("webrtc");
        setTarget({
          name: fromName,
          photo: fromPhoto,
          roleLabel: fromRole || "Incoming",
          userId: row.from,
        });
        playPersonTone(row.from, "call_ring");
        if (ringTimerRef.current) window.clearInterval(ringTimerRef.current);
        ringTimerRef.current = window.setInterval(() => {
          if (phaseRef.current === "ringing") {
            playPersonTone(row.from, "call_ring");
          }
        }, 2200);
      }
    },
    [clearTimers, closePeer, fallToPhone, flushIce, stopMedia]
  );

  // Poll durable signal inbox (works even when Realtime broadcast drops)
  useEffect(() => {
    if (!backendUserId || !isUuid(backendUserId)) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.hidden) return;
      const rows = await pollCallSignals(backendUserId);
      for (const r of rows) {
        await processSignal(r);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [backendUserId, processSignal]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || !backendUserId) return;
    unlockAudio();
    if (ringTimerRef.current) {
      window.clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    setPhase("connecting");
    setStatusHint("Answering…");
    callIdRef.current = incoming.callId;
    peerIdRef.current = incoming.from;

    const local = await ensureMic();
    if (!local) {
      setStatusHint("Allow microphone to answer");
      setPhase("ringing");
      return;
    }

    const pc = createPeer(local);
    try {
      await pc.setRemoteDescription(incoming.sdp);
      await flushIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      // Wait a moment for ICE gathering to start
      await new Promise((r) => setTimeout(r, 300));
      const err = await pushSignal(incoming.from, "answer", incoming.callId, {
        sdp: pc.localDescription || answer,
      });
      if (err) {
        setStatusHint(err);
      }
      setIncoming(null);
      setStatusHint("Connecting voice…");
      failTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== "connected") {
          fallToPhone("Slow connect — using phone");
        }
      }, 10000);
    } catch (e) {
      console.warn("accept", e);
      if (!fallToPhone("Answer failed")) {
        setStatusHint("Could not answer");
        void endCall();
      }
    }
  }, [
    backendUserId,
    createPeer,
    endCall,
    ensureMic,
    fallToPhone,
    flushIce,
    incoming,
    pushSignal,
  ]);

  const rejectIncoming = useCallback(async () => {
    if (incoming) {
      void pushSignal(incoming.from, "reject", incoming.callId, {});
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
  }, [closePeer, incoming, pushSignal]);

  const startPhoneCall = useCallback(
    (t: CallTarget) => {
      const phone = (t.phone || "").replace(/[^\d+]/g, "");
      if (!phone) {
        setStatusHint("No phone number on file");
        return;
      }
      unlockAudio();
      phoneRef.current = phone;
      clearTimers();
      stopMedia();
      closePeer();
      setTarget({ ...t, phone });
      setMode("phone");
      setPhase("dialing");
      setSeconds(0);
      setStatusHint("Opening phone dialer…");
      window.setTimeout(() => {
        openTelDialer(phone);
        setPhase("connected");
        setStatusHint("Phone dialer open");
        timerRef.current = window.setInterval(
          () => setSeconds((s) => s + 1),
          1000
        );
      }, 300);
    },
    [clearTimers, closePeer, stopMedia]
  );

  const startWebRtcCall = useCallback(
    async (t: CallTarget) => {
      if (!backendUserId || !t.userId || !isUuid(t.userId)) {
        if (t.phone) {
          startPhoneCall(t);
          return true;
        }
        return false;
      }
      unlockAudio();
      clearTimers();
      stopMedia();
      closePeer();

      const callId = newCallId();
      callIdRef.current = callId;
      peerIdRef.current = t.userId;
      phoneRef.current = (t.phone || "").replace(/[^\d+]/g, "");
      setTarget(t);
      setMode("webrtc");
      setPhase("dialing");
      setSeconds(0);
      setStatusHint("Starting in-app call…");
      setIncoming(null);

      const local = await ensureMic();
      if (!local) {
        if (phoneRef.current) {
          startPhoneCall(t);
          return true;
        }
        setStatusHint("Microphone permission needed");
        setPhase("ended");
        window.setTimeout(() => {
          setPhase("idle");
          setTarget(null);
        }, 1500);
        return false;
      }

      const pc = createPeer(local);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        await new Promise((r) => setTimeout(r, 350));

        setPhase("ringing");
        setStatusHint("Ringing… (keep both apps open)");
        playPersonTone(t.userId, "call_ring");
        ringTimerRef.current = window.setInterval(() => {
          if (phaseRef.current === "ringing") {
            playPersonTone(t.userId!, "call_ring");
          }
        }, 2200);

        const err = await pushSignal(t.userId, "offer", callId, {
          sdp: pc.localDescription || offer,
          fromName: myName,
          fromPhoto: myPhoto || null,
          fromRole: myRole,
        });
        if (err) {
          // Table missing or network — go straight to phone
          if (phoneRef.current) {
            fallToPhone("In-app signaling unavailable");
            return true;
          }
          setStatusHint(err);
          void endCall();
          return false;
        }

        // Fast auto-fallback to phone if peer never connects
        failTimerRef.current = window.setTimeout(() => {
          if (
            phaseRef.current !== "connected" &&
            phaseRef.current !== "idle" &&
            phaseRef.current !== "ended"
          ) {
            if (!fallToPhone("No answer on in-app — phone line")) {
              setStatusHint("No answer — try again or use Message");
            }
          }
        }, 12000);

        return true;
      } catch (e) {
        console.warn("offer", e);
        if (phoneRef.current) {
          fallToPhone("Could not start WebRTC");
          return true;
        }
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
      ensureMic,
      fallToPhone,
      myName,
      myPhoto,
      myRole,
      pushSignal,
      startPhoneCall,
      stopMedia,
    ]
  );

  const startCall = useCallback(
    (t: CallTarget) => {
      unlockAudio();
      const peerOk = Boolean(t.userId && isUuid(t.userId) && backendUserId);
      const phoneOk = Boolean((t.phone || "").replace(/[^\d+]/g, ""));

      // Prefer WebRTC when peer id is real UUID; else phone
      if (peerOk) {
        void startWebRtcCall(t);
        return;
      }
      if (phoneOk) {
        startPhoneCall(t);
        return;
      }
      setTarget(t);
      setPhase("ended");
      setStatusHint("No phone or in-app peer on file");
      window.setTimeout(() => {
        setPhase("idle");
        setTarget(null);
      }, 1800);
    },
    [backendUserId, startPhoneCall, startWebRtcCall]
  );

  useEffect(() => {
    return () => {
      clearTimers();
      stopMedia();
      closePeer();
      if (remoteAudioRef.current) {
        try {
          remoteAudioRef.current.remove();
        } catch {
          /* */
        }
        remoteAudioRef.current = null;
      }
    };
  }, [clearTimers, closePeer, stopMedia]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((tr) => {
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

  const phaseLabel =
    phase === "dialing"
      ? "Calling…"
      : phase === "ringing" && incoming
        ? "Incoming call"
        : phase === "ringing"
          ? "Ringing…"
          : phase === "connecting"
            ? "Connecting…"
            : phase === "connected"
              ? formatDuration(seconds)
              : phase === "ended"
                ? "Call ended"
                : "";

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
              {mode === "phone" && (
                <p className="mt-1 rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                  Phone line
                </p>
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
                    className="flex h-12 flex-1 items-center justify-center rounded-md border-0 bg-red-500 text-[13px] font-bold text-white"
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
                phase !== "connected" &&
                phase !== "ringing" &&
                (target.phone || "").replace(/[^\d+]/g, "") && (
                  <button
                    type="button"
                    onClick={() => startPhoneCall(target)}
                    className="mt-5 rounded-md border-0 bg-[#e07a3d] px-4 py-2.5 text-[12px] font-bold text-white"
                  >
                    Call on phone line now
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
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void endCall()}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-0 bg-red-500 text-white"
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
                  aria-label="Speaker"
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
  const hasPeer = Boolean(target.userId && isUuid(target.userId));
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
