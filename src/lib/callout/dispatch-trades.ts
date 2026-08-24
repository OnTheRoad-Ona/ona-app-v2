/**
 * Consistency: what the customer typed is the truth.
 * The trade chip they tapped is only a hint.
 * If the words point to other trades, we dispatch those.
 */

import { PROBLEM_MATCHES } from "@/lib/data/technicians";
import { isProService } from "@/lib/pro-service-id";
import type { ProService } from "@/lib/types";

export type DispatchTrades = {
  statedTrade: ProService | null;
  fromProblem: ProService[];
  dispatchTrades: ProService[];
  primary: ProService;
  mismatch: boolean;
};

export function scoreTradesFromProblem(
  problem: string,
): { trade: ProService; score: number }[] {
  const q = String(problem || "").toLowerCase();
  const scores = new Map<ProService, number>();
  for (const [keyword, trades] of Object.entries(PROBLEM_MATCHES)) {
    if (!q.includes(keyword)) continue;
    const weight = Math.max(2, keyword.length);
    trades.forEach((t, i) => {
      const bonus = trades.length - i;
      scores.set(t, (scores.get(t) || 0) + weight + bonus);
    });
  }
  return [...scores.entries()]
    .map(([trade, score]) => ({ trade, score }))
    .sort((a, b) => b.score - a.score);
}

/** After they type: ask only if Ona's best trade is not the one they tapped. */
export function decideHelpTrade(
  problem: string,
  tappedTrade?: ProService | string | null,
): {
  tapped: ProService | null;
  suggested: ProService;
  needsConfirm: boolean;
  fromProblem: ProService[];
} {
  const tapped = tappedTrade && isProService(tappedTrade) ? tappedTrade : null;
  const ranked = scoreTradesFromProblem(problem);
  const fromProblem = ranked.map((r) => r.trade);
  const suggested = ranked[0]?.trade ?? tapped ?? "mechanic";
  const needsConfirm = Boolean(
    tapped && fromProblem.length > 0 && suggested !== tapped,
  );
  return { tapped, suggested, needsConfirm, fromProblem };
}

export function tradesFromProblemText(problem: string): ProService[] {
  const q = String(problem || "").toLowerCase();
  const found: ProService[] = [];
  for (const [keyword, trades] of Object.entries(PROBLEM_MATCHES)) {
    if (!q.includes(keyword)) continue;
    for (const t of trades) {
      if (!found.includes(t)) found.push(t);
    }
  }
  return found;
}

export function resolveDispatchTrades(
  problem: string,
  selectedTrade?: ProService | string | null,
): DispatchTrades {
  const stated =
    selectedTrade && isProService(selectedTrade) ? selectedTrade : null;
  const fromProblem = tradesFromProblemText(problem);
  if (fromProblem.length > 0) {
    const mismatch = Boolean(stated && !fromProblem.includes(stated));
    return {
      statedTrade: stated,
      fromProblem,
      dispatchTrades: fromProblem,
      primary: fromProblem[0]!,
      mismatch,
    };
  }
  if (stated) {
    return {
      statedTrade: stated,
      fromProblem: [],
      dispatchTrades: [stated],
      primary: stated,
      mismatch: false,
    };
  }
  const raw = String(selectedTrade || "").trim();
  if (raw) {
    return {
      statedTrade: null,
      fromProblem: [],
      dispatchTrades: [raw as ProService],
      primary: "mechanic",
      mismatch: false,
    };
  }
  return {
    statedTrade: null,
    fromProblem: [],
    dispatchTrades: ["mechanic"],
    primary: "mechanic",
    mismatch: false,
  };
}

export function proOffersAnyTrade(
  trades: string[],
  p: { primary_service?: string | null; services?: unknown },
): boolean {
  const want = new Set(
    trades
      .map((t) =>
        String(t || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  if (want.size === 0) return true;
  const primary = String(p.primary_service || "")
    .trim()
    .toLowerCase();
  if (primary && want.has(primary)) return true;
  const list = p.services;
  if (Array.isArray(list)) {
    return list.some((s) =>
      want.has(
        String(s || "")
          .trim()
          .toLowerCase(),
      ),
    );
  }
  return false;
}
