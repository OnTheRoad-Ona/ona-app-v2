"use client";

/**
 * Flat 2D picker no native <select>.
 *
 * Open state: full-width BOTTOM SHEET = 80% of #ona-phone height.
 * Portaled into #ona-phone with position:absolute + height:80% + bottom:0
 * so overflow:hidden cannot clip it to a short strip under the field.
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FlatSelectOption = { value: string; label: string };

type Props = {
  value: string;
  options: FlatSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  isLight: boolean;
  onChange: (value: string) => void;
  "aria-label"?: string;
};

export function FlatSelect({
  value,
  options,
  placeholder = "Select",
  disabled,
  isLight,
  onChange,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const label = selected?.label || placeholder;
  const title = ariaLabel || placeholder;

  useEffect(() => {
    setPhone(document.getElementById("ona-phone"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while sheet open (mobile)
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const fieldBg = isLight ? "#f0f0f2" : "#2c2c2e";
  const fieldFg = isLight ? "#0f172a" : "#ffffff";
  const muted = isLight ? "text-slate-500" : "text-white/45";
  const panelBg = isLight ? "#e8e9ed" : "#1c1c1e";
  const hoverBg = isLight ? "hover:bg-black/5" : "hover:bg-white/10";
  const activeBg = isLight ? "bg-black/10" : "bg-white/12";
  const ink = isLight ? "text-slate-900" : "text-white";

  const sheet =
    open && !disabled && phone
      ? createPortal(
          <>
            {/* Scrim covers whole phone */}
            <button
              type="button"
              aria-label="Close"
              data-om-flat-select-scrim="1"
              className="border-0 p-0"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 400,
                background: "rgba(0,0,0,0.45)",
                border: "none",
                cursor: "default",
              }}
              onClick={() => setOpen(false)}
            />
            {/* 80% height sheet pinned to bottom of phone */}
            <div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              data-om-flat-select-sheet="1"
              data-om-flat-list-max-pct="80"
              className="flex flex-col border-0 shadow-none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "80%",
                maxHeight: "80%",
                minHeight: "80%",
                zIndex: 410,
                backgroundColor: panelBg,
                backgroundImage: "none",
                border: "none",
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                boxShadow: "0 -8px 32px rgba(0,0,0,0.35)",
              }}
            >
              <div
                className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5"
                style={{
                  borderBottom: isLight
                    ? "1px solid rgba(0,0,0,0.08)"
                    : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p className={cn("text-[14px] font-black", ink)}>{title}</p>
                <button
                  type="button"
                  aria-label="Close list"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent",
                    muted,
                  )}
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
              <ul
                id={listId}
                role="listbox"
                aria-label={title}
                data-om-flat-select-list="1"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1"
              >
                {options.length === 0 ? (
                  <li
                    className={cn("px-3 py-3 text-[12px] font-medium", muted)}
                  >
                    No options
                  </li>
                ) : (
                  options.map((o) => {
                    const active = o.value === value;
                    return (
                      <li
                        key={o.value || "__empty__"}
                        role="option"
                        aria-selected={active}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between gap-2 border-0 bg-transparent px-3 py-3 text-left text-[14px] font-semibold outline-none",
                            hoverBg,
                            active && activeBg,
                            ink,
                          )}
                          onClick={() => {
                            onChange(o.value);
                            setOpen(false);
                          }}
                        >
                          <span className="min-w-0 truncate">{o.label}</span>
                          {active ? (
                            <Check
                              className="h-4 w-4 shrink-0 text-[#FF6B35]"
                              strokeWidth={2.5}
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <p
                className={cn(
                  "shrink-0 px-3 py-2 text-center text-[10px] font-semibold",
                  muted,
                )}
              >
                {options.length} option{options.length === 1 ? "" : "s"} · 80%
                height
              </p>
            </div>
          </>,
          phone,
        )
      : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={title}
        data-om-flat-select="1"
        data-om-flat-list-max-pct="80"
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border-0 px-3 text-left text-[13px] font-semibold outline-none shadow-none ring-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{
          backgroundColor: fieldBg,
          backgroundImage: "none",
          color: selected
            ? fieldFg
            : isLight
              ? "#64748b"
              : "rgba(255,255,255,0.45)",
          border: "none",
          boxShadow: "none",
        }}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            muted,
            open && "rotate-180",
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      {sheet}
    </div>
  );
}
