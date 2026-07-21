"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CONVERSATION_ENDED_MESSAGE } from "@/lib/chat-expired";
import { cn } from "@/lib/utils";

/**
 * Popup when user taps a finished chat/job.
 * Portals into #oga-mecho-phone so it stays inside the device frame.
 * View → read-only / summary; OK → dismiss.
 */
export function ExpiredDialog({
  open,
  onClose,
  onView,
  message = CONVERSATION_ENDED_MESSAGE,
  isLight,
  viewLabel = "View",
  okLabel = "OK",
}: {
  open: boolean;
  onClose: () => void;
  onView?: () => void;
  message?: string;
  isLight: boolean;
  viewLabel?: string;
  okLabel?: string;
}) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMount(
      document.getElementById("oga-mecho-phone") ||
        document.body
    );
  }, []);

  if (!open || !mount) return null;

  const node = (
    <div
      className="absolute inset-0 z-[400] flex items-center justify-center px-6"
      role="alertdialog"
      aria-modal
      aria-labelledby="expired-dialog-msg"
    >
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/50"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-[280px] rounded-xl px-4 py-4 text-center shadow-lg",
          isLight ? "bg-[#d4d5d9] text-slate-900" : "bg-[#1c1c1e] text-white"
        )}
      >
        <p
          id="expired-dialog-msg"
          className="text-[14px] font-bold leading-snug"
        >
          {message}
        </p>
        <div className="mt-3.5 flex items-center justify-center gap-2">
          {onView ? (
            <button
              type="button"
              onClick={onView}
              className={cn(
                "inline-flex min-w-[88px] items-center justify-center rounded-md border-0 px-4 py-2 text-[13px] font-bold",
                isLight
                  ? "bg-black/10 text-slate-900"
                  : "bg-white/12 text-white"
              )}
            >
              {viewLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-w-[88px] items-center justify-center rounded-md border-0 px-4 py-2 text-[13px] font-bold text-white"
            style={{ backgroundColor: "#FF6B35" }}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, mount);
}
