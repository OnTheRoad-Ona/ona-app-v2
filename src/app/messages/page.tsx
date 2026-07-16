"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Role-aware inbox: motorist sees their job chats;
 * pro only sees threads for their skill (no mix-up).
 */
export default function MessagesPage() {
  const { visibleMessageThreads, theme, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Messages"
        subtitle={
          isPro
            ? "Chats with motorists for your skill only"
            : "Chats with Repair Pros for your jobs"
        }
        backHref={isPro ? "/dashboard" : "/"}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
        {visibleMessageThreads.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            No chats yet.{" "}
            {isPro
              ? "Accept a matching job to open a chat."
              : "Book a pro to start a job chat."}
          </p>
        ) : (
          visibleMessageThreads.map((m) => (
            <Link
              key={m.id}
              href={`/messages/${m.id}`}
              className={cn(
                "flex w-full items-center gap-3 border-0 px-3 py-3 text-left",
                isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.04]"
              )}
            >
              <Avatar className="h-10 w-10 overflow-hidden rounded-full border-0 bg-transparent shadow-none ring-0">
                <AvatarImage
                  src={m.photo || DEFAULT_VENDOR_PHOTO}
                  alt={m.technicianName}
                  className="h-full w-full object-cover object-center"
                />
                <AvatarFallback className="bg-brand text-[11px] font-bold text-white">
                  {avatarInitials(
                    isPro ? m.motoristName : m.technicianName
                  )}
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
                    {isPro ? m.motoristName : m.technicianName}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted">
                    {m.time}
                  </span>
                </div>
                <p className="truncate text-[11px] capitalize text-muted">
                  {PRO_SERVICE_LABELS[m.serviceType] ?? m.serviceType}
                </p>
                <p className="truncate text-xs text-muted">{m.lastMessage}</p>
              </div>
              {m.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-md metallic-orange px-1.5 text-[10px] font-bold text-white">
                  {m.unread}
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
