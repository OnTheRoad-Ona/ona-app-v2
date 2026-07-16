"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mic, Send, Square } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { apiGetJob } from "@/lib/jobs/client";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  backendSubscribeMessages,
  type MessageRow,
} from "@/lib/supabase/app-api";
import { unlockAudio } from "@/lib/sound-tone";
import type { ChatMessage } from "@/lib/types";

/** Chat stays readable forever after job is done — send is locked */
const CHAT_CLOSED_STATUSES = new Set([
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "refunded",
]);

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

/**
 * Single job chat: Motorist ↔ Repair Pro.
 * Polls + Realtime so both parties see each other's messages.
 */
export default function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    visibleMessageThreads,
    sendChatMessage,
    refreshCloudChats,
    theme,
    accountType,
    backendUserId,
  } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const thread = visibleMessageThreads.find((t) => t.id === id);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<{
    url: string;
    durationSec: number;
    mime: string;
  } | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  /** After satisfied/released — history only, no new messages */
  const [chatClosed, setChatClosed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  // Pull server messages so the other party's chat appears
  useEffect(() => {
    refreshCloudChats();
    const t = window.setInterval(() => {
      if (document.hidden) return;
      refreshCloudChats();
    }, 5000);
    return () => window.clearInterval(t);
  }, [refreshCloudChats, id]);

  // Lock send forever once the linked job is finished / closed
  useEffect(() => {
    const rid = thread?.requestId;
    if (!rid || rid.startsWith("chat-")) {
      setChatClosed(false);
      return;
    }
    let cancelled = false;
    void apiGetJob(rid).then((res) => {
      if (cancelled || !res.ok) return;
      setChatClosed(CHAT_CLOSED_STATUSES.has(res.data.job.status));
    });
    return () => {
      cancelled = true;
    };
  }, [thread?.requestId]);

  // Realtime inserts for this conversation (when id is a real UUID)
  useEffect(() => {
    if (!id || id.startsWith("chat-") || !backendUserId) return;
    const unsub = backendSubscribeMessages(id, (_row: MessageRow) => {
      refreshCloudChats();
    });
    return () => {
      unsub?.();
    };
  }, [id, backendUserId, refreshCloudChats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, pendingVoice]);

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
        <PageHeader title="Chat" backHref="/messages" />
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
            Syncing messages with the server.
          </p>
          <button
            type="button"
            className="mt-2 border-0 bg-transparent text-sm font-bold text-brand"
            onClick={() => {
              refreshCloudChats();
              router.push("/messages");
            }}
          >
            Back to messages
          </button>
        </div>
      </div>
    );
  }

  const title = isPro ? thread.motoristName : thread.technicianName;
  const subtitle = chatClosed
    ? `${PRO_SERVICE_LABELS[thread.serviceType] ?? thread.serviceType} · read only`
    : `${PRO_SERVICE_LABELS[thread.serviceType] ?? thread.serviceType} · job chat`;

  const startRec = async () => {
    if (chatClosed) return;
    setRecError(null);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setRecError("Voice not supported on this device");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data?.size) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blobType = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        if (!blob.size) {
          setRecError("No audio captured");
          setRecording(false);
          return;
        }
        const durationSec = Math.max(
          1,
          Math.round((Date.now() - startedAt.current) / 1000)
        );
        const url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("read failed"));
          r.readAsDataURL(blob);
        });
        setPendingVoice({ url, durationSec, mime: blobType });
        setRecording(false);
      };
      mediaRef.current = rec;
      startedAt.current = Date.now();
      rec.start(200);
      setRecording(true);
    } catch {
      setRecError("Allow microphone to send a voice note");
    }
  };

  const stopRec = () => {
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

  const send = () => {
    if (chatClosed) return;
    if (!draft.trim() && !pendingVoice) return;
    unlockAudio();
    sendChatMessage(thread.id, draft, pendingVoice);
    setDraft("");
    setPendingVoice(null);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title={title} subtitle={subtitle} backHref="/messages" />

      {chatClosed && (
        <div
          className={cn(
            "flex shrink-0 items-start gap-2 px-3 py-2",
            isLight ? "text-slate-800" : "text-white/85"
          )}
        >
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e07a3d]" />
          <p className="text-[11px] font-medium leading-snug">
            This job is finished. Chat is closed forever — you can still read
            messages, but you cannot send new ones.
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
                  mine
                    ? "rounded-br-md bg-brand text-white"
                    : isLight
                      ? "rounded-bl-md bg-[#bebfc4] text-slate-900"
                      : "rounded-bl-md bg-neutral-900 text-white"
                )}
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
            className="mt-1 border-0 bg-transparent text-[11px] font-bold text-[#e07a3d]"
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
          onClick={() => (recording ? stopRec() : void startRec())}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 text-white",
            recording ? "bg-red-500" : "bg-[#e07a3d]"
          )}
          aria-label={recording ? "Stop recording" : "Record voice note"}
        >
          {recording ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={recording ? "Recording…" : "Type a message…"}
          disabled={recording}
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
          disabled={recording || (!draft.trim() && !pendingVoice)}
          className="flex h-10 w-10 items-center justify-center rounded-full border-0 bg-brand text-white disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      )}
    </div>
  );
}
