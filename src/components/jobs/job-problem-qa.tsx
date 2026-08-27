"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { cleanAddressLabel } from "@/lib/google-maps";

/**
 * Parses the composed `job.problem` blob into readable Q&A rows.
 *
 * Two formats are produced by the question-flow composers:
 * 1. "Inline" (solar / generator / painter / carpenter):
 * `Solar work: {start label} ({start question})` then `{question} {answer}`
 * on one line, plus `Location: X` / `Extra: X` labeled lines.
 * 2. "Alternating" (mechanic / vulcanizer / tow / battery / ac / body /
 * electrical / diagnostics / fashion / plumber): every question line is
 * immediately followed by its answer on the next line.
 *
 * Both render as a highlighted Q&A list that both the Repair Pro and customer
 * can scan quickly.
 */

export interface JobProblemRow {
  label: string;
  answer: string;
}

/** When the card title already shows the vehicle (lower panel), drop both the
 * `Vehicle:` label row and the "Which vehicle?" question so the vehicle is
 * never repeated. */
export function filterHiddenVehicleRows(
  rows: JobProblemRow[],
  hideVehicleRow: boolean,
): JobProblemRow[] {
  if (!hideVehicleRow) return rows;
  return rows.filter(
    (r) => r.label !== "Vehicle" && !/which vehicle\??$/i.test(r.label.trim()),
  );
}

/** A bare coordinate string like "6.42810, 3.42190" reverse geocoding failed
 * and the app fell back to raw lat/lng. Never show that to a pro. */
export const COORDINATES_ONLY_RE = /^-?\d{1,2}(\.\d+)?,\s*-?\d{1,2}(\.\d+)?$/;

/** Location answers should be an address only drop the row when its only
 * content is raw latitude/longitude, and strip plus-codes from the rest. */
export function stripCoordinateLocations(
  rows: JobProblemRow[],
): JobProblemRow[] {
  return rows
    .map((r) => {
      if (!isLocationRow(r)) return r;
      return { ...r, answer: cleanAddressLabel(r.answer) };
    })
    .filter((r) => {
      if (!isLocationRow(r)) return true;
      return Boolean(r.answer) && !COORDINATES_ONLY_RE.test(r.answer);
    });
}

function isLocationRow(r: JobProblemRow): boolean {
  const label = r.label.toLowerCase();
  return label.includes("location") || label.includes("landmark");
}

export function customerWaitingHighlights(problem: string, locationLabel?: string | null): JobProblemRow[] {
  const rows: JobProblemRow[] = [];
  if (problem?.trim()) {
    const lines = problem.split("\n").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(lines.length, 2); i++) {
      rows.push({ label: `Detail ${i + 1}`, answer: lines[i] });
    }
  }
  if (locationLabel?.trim()) {
    rows.push({ label: "Location", answer: String(locationLabel).trim() });
  }
  return rows.slice(0, 3);
}

export interface ParsedJobProblem {
  summary: string | null;
  rows: JobProblemRow[];
  notes: string[];
}

const F2_SUMMARY = /^(?:[A-Za-z /]+ work|Work needed):\s*(.+?)\s*\((.*)\)$/i;
const LABELED_LINE =
  /^(Location \/ landmark|Location|Extra detail|Extra|Service|Vehicle):\s*(.+)$/i;

function isQuestionLine(line: string): boolean {
  return line.endsWith("?");
}

function pairAlternatingLines(lines: string[]): {
  rows: JobProblemRow[];
  notes: string[];
} {
  const rows: JobProblemRow[] = [];
  const notes: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const labeled = line.match(LABELED_LINE);
    if (labeled) {
      rows.push({ label: labeled[1], answer: labeled[2].trim() });
      i += 1;
      continue;
    }
    const qi = line.lastIndexOf("?");
    if (qi >= 0 && qi < line.length - 1) {
      rows.push({
        label: line.slice(0, qi + 1).trim(),
        answer: line.slice(qi + 1).trim(),
      });
      i += 1;
      continue;
    }
    const next = lines[i + 1];
    const nextIsAnswer =
      Boolean(next) && !isQuestionLine(next) && !LABELED_LINE.test(next);
    if (nextIsAnswer) {
      rows.push({ label: line, answer: next });
      i += 2;
      continue;
    }
    notes.push(line);
    i += 1;
  }
  return { rows, notes };
}

