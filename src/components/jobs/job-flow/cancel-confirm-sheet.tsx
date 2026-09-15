"use client";

import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Confirm-before-cancel bottom sheet (destructive action guard). */
export function CancelConfirmSheet({
  open,
  isLight,
  onClose,
  onConfirm,
}: {
  open: boolean;
  isLight: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/50 p-3">
      <div
        className={cn(
          "w-full max-w-md overflow-hidden rounded-2xl shadow-2xl",
          isLight ? "bg-white" : "bg-[#1c1c1e]",
        )}
        role="dialog"
        aria-modal
        aria-label="Confirm cancel"
      >
        <div className="px-4 pb-2 pt-4">
          <p
            className={cn(
              "text-center text-[15px] font-black",
              isLight ? "text-slate-900" : "text-white",
            )}
          >
            Cancel this request?
          </p>
          <p
            className={cn(
              "mt-1 text-center text-[12px] font-medium",
              isLight ? "text-slate-500" : "text-white/55",
            )}
          >
            The request will be closed and the other party will be notified. Are
            you sure you want to cancel?
          </p>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold text-red-500",
          )}
        >
          Yes, cancel
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold",
            isLight ? "text-slate-900" : "text-white",
          )}
        >
          Keep request
        </button>
      </div>
    </div>,
    document.getElementById("ona-phone") || document.body,
  );
}
