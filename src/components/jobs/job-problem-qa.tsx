"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Parses the composed `job.problem` blob into readable Q&A rows.
 *
 * Two formats are produced by the question-flow composers:
 *  1. "Inline" (solar / generator / painter / carpenter):
 *     `Solar work: {start label} ({start question})` then `{question} {answer}`
 *     on one line, plus `Location: X` / `Extra: X` labeled lines.
 *  2. "Alternating" (mechanic / vulcanizer / tow / battery / ac / body /
 *     electrical / diagnostics / fashion / plumber): every question line is
 *     immediately followed by its answer on the next line.
 *
 * Both render as a highlighted Q&A list that both the Repair Pro and customer
 * can scan quickly.
 */

export interface JobProblemRow {
  label: string;
  answer: string;
}

export interface ParsedJobProblem {
  summary: string | null;
  rows: JobProblemRow[];
  notes: string[];
}

const F2_SUMMARY = /^(?:[A-Za-z /]+ work|Work needed):\s*(.+?)\s*\((.*)\)$/i;
const LABELED_LINE =
  /^(Location \/ landmark|Location|Extra detail|Extra|Service):\s*(.+)$/i;

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

  // Alternating format: question line then answer line, strictly paired.
  const rows: JobProblemRow[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    rows.push({ label: lines[i], answer: lines[i + 1] ?? "" });
  }
  return { summary, rows, notes: [] };
}

export function JobProblemQA({
  problem,
  isLight,
}: {
  problem: string;
  isLight: boolean;
}) {
  const parsed = useMemo(() => parseJobProblem(problem), [problem]);
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/50";
  const rowCard = isLight ? "bg-black/[0.02]" : "bg-white/[0.02]";

  if (!parsed.rows.length && !parsed.summary && !parsed.notes.length) {
    return <p className={cn("text-[15px] font-medium leading-relaxed", ink)}>{problem}</p>;
  }

  return (
    <div className="mt-1 space-y-1.5">
      {parsed.summary ? (
        <div className="rounded-[4px] bg-[#FF6B35]/10 px-2.5 py-2">
          <p className="text-[12px] font-bold leading-snug text-[#FF6B35]">
            {parsed.summary}
          </p>
        </div>
      ) : null}
      {parsed.rows.map((row, i) => (
        <div key={i} className={cn("rounded-[4px] px-2.5 py-2", rowCard)}>
          <p className={cn("text-[10px] font-semibold uppercase tracking-wide leading-snug", muted)}>
            {row.label}
          </p>
          <p className={cn("mt-0.5 text-[13px] font-bold leading-snug", ink)}>
            {row.answer}
          </p>
        </div>
      ))}
      {parsed.notes.map((note, i) => (
        <div key={`n${i}`} className={cn("rounded-[4px] px-2.5 py-2", rowCard)}>
          <p className={cn("text-[10px] font-semibold uppercase tracking-wide", muted)}>
            Note
          </p>
          <p className={cn("mt-0.5 text-[13px] font-bold leading-snug", ink)}>
            {note}
          </p>
        </div>
      ))}
    </div>
  );
}