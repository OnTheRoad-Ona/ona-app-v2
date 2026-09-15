"use client";

import { CopperButton, GhostButton } from "@/components/jobs/job-shell";
import { DISPUTE_REASONS } from "@/lib/jobs/constants";
import type { DisputeReason } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

export function DisputeSheet({
  isLight,
  reason,
  setReason,
  desc,
  setDesc,
  busy,
  onClose,
  onSubmit,
}: {
  isLight: boolean;
  reason: DisputeReason;
  setReason: (r: DisputeReason) => void;
  desc: string;
  setDesc: (s: string) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
      <div
        className={cn(
          "max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl p-5",
          isLight ? "bg-[#c8c9cd]" : "bg-black",
        )}
      >
        <p
          className={cn(
            "text-[17px] font-black",
            isLight ? "text-slate-900" : "text-white",
          )}
        >
          Open dispute
        </p>
        <p
          className={cn(
            "mt-1 text-[12px]",
            isLight ? "text-slate-500" : "text-white/50",
          )}
        >
          Money stays locked until admin resolves (within 24h).
        </p>
        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-[#FF6B35]">
          Reason
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as DisputeReason)}
          className={cn(
            "mt-1 h-11 w-full rounded-xl px-3 text-[13px] font-semibold",
            isLight ? "bg-[#bebfc4]" : "bg-[#1c1c1c] text-white",
          )}
        >
          {DISPUTE_REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          placeholder="Short description…"
          className={cn(
            "mt-3 w-full resize-none rounded-xl p-3 text-[13px] outline-none",
            isLight ? "bg-[#bebfc4]" : "bg-[#1c1c1c] text-white",
          )}
        />
        <div className="mt-4 flex gap-2">
          <GhostButton isLight={isLight} onClick={onClose}>
            Cancel
          </GhostButton>
          <CopperButton
            disabled={busy || desc.trim().length < 5}
            onClick={onSubmit}
          >
            Submit dispute
          </CopperButton>
        </div>
      </div>
    </div>
  );
}
