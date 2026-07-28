"use client";

/**
 * Searchable Make → Model → Year cascade for customer vehicles.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  filterOptions,
  getAllMakes,
  getModelsForMake,
  getYearsForMakeModel,
} from "@/lib/vehicle-catalog";
import { cn } from "@/lib/utils";

type Props = {
  make: string;
  model: string;
  year: string;
  onMakeChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onYearChange: (v: string) => void;
  /** Auth signup gray wells vs profile theme */
  variant?: "auth" | "profile";
  isLight?: boolean;
  className?: string;
};

function SearchSelect({
  label,
  required,
  value,
  placeholder,
  options,
  disabled,
  onChange,
  variant,
  isLight,
}: {
  label: string;
  required?: boolean;
  value: string;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  onChange: (v: string) => void;
  variant: "auth" | "profile";
  isLight?: boolean;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(
    () => filterOptions(options, open ? query : value, 100),
    [options, query, value, open]
  );

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const fieldClass =
    variant === "auth"
      ? "om-auth-field h-10 w-full rounded-md border !border-[#9A9EA6] !bg-[#E2E3E7] px-3 text-[13px] font-medium !text-[#0f172a] outline-none placeholder:!text-[#64748b]"
      : isLight
        ? "h-11 w-full rounded-md border-0 bg-black/8 px-3 text-[14px] font-medium text-slate-900 outline-none placeholder:text-slate-500"
        : "h-11 w-full rounded-md border-0 bg-[#2c2c2e] px-3 text-[14px] font-medium text-white outline-none placeholder:text-white/50";

  /* Full catalog, compact one-line field + downward list (never full-page) */
  const listClass =
    variant === "auth"
      ? "absolute z-50 mt-1 max-h-44 w-full overflow-y-auto overscroll-contain rounded-md border border-[#9A9EA6] bg-white shadow-lg"
      : isLight
        ? "absolute z-50 mt-1 max-h-44 w-full overflow-y-auto overscroll-contain rounded-md border border-black/10 bg-white shadow-lg"
        : "absolute z-50 mt-1 max-h-44 w-full overflow-y-auto overscroll-contain rounded-md border border-white/10 bg-[#1c1c1e] shadow-lg";

  const itemBase =
    variant === "auth" || isLight
      ? "px-3 py-2 text-left text-[13px] text-slate-900"
      : "px-3 py-2 text-left text-[13px] text-white";

  const labelClass =
    variant === "auth"
      ? "mb-0.5 block text-[11px] font-semibold text-[#475569]"
      : isLight
        ? "mb-1 block text-[12px] font-semibold text-slate-700"
        : "mb-1 block text-[12px] font-semibold text-white/70";

  const pick = (v: string) => {
    onChange(v);
    setQuery(v);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative block">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required ? (
          <span className="ml-0.5 font-bold text-red-600" aria-label="required">
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        className={cn(fieldClass, disabled && "cursor-not-allowed opacity-55")}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
            setQuery(value);
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Clear committed value while typing so cascade resets cleanly
          if (e.target.value !== value) onChange("");
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlight]) pick(filtered[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(value);
          }
        }}
      />
      {open && !disabled && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className={listClass}
        >
          {filtered.length === 0 ? (
            <li className={cn(itemBase, "opacity-60")}>No matches</li>
          ) : (
            filtered.map((opt, i) => (
              <li key={opt}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opt === value}
                  className={cn(
                    itemBase,
                    "w-full border-0 bg-transparent",
                    i === highlight
                      ? variant === "auth" || isLight
                        ? "bg-[#FF6B35]/15"
                        : "bg-white/10"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(opt);
                  }}
                >
                  {opt}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function VehicleCascadeFields({
  make,
  model,
  year,
  onMakeChange,
  onModelChange,
  onYearChange,
  variant = "auth",
  isLight = true,
  className,
}: Props) {
  const makes = useMemo(() => getAllMakes(), []);
  const models = useMemo(
    () => (make ? getModelsForMake(make) : []),
    [make]
  );
  const years = useMemo(
    () =>
      make && model
        ? getYearsForMakeModel(make, model).map(String)
        : [],
    [make, model]
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <SearchSelect
        label="Make"
        required
        value={make}
        placeholder="Search make (e.g. Toyota)"
        options={makes}
        variant={variant}
        isLight={isLight}
        onChange={(v) => {
          onMakeChange(v);
          onModelChange("");
          onYearChange("");
        }}
      />
      <SearchSelect
        label="Model"
        required
        value={model}
        placeholder={make ? "Search model" : "Pick make first"}
        options={models}
        disabled={!make}
        variant={variant}
        isLight={isLight}
        onChange={(v) => {
          onModelChange(v);
          onYearChange("");
        }}
      />
      <SearchSelect
        label="Year"
        value={year}
        placeholder={
          make && model ? "Search year" : "Pick make and model first"
        }
        options={years}
        disabled={!make || !model}
        variant={variant}
        isLight={isLight}
        onChange={onYearChange}
      />
    </div>
  );
}
