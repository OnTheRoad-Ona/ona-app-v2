"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function MessagesPage() {
  const { messages, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title="Messages" subtitle="Chat with technicians" />

      <div className="flex-1 divide-y divide-transparent overflow-y-auto scrollbar-hide">
        {messages.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <button
              key={m.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 px-3 py-3 text-left border-0",
                isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
              )}
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-brand text-[11px] font-bold text-white">
                  {m.technicianName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "truncate text-sm font-bold",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    {m.technicianName}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted">{m.time}</span>
                </div>
                <p className="truncate text-xs text-muted">{m.lastMessage}</p>
              </div>
              {m.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-md metallic-orange px-1.5 text-[10px] font-bold text-white">
                  {m.unread}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
