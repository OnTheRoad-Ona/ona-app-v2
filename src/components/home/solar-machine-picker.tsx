"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  composeSolarMachineLabel,
  filterSolarOptions,
  SOLAR_CATALOG_TYPES,
  getSolarBrandsForType,
  getSolarModelsForTypeBrand,
} from "@/lib/solar/catalog";
import { cn } from "@/lib/utils";

export type SolarMachineAnswers = {
  machine: string;
  machine_label: string;
  machine_type: string;
  machine_type_label: string;
  machine_brand: string;
  machine_model: string;
  machine_other: string;
};

function SearchSelect({
  label,
  value,
  placeholder,
  options,
  disabled,
  isLight,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  isLight: boolean;
  onChange: (v: string) => void;
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
    () => filterSolarOptions(options, open ? query : value, 80),
    [options, query, value, open],
  );

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const fieldClass = isLight
    ? "h-11 w-full rounded-md border-0 bg-black/8 px-3 text-[14px] font-medium text-slate-900 outline-none placeholder:text-slate-500"
    : "h-11 w-full rounded-md border-0 bg-[#2c2c2e] px-3 text-[14px] font-medium text-white outline-none placeholder:text-white/50";
  const listClass = isLight
    ? "absolute z-50 mt-1 max-h-44 w-full overflow-y-auto overscroll-contain rounded-md border border-black/10 bg-white shadow-lg"
    : "absolute z-50 mt-1 max-h-44 w-full overflow-y-auto overscroll-contain rounded-md border border-white/10 bg-[#1c1c1e] shadow-lg";
  const itemBase = isLight
    ? "px-3 py-2 text-left text-[13px] text-slate-900"
    : "px-3 py-2 text-left text-[13px] text-white";
  const labelClass = isLight
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
          if (e.target.value !== value) onChange("");
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) =>
              Math.min(h + 1, Math.max(filtered.length - 1, 0)),
            );
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
        <ul id={`${id}-list`} role="listbox" className={listClass}>
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
                      ? isLight
                        ? "bg-[#FF6B35]/15"
                        : "bg-white/10"
                      : "hover:bg-black/5",
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

export function SolarMachinePicker({
  isLight,
  question,
  initial,
  onConfirm,
}: {
  isLight: boolean;
  question: string;
  initial: Record<string, string>;
  onConfirm: (partial: SolarMachineAnswers) => void;
}) {
  const [typeId, setTypeId] = useState(initial.machine_type || "");
  const [brand, setBrand] = useState(initial.machine_brand || "");
  const [model, setModel] = useState(initial.machine_model || "");
  const [otherMode, setOtherMode] = useState(initial.machine === "other");
  const [other, setOther] = useState(initial.machine_other || "");

  const brands = useMemo(() => getSolarBrandsForType(typeId), [typeId]);
  const models = useMemo(
    () => getSolarModelsForTypeBrand(typeId, brand),
    [typeId, brand],
  );

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/50";
  const rowCard = isLight ? "bg-black/[0.02]" : "bg-white/[0.02]";
  const field = isLight
    ? "bg-transparent text-slate-900 placeholder:text-slate-400"
    : "bg-transparent text-white placeholder:text-white/40";

  const catalogReady = Boolean(typeId && brand && model);
  const otherReady = otherMode && other.trim().length > 0;
  const canNext = catalogReady || otherReady;

  const emitCatalog = (
    nextType: string,
    nextBrand: string,
    nextModel: string,
  ) => {
    const typeLabel =
      SOLAR_CATALOG_TYPES.find((t) => t.id === nextType)?.label || nextType;
    onConfirm({
      machine: "catalog",
      machine_label: composeSolarMachineLabel({
        mode: "catalog",
        typeId: nextType,
        brand: nextBrand,
        model: nextModel,
      }),
      machine_type: nextType,
      machine_type_label: typeLabel,
      machine_brand: nextBrand,
      machine_model: nextModel,
      machine_other: "",
    });
  };

  const emitNone = () => {
    onConfirm({
      machine: "none",
      machine_label: composeSolarMachineLabel({ mode: "none" }),
      machine_type: "",
      machine_type_label: "",
      machine_brand: "",
      machine_model: "",
      machine_other: "",
    });
  };

  const emitOther = () => {
    const text = other.trim();
    if (!text) return;
    onConfirm({
      machine: "other",
      machine_label: composeSolarMachineLabel({ mode: "other", other: text }),
      machine_type: "",
      machine_type_label: "",
      machine_brand: "",
      machine_model: "",
      machine_other: text,
    });
  };

  return (
    <div>
      <div className="mt-2 flex items-center gap-1 px-0.5 pb-2">
        <button
          type="button"
          disabled={!canNext}
          onClick={() => {
            if (otherReady) emitOther();
            else if (catalogReady) emitCatalog(typeId, brand, model);
          }}
          aria-label="Next"
          className="border-0 bg-transparent p-0.5 text-[#FF6B35] disabled:opacity-40"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <p className={cn("text-[14px] font-bold leading-snug", ink)}>
          {question}
        </p>
      </div>

      {!otherMode ? (
        <div className="flex flex-col gap-2.5">
          <SearchSelect
            label="Type"
            value={
              SOLAR_CATALOG_TYPES.find((t) => t.id === typeId)?.label || ""
            }
            placeholder="Search type (hybrid, off-grid…)"
            options={SOLAR_CATALOG_TYPES.map((t) => t.label)}
            isLight={isLight}
            onChange={(label) => {
              const hit = SOLAR_CATALOG_TYPES.find((t) => t.label === label);
              setTypeId(hit?.id || "");
              setBrand("");
              setModel("");
            }}
          />
          <SearchSelect
            label="Brand"
            value={brand}
            placeholder={typeId ? "Search brand" : "Pick a type first"}
            options={brands}
            disabled={!typeId}
            isLight={isLight}
            onChange={(v) => {
              setBrand(v);
              setModel("");
            }}
          />
          <SearchSelect
            label="Model"
            value={model}
            placeholder={brand ? "Search model" : "Pick a brand first"}
            options={models}
            disabled={!typeId || !brand}
            isLight={isLight}
            onChange={(v) => {
              setModel(v);
              if (typeId && brand && v) emitCatalog(typeId, brand, v);
            }}
          />
        </div>
      ) : (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value)}
          rows={3}
          placeholder="e.g. 5kVA hybrid system, no name on it"
          className={cn(
            "w-full resize-none rounded-xl border-0 px-3 py-2 text-[13px] font-medium leading-snug outline-none",
            field,
          )}
        />
      )}

      <div className="mt-3 flex flex-col overflow-hidden rounded-[4px]">
        <button
          type="button"
          onClick={emitNone}
          className={cn(
            "flex w-full items-center border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]",
            rowCard,
          )}
        >
          <span className={cn("text-[13px] font-semibold leading-snug", ink)}>
            I don&apos;t have one yet / buying new
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOtherMode(true);
            setTypeId("");
            setBrand("");
            setModel("");
          }}
          className={cn(
            "flex w-full items-center border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]",
            rowCard,
          )}
        >
          <span className={cn("text-[13px] font-semibold leading-snug", ink)}>
            Not listed type it
          </span>
        </button>
        {otherMode ? (
          <p className={cn("px-1 pb-1 text-[11px] font-medium", muted)}>
            Describe the system, then tap the arrow.
          </p>
        ) : null}
      </div>
    </div>
  );
}
