"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Single job chat: Motorist ↔ one Repair Pro for one request.
 * Does not mix with other jobs or other skills.
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
    theme,
    accountType,
  } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const thread = visibleMessageThreads.find((t) => t.id === id);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  if (!thread) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-2 p-6",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <p className={cn("font-semibold", isLight ? "text-slate-900" : "text-white")}>
          Chat not found
        </p>
        <p className="text-center text-xs text-muted">
          This thread may belong to another role or skill.
        </p>
        <button
          type="button"
          className="mt-2 border-0 bg-transparent text-sm font-bold text-brand"
          onClick={() => router.push("/messages")}
        >
          Back to messages
        </button>
      </div>
    );
  }

  const title = isPro ? thread.motoristName : thread.technicianName;
  const subtitle = `${PRO_SERVICE_LABELS[thread.serviceType] ?? thread.serviceType} · job chat`;

  const send = () => {
    sendChatMessage(thread.id, draft);
    setDraft("");
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title={title} subtitle={subtitle} />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 scrollbar-hide">
        {thread.messages.map((msg) => {
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
                  "max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug",
                  mine
                    ? "rounded-br-md bg-brand text-white"
                    : isLight
                      ? "rounded-bl-md bg-white text-slate-900"
                      : "rounded-bl-md bg-neutral-900 text-white"
                )}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-t px-3 py-2",
          isLight
            ? "border-black/10 bg-[#c8c9cd]"
            : "border-white/10 bg-black"
        )}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a message…"
          className={cn(
            "h-10 min-w-0 flex-1 rounded-full border-0 px-4 text-[13px] outline-none",
            isLight
              ? "bg-white text-slate-900 placeholder:text-slate-400"
              : "bg-neutral-900 text-white placeholder:text-white/40"
          )}
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-full border-0 bg-brand text-white disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