export function parseJobProblem(problem: string): ParsedJobProblem {
  const lines = (problem || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let summary: string | null = null;
  if (lines.some((l) => F2_SUMMARY.test(l))) {
    // Inline format: leading summary + one-line "question answer" rows.
    const rows: JobProblemRow[] = [];
    const notes: string[] = [];
    let pending: string | null = null;
    for (const line of lines) {
      const m = line.match(F2_SUMMARY);
      if (m) {
        summary = m[1].trim();
        continue;
      }
      const labeled = line.match(LABELED_LINE);
      if (labeled) {
        rows.push({ label: labeled[1], answer: labeled[2].trim() });
        pending = null;
        continue;
      }
      const qi = line.lastIndexOf("?");
      if (qi >= 0) {
        const question = line.slice(0, qi + 1).trim();
        const answer = line.slice(qi + 1).trim();
        if (answer) {
          rows.push({ label: question, answer });
          pending = null;
        } else {
          pending = question;
        }
      } else if (pending) {
        rows.push({ label: pending, answer: line });
        pending = null;
      } else {
        notes.push(line);
      }
    }
    if (pending) notes.push(pending);
    return { summary, rows, notes };
  }

  // Alternating format: labeled lines stand alone; each question pairs
  // with the following answer. A leading "Vehicle: …" must not shift
  // every pair one line off.
  const paired = pairAlternatingLines(lines);
  return { summary, rows: paired.rows, notes: paired.notes };
}

export function JobProblemQA({
  problem,
  isLight,
  transparent = false,
  compact = false,
  pageSize,
  hideVehicleRow = false,
}: {
  problem: string;
  isLight: boolean;
  /** Plain-text rows on the theme color no row cards or summary highlight. */
  transparent?: boolean;
  /** Customer list: full Q&A, tight gaps, no Next. */
  compact?: boolean;
  /** When set, page through the Q&A `pageSize` rows at a time. */
  pageSize?: number;
  /** Pro lower-panel only: the vehicle is already the card title. */
  hideVehicleRow?: boolean;
}) {
  const parsed = useMemo(() => {
    const p = parseJobProblem(problem);
    return { ...p, rows: stripCoordinateLocations(p.rows) };
  }, [problem]);
  const [offset, setOffset] = useState(0);
  const ink = isLight ? "text-slate-900" : "text-white";
  const rowCard = isLight ? "bg-black/[0.02]" : "bg-white/[0.02]";

  const baseRows = filterHiddenVehicleRows(parsed.rows, hideVehicleRow);

  if (!baseRows.length && !parsed.summary && !parsed.notes.length) {
    return (
      <p className={cn("text-[15px] font-medium leading-relaxed", ink)}>
        {problem}
      </p>
    );
  }

  const allItems = [
    ...baseRows,
    ...parsed.notes.map((note) => ({ label: "Location", answer: note })),
  ];
  const items =
    pageSize && !compact ? allItems.slice(offset, offset + pageSize) : allItems;
  const hasMore = Boolean(
    !compact && pageSize && offset + pageSize < allItems.length,
  );
  const advance = () =>
    setOffset((o) => Math.min(o + (pageSize || 0), allItems.length));
  const retreat = () => setOffset((o) => Math.max(o - (pageSize || 0), 0));

  const questionCls = cn(
    compact
      ? "text-[11.5px] font-semibold leading-tight"
      : "text-[13px] font-semibold leading-snug",
    isLight ? "text-slate-700" : "text-white/75",
  );
  const answerCls = cn(
    compact
      ? "mt-px text-[12.5px] font-bold leading-tight"
      : transparent
        ? "mt-0.5"
        : "mt-1",
    compact ? "" : "text-[15px] font-bold leading-snug",
    ink,
  );

  const chevronDivider = (
    <div className="flex items-center">
      <div className="shrink-0">
        {offset > 0 ? (
          <button
            type="button"
            onClick={retreat}
            aria-label="Show previous questions"
            className="border-0 bg-transparent p-0"
          >
            <span
              className={cn(
                "om-bounce-arrow-back flex h-5 w-5 items-center justify-center rounded-full",
                isLight
                  ? "bg-[#c8c9cd] text-slate-900 shadow-sm"
                  : "bg-black text-white shadow-sm",
              )}
            >
              <ChevronLeft className="h-3 w-3" strokeWidth={2.75} />
            </span>
          </button>
        ) : (
          <span className="block h-5 w-5" aria-hidden="true" />
        )}
      </div>
            <div className="shrink-0">
        {hasMore ? (
          <button
            type="button"
            onClick={advance}
            aria-label="Show more questions"
            className="border-0 bg-transparent p-0"
          >
            <span
              className={cn(
                "om-bounce-arrow flex h-6 w-6 items-center justify-center rounded-full",
                isLight
                  ? "bg-[#c8c9cd] text-slate-900 shadow-sm"
                  : "bg-black text-white shadow-sm",
              )}
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
          </button>
        ) : (
          <span className="block h-6 w-6" aria-hidden="true" />
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        compact
          ? "mt-0.5 space-y-0.5"
          : transparent
            ? "mt-2.5 space-y-1.5"
            : "mt-1 space-y-1.5",
      )}
    >
      {parsed.summary ? (
        transparent || compact ? (
          <p className="text-[13px] font-bold leading-snug text-[#FF6B35]">
            {parsed.summary}
          </p>
        ) : (
          <div className="rounded-[4px] bg-[#FF6B35]/10 px-2.5 py-2">
            <p className="text-[12px] font-bold leading-snug text-[#FF6B35]">
              {parsed.summary}
            </p>
          </div>
        )
      ) : null}
      {items.map((row, i) => (
        <Fragment key={i}>
          <div
            className={
              transparent || compact
                ? "px-0 py-0"
                : cn("rounded-[4px] px-2.5 py-2", rowCard)
            }
          >
            <p className={questionCls}>{row.label}</p>
            <p className={answerCls}>{row.answer}</p>
          </div>
          {!compact && i < items.length - 1 ? (
            i === items.length - 2 && (hasMore || offset > 0) ? (
              chevronDivider
            ) : null
          ) : null}
        </Fragment>
      ))}
      {!compact && items.length === 1 && (hasMore || offset > 0)
        ? chevronDivider
        : null}
    </div>
  );
}
