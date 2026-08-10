"use client";

/**
 * True 2D select — no native <select> (WebKit paints metallic chrome).
 * Solid fill, no border, no glass/gradient, simple chevron + list panel.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const label = selected?.label || placeholder;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
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
  const activeBg = isLight ? "bg-black/8" : "bg-white/12";

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel || placeholder}
        data-om-flat-select="1"
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border-0 px-3 text-left text-[13px] font-semibold outline-none shadow-none ring-0",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
        style={{
          backgroundColor: fieldBg,
          backgroundImage: "none",
          color: selected ? fieldFg : isLight ? "#64748b" : "rgba(255,255,255,0.45)",
          border: "none",
          boxShadow: "none",
        }}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            muted,
            open && "rotate-180"
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>

      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel || placeholder}
          className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-y-auto rounded-md border-0 py-1 shadow-none"
          style={{
            backgroundColor: panelBg,
            backgroundImage: "none",
            border: "none",
            boxShadow: isLight
              ? "0 8px 24px rgba(0,0,0,0.12)"
              : "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          {options.length === 0 ? (
            <li className={cn("px-3 py-2.5 text-[12px] font-medium", muted)}>
              No options
            </li>
          ) : (
            options.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value || "__empty__"} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-0 bg-transparent px-3 py-2.5 text-left text-[13px] font-semibold outline-none",
                      hoverBg,
                      active && activeBg,
                      isLight ? "text-slate-900" : "text-white"
                    )}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 truncate">{o.label}</span>
                    {active ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]" strokeWidth={2.5} />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
