"use client";

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, Mic, Send, Square } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { useNotificationsOptional } from "@/components/notifications/notification-provider";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  CONVERSATION_ENDED_MESSAGE,
  isJobEndedStatus,
  isReadOnlyChatUrl,
} from "@/lib/chat-expired";
import { apiGetJob } from "@/lib/jobs/client";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  backendSubscribeMessages,
  type MessageRow,
} from "@/lib/supabase/app-api";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { unlockAudio } from "@/lib/sound-tone";
import {
  blobToDataUrl,
  createMediaRecorder,
  getMicStream,
  waitRecorderStart,
} from "@/lib/voice-record";
import type { ChatMessage } from "@/lib/types";

/**
 * Single job chat: Motorist ↔ Repair Pro.
 * Polls + Realtime so both parties see each other's messages.
 * Ended jobs: popup → View (read-only) or OK (leave list).
 */
export default function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#c8c9cd]">
          <p className="text-sm font-semibold text-slate-700">Loading chat…</p>
        </div>
      }
    >
      <ChatThreadInner params={params} />
    </Suspense>
  );
}

function ChatThreadInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const intentionalViewOnly = isReadOnlyChatUrl(searchParams);
  const {
    visibleMessageThreads,
    sendChatMessage,
    refreshCloudChats,
    markThreadRead,
    theme,
    accountType,
    backendUserId,
  } = useApp();
  const notif = useNotificationsOptional();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const thread = visibleMessageThreads.find((t) => t.id === id);
  /** Back to the request/job — never a standalone messages inbox */
  const requestBackHref = (() => {
    const rid = thread?.requestId;
    if (rid && !rid.startsWith("chat-") && !rid.startsWith("demo-")) {
      return isPro ? `/jobs/${rid}` : `/jobs/${rid}`;
    }
    return isPro ? "/jobs" : "/requests";
  })();
  const [draft, setDraft] = useState("");
  /** idle | arming | recording | saving */
  const [recPhase, setRecPhase] = useState<
    "idle" | "arming" | "recording" | "saving"
  >("idle");
  const recording = recPhase === "recording";
  const recBusy = recPhase === "arming" || recPhase === "saving";
  const [pendingVoice, setPendingVoice] = useState<{
    url: string;
    durationSec: number;
    mime: string;
  } | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  /** Job ended — no send */
  const [chatClosed, setChatClosed] = useState(false);
  /** 2B mid-session end: popup until View (read-only) or OK (leave) */
  const [expiredOpen, setExpiredOpen] = useState(false);
  const promptedForEnd = useRef(false);
  /** Other party is typing (Realtime broadcast) */
  const [otherTyping, setOtherTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const stopLock = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typingChannelRef = useRef<any>(null);
  const typingStopTimer = useRef<number | null>(null);
  const lastTypingSent = useRef(0);

  // Pull server messages once open; Realtime handles inserts — rare poll backup
  useEffect(() => {
    refreshCloudChats();
    const t = window.setInterval(() => {
      if (document.hidden) return;
      refreshCloudChats();
    }, 120_000);
    return () => window.clearInterval(t);
  }, [refreshCloudChats, id]);

  // Mark thread + related message notifications as read when open / new msgs arrive
  useEffect(() => {
    if (!id || !thread) return;
    markThreadRead(id);
    if (notif) {
      const ids = notif.notifications
        .filter(
          (n) =>
            !n.readAt &&
            n.category === "messages" &&
            (n.href === `/messages/${id}` ||
              n.href === `/messages/${thread.id}` ||
              (thread.requestId != null && n.jobId === thread.requestId))
        )
        .map((n) => n.id);
      if (ids.length) void notif.markRead(ids);
    }
  }, [id, thread?.id, thread?.messages.length, markThreadRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // Job ended: lock send. Without ?view=1 → popup (View = read-only, OK = leave).
  useEffect(() => {
    const rid = thread?.requestId;
    if (!rid || rid.startsWith("chat-") || rid.startsWith("demo-")) {
      setChatClosed(false);
      return;
    }
    let cancelled = false;

    const check = () => {
      void apiGetJob(rid).then((res) => {
        if (cancelled || !res.ok) return;
        const ended = isJobEndedStatus(res.data.job.status);
        if (!ended) {
          setChatClosed(false);
          promptedForEnd.current = false;
          return;
        }
        setChatClosed(true);
        // Intentional View (?view=1) → stay read-only, no kick
        if (intentionalViewOnly) return;
        // 2B: mid-session or deep-link without View → offer popup once
        if (!promptedForEnd.current) {
          promptedForEnd.current = true;
          setExpiredOpen(true);
        }
      });
    };

    check();
    const t = window.setInterval(() => {
      if (document.hidden) return;
      check();
    }, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [thread?.requestId, intentionalViewOnly]);

  const onExpiredOk = useCallback(() => {
    setExpiredOpen(false);
    const rid = thread?.requestId;
    if (rid && !rid.startsWith("chat-") && !rid.startsWith("demo-")) {
      router.replace(isPro ? `/jobs/${rid}` : `/requests/${rid}`);
      return;
    }
    router.replace(isPro ? "/jobs" : "/requests");
  }, [router, thread?.requestId, isPro]);

  // Realtime inserts for this conversation (when id is a real UUID)
  useEffect(() => {
    if (!id || id.startsWith("chat-") || !backendUserId) return;
    const unsub = backendSubscribeMessages(id, (_row: MessageRow) => {
      refreshCloudChats();
      markThreadRead(id);
    });
    return () => {
      unsub?.();
    };
  }, [id, backendUserId, refreshCloudChats, markThreadRead]);

  // Typing indicator channel (broadcast — no extra DB rows)
  useEffect(() => {
    if (!id || id.startsWith("chat-") || !backendUserId || chatClosed) {
      setOtherTyping(false);
      return;
    }
    let sb: ReturnType<typeof createBrowserSupabase> | null = null;
    try {
      sb = createBrowserSupabase();
    } catch {
      return;
    }
    if (!sb) return;
    const channel = sb.channel(`om-typing:${id}-${Math.random().toString(36).slice(2, 8)}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on(
        "broadcast",
        { event: "typing" },
        (payload: { payload?: { userId?: string; typing?: boolean } }) => {
          const p = payload.payload;
          if (!p || p.userId === backendUserId) return;
          setOtherTyping(Boolean(p.typing));
          if (typingStopTimer.current) {
            window.clearTimeout(typingStopTimer.current);
          }
          if (p.typing) {
            typingStopTimer.current = window.setTimeout(() => {
              setOtherTyping(false);
            }, 3500);
          }
        }
      )
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      setOtherTyping(false);
      if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
      void sb.removeChannel(channel);
    };
  }, [id, backendUserId, chatClosed]);

  const broadcastTyping = useCallback(
    (typing: boolean) => {
      const ch = typingChannelRef.current;
      if (!ch || !backendUserId || chatClosed) return;
      const now = Date.now();
      // Throttle typing=true to ~1.2s
      if (typing && now - lastTypingSent.current < 1200) return;
      if (typing) lastTypingSent.current = now;
      void ch.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: backendUserId, typing },
      });
    },
    [backendUserId, chatClosed]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, pendingVoice, otherTyping]);

  useEffect(() => {
    return () => {
      try {
        mediaRef.current?.stop();
      } catch {
        /* */
      }
    };
  }, []);

  if (!thread) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <PageHeader
          title="Chat"
          backHref={isPro ? "/jobs" : "/requests"}
        />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6">
          <p
            className={cn(
              "font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Loading chat…
          </p>
          <p className="text-center text-xs text-muted">
            Chat is tied to a request. Open Message from your job if it does
            not appear.
          </p>
          <button
            type="button"
            className="mt-2 border-0 bg-transparent text-sm font-bold text-brand"
            onClick={() => {
              refreshCloudChats();
              router.push(isPro ? "/jobs" : "/requests");
            }}
          >
            Back to {isPro ? "jobs" : "requests"}
          </button>
        </div>
      </div>
    );
  }

  const title = isPro ? thread.motoristName : thread.technicianName;
  const subtitle = chatClosed
    ? `${PRO_SERVICE_LABELS[thread.serviceType] ?? thread.serviceType} · read only`
    : `${PRO_SERVICE_LABELS[thread.serviceType] ?? thread.serviceType} · job chat`;

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* */
      }
    });
    streamRef.current = null;
  };

  const startRec = async () => {
    if (chatClosed || recPhase !== "idle" || stopLock.current) return;
    setRecError(null);
    setRecPhase("arming");
    if (typeof MediaRecorder === "undefined") {
      setRecError("Voice not supported on this device");
      setRecPhase("idle");
      return;
    }
    try {
      const stream = await getMicStream();
      streamRef.current = stream;
      const rec = createMediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data?.size) chunks.current.push(e.data);
      };
      rec.onerror = () => {
        setRecError("Recording failed");
        releaseMic();
        mediaRef.current = null;
        setRecPhase("idle");
      };
      mediaRef.current = rec;
      // 1s timeslice — less main-thread work than 200ms chunks
      rec.start(1000);
      await waitRecorderStart(rec);
      startedAt.current = Date.now();
      setRecPhase("recording");
    } catch {
      releaseMic();
      mediaRef.current = null;
      setRecError("Allow microphone to send a voice note");
      setRecPhase("idle");
    }
  };

  const stopRec = () => {
    if (stopLock.current) return;
    const rec = mediaRef.current;
    if (!rec || rec.state === "inactive") {
      setRecPhase("idle");
      return;
    }
    stopLock.current = true;
    // Leave recording UI immediately so Stop does not feel stuck while encoding
    setRecPhase("saving");
    const blobType = rec.mimeType || "audio/webm";
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - startedAt.current) / 1000)
    );

    rec.onstop = () => {
      releaseMic();
      mediaRef.current = null;
      void (async () => {
        try {
          const blob = new Blob(chunks.current, { type: blobType });
          if (!blob.size) {
            setRecError("No audio captured");
            setRecPhase("idle");
            return;
          }
          // Yield so "Saving" paints before FileReader work
          await new Promise((r) => window.setTimeout(r, 0));
          const url = await blobToDataUrl(blob);
          setPendingVoice({ url, durationSec, mime: blobType });
          setRecPhase("idle");
        } catch {
          setRecError("Could not save voice note");
          setRecPhase("idle");
        } finally {
          stopLock.current = false;
        }
      })();
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
        // Already stopped — finish via the same onstop path
        const handler = rec.onstop;
        if (typeof handler === "function") {
          handler.call(rec, new Event("stop"));
        } else {
          releaseMic();
          mediaRef.current = null;
          setRecPhase("idle");
          stopLock.current = false;
        }
      }
    } catch {
      releaseMic();
      mediaRef.current = null;
      setRecPhase("idle");
      stopLock.current = false;
    }
  };

  const send = () => {
    if (chatClosed) return;
    if (!draft.trim() && !pendingVoice) return;
    unlockAudio();
    broadcastTyping(false);
    sendChatMessage(thread.id, draft, pendingVoice);
    setDraft("");
    setPendingVoice(null);
  };

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title={title} subtitle={subtitle} backHref={requestBackHref} />

      {chatClosed && (intentionalViewOnly || !expiredOpen) && (
        <div
          className={cn(
            "flex shrink-0 items-start gap-2 px-3 py-2",
            isLight ? "text-slate-800" : "text-white/85"
          )}
        >
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6B35]" />
          <p className="text-[11px] font-medium leading-snug">
            {CONVERSATION_ENDED_MESSAGE}
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-2 scrollbar-hide">
        {thread.messages.map((msg: ChatMessage) => {
          if (msg.sender === "system") {
            return (
              <p
                key={msg.id}
                className="px-2 text-center text-[10px] text-muted"
              >
                {msg.text}
              </p>
            );
          }
          const mine =
            (isPro && msg.sender === "professional") ||
            (!isPro && msg.sender === "motorist");
          return (
            <div
              key={msg.id}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] space-y-1.5 rounded-2xl px-3 py-2 text-[13px] leading-snug",
                  mine ? "rounded-br-md" : "rounded-bl-md",
                  // Soft greys that blend into light (#c8c9cd) and dark (black) shells
                  mine
                    ? isLight
                      ? "bg-[#a8a9ae] text-slate-900"
                      : "bg-[#3a3a3c] text-white"
                    : isLight
                      ? "bg-[#b4b5ba] text-slate-900"
                      : "bg-[#2c2c2e] text-white/95"
                )}
                style={
                  mine
                    ? {
                        boxShadow: isLight
                          ? "inset 0 1px 0 rgba(255,255,255,0.35)"
                          : "inset 0 1px 0 rgba(255,255,255,0.06)",
                      }
                    : {
                        boxShadow: isLight
                          ? "inset 0 1px 0 rgba(255,255,255,0.4)"
                          : "inset 0 1px 0 rgba(255,255,255,0.04)",
                      }
                }
              >
                {msg.text && msg.text !== "Voice note" && <p>{msg.text}</p>}
                {msg.voiceUrl && (
                  <VoiceNotePlayer
                    url={msg.voiceUrl}
                    durationSec={msg.voiceDurationSec}
                    isLight={mine ? false : isLight}
                    label={mine ? "Your voice" : "Voice note"}
                    className={mine ? "bg-black/20" : undefined}
                  />
                )}
                {msg.voiceUrl && (!msg.text || msg.text === "Voice note") && (
                  <span className="sr-only">Voice note</span>
                )}
              </div>
            </div>
          );
        })}
        {otherTyping && !chatClosed && (
          <p
            className={cn(
              "px-2 text-[12px] italic transition-opacity duration-200",
              isLight ? "text-slate-600" : "text-white/65"
            )}
            aria-live="polite"
          >
            Typing…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {!chatClosed && pendingVoice && (
        <div className="px-3 pb-1">
          <VoiceNotePlayer
            url={pendingVoice.url}
            durationSec={pendingVoice.durationSec}
            isLight={isLight}
            label="Preview · play before send"
          />
          <button
            type="button"
            onClick={() => setPendingVoice(null)}
            className="mt-1 border-0 bg-transparent text-[11px] font-bold text-[#FF6B35]"
          >
            Discard voice
          </button>
        </div>
      )}
      {!chatClosed && recError && (
        <p className="px-3 text-[11px] font-semibold text-red-500">{recError}</p>
      )}

      {chatClosed ? (
        <div
          className={cn(
            "shrink-0 border-t px-3 py-3 text-center text-[12px] font-medium",
            isLight
              ? "border-black/10 text-slate-700"
              : "border-white/10 text-white/70"
          )}
        >
          Chat closed · view only
        </div>
      ) : (
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-t px-3 py-2",
          isLight
            ? "border-black/10 bg-[#c8c9cd]"
            : "border-white/10 bg-black"
        )}
      >
        <button
          type="button"
          disabled={recBusy}
          onClick={() => (recording ? stopRec() : void startRec())}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 text-white disabled:opacity-70",
            recording || recPhase === "saving"
              ? "bg-red-500"
              : "bg-[#FF6B35]"
          )}
          aria-label={
            recording
              ? "Stop recording"
              : recPhase === "arming"
                ? "Starting microphone"
                : recPhase === "saving"
                  ? "Saving voice note"
                  : "Record voice note"
          }
        >
          {recPhase === "arming" || recPhase === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : recording ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            if (v.trim()) broadcastTyping(true);
            else broadcastTyping(false);
          }}
          onBlur={() => broadcastTyping(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            recPhase === "arming"
              ? "Starting mic…"
              : recording
                ? "Recording…"
                : recPhase === "saving"
                  ? "Saving voice…"
                  : "Type a message…"
          }
          disabled={recording || recBusy}
          className={cn(
            "h-10 min-w-0 flex-1 rounded-full border-0 px-4 text-[13px] outline-none",
            isLight
              ? "bg-[#bebfc4] text-slate-900 placeholder:text-slate-500"
              : "bg-neutral-900 text-white placeholder:text-white/40"
          )}
        />
        <button
          type="button"
          onClick={send}
          disabled={
            recording || recBusy || (!draft.trim() && !pendingVoice)
          }
          className="flex h-10 w-10 items-center justify-center rounded-full border-0 bg-brand text-white disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      )}

      <ExpiredDialog
        open={expiredOpen}
        isLight={isLight}
        message={CONVERSATION_ENDED_MESSAGE}
        onClose={onExpiredOk}
        okLabel="OK"
      />
    </div>
  );
}
