/**
 * Orange progress line for motorist Q&A (help flows).
 *
 * Fill is completed / (completed + remaining) along the actual tree path plus
 * the trade's final steps (urgency → photos → …). That keeps the bar in sync
 * with the question on screen and stops it hitting 100% mid-Q&A then jumping
 * backward at Urgency.
 */

export type HelpFlowNext = (
  current: string,
  answerId: string,
  answers: Record<string, string>,
) => string;

export type HelpFlowOptionIds = (
  current: string,
  answers: Record<string, string>,
) => string[] | undefined;

const MAX_WALK_DEPTH = 40;

/** Longest remaining Q&A hops from `current` until "final" (0 if already there). */
export function remainingHopsToFinal(args: {
  current: string;
  answers: Record<string, string>;
  next: HelpFlowNext;
  optionIds?: HelpFlowOptionIds;
  /** Screens that are not in the tree (e.g. vehicle picker → "start"). */
  bridge?: Record<string, string>;
}): number {
  const { current, answers, next, optionIds, bridge = {} } = args;
  const memo = new Map<string, number>();

  const walk = (
    id: string,
    ans: Record<string, string>,
    seen: Set<string>,
    depth: number,
  ): number => {
    if (id === "final" || depth > MAX_WALK_DEPTH) return 0;
    if (seen.has(id)) return 0;
    const cached = memo.get(id);
    if (cached != null) return cached;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    if (id === "confirm") {
      memo.set(id, 1);
      return 1;
    }
    const bridged = bridge[id];
    if (bridged) {
      const hops = 1 + walk(bridged, ans, nextSeen, depth + 1);
      memo.set(id, hops);
      return hops;
    }

    const ids = optionIds?.(id, ans);
    const choices = ids && ids.length > 0 ? ids : [""];
    let max = 0;
    for (const choice of choices) {
      const nxtAns = choice ? { ...ans, [id]: choice } : ans;
      const nxt = next(id, choice, nxtAns);
      if (!nxt || nxt === id) continue;
      max = Math.max(max, 1 + walk(nxt, nxtAns, nextSeen, depth + 1));
    }
    memo.set(id, max);
    return max;
  };

  return walk(current, answers, new Set(), 0);
}

export function helpFlowProgressPercent(args: {
  stackLength: number;
  step: string;
  finalStep: string;
  finalSteps: readonly string[];
  remainingQa: number;
}): number {
  const atFinal = args.step === "final";
  const finalCount = Math.max(1, args.finalSteps.length);
  const listed = args.finalSteps.indexOf(args.finalStep);
  const finalIndex = listed >= 0 ? listed : 0;
  const pos = Math.max(0, args.stackLength - 1) + (atFinal ? finalIndex : 0);
  const remaining = atFinal
    ? Math.max(0, finalCount - 1 - finalIndex)
    : Math.max(0, args.remainingQa) + (finalCount - 1);
  const total = pos + remaining;
  if (total <= 0) return 0;
  return Math.min(100, (pos / total) * 100);
}

/** Screens actually visited from `startId`, following stored answers. */
export function answeredScreenPath(
  answers: Record<string, string>,
  next: HelpFlowNext,
  startId = "start",
  bridge: Record<string, string> = {},
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current = startId;
  while (
    current &&
    current !== "final" &&
    current !== "confirm" &&
    !seen.has(current) &&
    path.length < MAX_WALK_DEPTH
  ) {
    seen.add(current);
    path.push(current);
    const answerId = answers[current];
    if (bridge[current]) {
      current = bridge[current];
      continue;
    }
    if (answerId == null || answerId === "") {
      const viaEmpty = next(current, "", answers);
      const viaDummy = next(current, "__none__", answers);
      if (
        viaEmpty &&
        viaEmpty === viaDummy &&
        viaEmpty !== current &&
        viaEmpty !== "final" &&
        viaEmpty !== "confirm"
      ) {
        current = viaEmpty;
        continue;
      }
      break;
    }
    current = next(current, answerId, answers);
  }
  return path;
}

export function pickAnswersOnPath(
  answers: Record<string, string>,
  path: string[],
  extraKeep: string[] = ["powertrain"],
): Record<string, string> {
  const keep = new Set(extraKeep);
  for (const id of path) {
    keep.add(id);
    keep.add(`${id}_label`);
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (keep.has(key)) next[key] = value;
  }
  return next;
}

type PathScreen = {
  question: string;
  kind: string;
  options?: { id: string; label: string }[];
};

/** Question/answer lines for the walked path only — drops leftover branches. */
export function qaLinesForPath(args: {
  answers: Record<string, string>;
  next: HelpFlowNext;
  screenOf: (id: string, answers: Record<string, string>) => PathScreen | undefined;
  startId?: string;
  bridge?: Record<string, string>;
}): string[] {
  const path = answeredScreenPath(
    args.answers,
    args.next,
    args.startId ?? "start",
    args.bridge,
  );
  const lines: string[] = [];
  for (const id of path) {
    const screen = args.screenOf(id, args.answers);
    if (!screen) continue;
    lines.push(screen.question);
    const stored = args.answers[`${id}_label`];
    if (stored) lines.push(stored);
    else if (screen.kind === "text") lines.push(args.answers[id] || "");
    else {
      const opt = screen.options?.find((o) => o.id === args.answers[id]);
      lines.push(opt?.label || args.answers[id] || "");
    }
  }
  return lines.filter(Boolean);
}
