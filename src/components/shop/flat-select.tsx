"use client";

/**
 * True 2D select — no native <select>.
 * List is portaled into #ona-phone at 80% of shell height so parent
 * overflow:hidden / overflow-y-auto cannot clip it short.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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

type ListBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function phoneEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("ona-phone");
}

/** Geometry for a list under the field, forced to 80% of phone height. */
function measureListBox(field: HTMLElement): ListBox | null {
  const phone = phoneEl();
  if (!phone) return null;
  const p = phone.getBoundingClientRect();
  const f = field.getBoundingClientRect();
  const phoneH = phone.clientHeight || p.height;
  const phoneW = phone.clientWidth || p.width;
  // Full 80% of the phone shell — not remaining space under the field.
  const height = Math.max(240, Math.round(phoneH * 0.8));
  const gap = 4;
  let top = f.bottom - p.top + gap;
  // Keep the full 80% panel inside the shell (shift up if needed).
  const maxTop = Math.max(8, phoneH - height - 8);
  if (top > maxTop) top = maxTop;
  if (top < 8) top = 8;
  let left = f.left - p.left;
  let width = f.width;
  // Clamp horizontally inside phone
  if (left < 8) left = 8;
  if (left + width > phoneW - 8) width = Math.max(120, phoneW - left - 8);
  return { top, left, width, height };
}

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
  const [box, setBox] = useState<ListBox | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const label = selected?.label || placeholder;

  useEffect(() => {
    setMount(phoneEl());
  }, []);

  const remeasure = () => {
    const field = rootRef.current;
    if (!field) return;
    const next = measureListBox(field);
    if (next) setBox(next);
  };

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    remeasure();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => remeasure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const phone = phoneEl();
    const ro =
      typeof ResizeObserver !== "undefined" && phone
        ? new ResizeObserver(onResize)
        : null;
    if (phone && ro) ro.observe(phone);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      ro?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
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

  const listNode =
    open && !disabled && box && mount
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel || placeholder}
            data-om-flat-select-list="1"
            data-om-flat-list-max-pct="80"
            className="overflow-y-auto overscroll-contain rounded-md border-0 py-1 shadow-none"
            style={{
              position: "absolute",
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              maxHeight: box.height,
              zIndex: 200,
              backgroundColor: panelBg,
              backgroundImage: "none",
              border: "none",
              boxShadow: isLight
                ? "0 12px 32px rgba(0,0,0,0.18)"
                : "0 12px 32px rgba(0,0,0,0.55)",
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
                  <li
                    key={o.value || "__empty__"}
                    role="option"
                    aria-selected={active}
                  >
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
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-[#FF6B35]"
                          strokeWidth={2.5}
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>,
          mount
        )
      : null;

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
        data-om-flat-list-max-pct="80"
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
            open && "rotate-180"
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      {listNode}
    </div>
  );
}
