"use client";

/**
 * True 2D select — no native <select>.
 *
 * List uses position:fixed (viewport coords) at 80% of #ona-phone height.
 * Fixed escapes ALL ancestor overflow (page scroll + #ona-phone overflow:hidden),
 * which is why absolute-in-phone lists still looked short on localhost.
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

/** Viewport-fixed box for the list panel. */
type ListBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function phoneRect(): DOMRect | null {
  if (typeof document === "undefined") return null;
  const phone = document.getElementById("ona-phone");
  return phone ? phone.getBoundingClientRect() : null;
}

/**
 * 80% of phone shell height, fixed under the field (or shifted up so the
 * full panel stays inside the phone frame).
 */
function measureFixedListBox(field: HTMLElement): ListBox {
  const p = phoneRect();
  const f = field.getBoundingClientRect();
  const shellTop = p?.top ?? 0;
  const shellBottom = p?.bottom ?? window.innerHeight;
  const shellLeft = p?.left ?? 0;
  const shellRight = p?.right ?? window.innerWidth;
  const shellH = Math.max(320, (p?.height ?? window.innerHeight) || 600);
  const shellW = Math.max(200, (p?.width ?? window.innerWidth) || 360);

  // Hard 80% of the phone frame — never the leftover strip under the field.
  const height = Math.round(shellH * 0.8);
  const gap = 4;
  let top = f.bottom + gap;
  const minTop = shellTop + 8;
  const maxTop = shellBottom - height - 8;
  if (top > maxTop) top = Math.max(minTop, maxTop);
  if (top < minTop) top = minTop;

  let left = f.left;
  let width = f.width;
  // Keep inside phone horizontally
  if (left < shellLeft + 8) left = shellLeft + 8;
  if (left + width > shellRight - 8) {
    width = Math.max(140, shellRight - 8 - left);
  }
  // Prefer matching field width but not wider than shell
  width = Math.min(width, shellW - 16);

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
  const [portalReady, setPortalReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const label = selected?.label || placeholder;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const remeasure = () => {
    const field = rootRef.current;
    if (!field) return;
    setBox(measureFixedListBox(field));
  };

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    remeasure();
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => remeasure();
    window.addEventListener("resize", onResize);
    // Capture scroll from any parent (page scroll, phone interior)
    window.addEventListener("scroll", onResize, true);
    const phone = document.getElementById("ona-phone");
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
    portalReady && open && !disabled && box
      ? createPortal(
          <>
            {/* Dim scrim inside phone frame so tall panel is obvious */}
            <button
              type="button"
              aria-label="Close list"
              data-om-flat-select-scrim="1"
              className="border-0 p-0"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 190,
                background: "rgba(0,0,0,0.35)",
                border: "none",
                cursor: "default",
              }}
              onClick={() => setOpen(false)}
            />
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel || placeholder}
              data-om-flat-select-list="1"
              data-om-flat-list-max-pct="80"
              data-om-flat-list-height={String(box.height)}
              className="overflow-y-auto overscroll-contain rounded-md border-0 py-1"
              style={{
                position: "fixed",
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
                maxHeight: box.height,
                minHeight: box.height,
                zIndex: 200,
                backgroundColor: panelBg,
                backgroundImage: "none",
                border: "none",
                boxShadow: isLight
                  ? "0 16px 40px rgba(0,0,0,0.22)"
                  : "0 16px 40px rgba(0,0,0,0.6)",
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
            </ul>
          </>,
          document.body
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
