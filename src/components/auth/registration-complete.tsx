"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  AUTH_BG,
  authPrimaryBtnClass,
  authPrimaryBtnStyle,
} from "@/components/auth/auth-plate";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import { cn } from "@/lib/utils";

/** Success dialog — concise copy + smooth open/close */
export function RegistrationComplete({
  open,
  accountLabel,
  onContinue,
}: {
  open: boolean;
  accountLabel: string;
  onContinue: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      setExiting(false);
      return;
    }
    unlockAudio();
    playAppSound("signup_complete");
    // Next frame so CSS enter transition runs
    const t = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(t);
  }, [open]);

  if (!open && !exiting) return null;

  const handleContinue = () => {
    setExiting(true);
    setVisible(false);
    window.setTimeout(() => {
      setExiting(false);
      onContinue();
    }, 220);
  };

  const show = open || exiting;

  if (!show) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-[400] flex items-center justify-center px-6 transition-opacity duration-200 ease-out",
        visible && !exiting ? "bg-black/30 opacity-100" : "bg-black/0 opacity-0"
      )}
      role="dialog"
      aria-modal
      aria-labelledby="reg-complete-title"
    >
      <div
        className={cn(
          "w-full max-w-[280px] rounded-3xl p-5 text-center shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-black/10 transition-all duration-200 ease-out",
          visible && !exiting
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-3 scale-95 opacity-0"
        )}
        style={{ backgroundColor: AUTH_BG }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f8ef]">
          <CheckCircle2 className="h-7 w-7 text-[#34c759]" strokeWidth={2} />
        </div>
        <h2
          id="reg-complete-title"
          className="mt-2.5 text-[16px] font-bold text-[#1e293b]"
        >
          You&apos;re all set
        </h2>
        <p className="mt-1 text-[12px] leading-snug text-[#64748b]">
          Your {accountLabel} account is ready. You can start using Ona
          now.
        </p>
        <button
          type="button"
          onClick={handleContinue}
          className={`${authPrimaryBtnClass} mt-4 h-10 rounded-2xl text-[13px] font-bold transition-transform duration-150 active:scale-[0.98]`}
          style={authPrimaryBtnStyle}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
