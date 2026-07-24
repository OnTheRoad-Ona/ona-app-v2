/**
 * Customer discovery: recently booked pros get 50% less radius ranking
 * priority so others surface; active-job pros are excluded from the list
 * (they stay on History / active job until a new request later).
 */

const STORAGE_KEY = "ona-booked-pro-priority-v1";
/** Demote ranking for this many days after a book/request */
const DEMOTE_MS = 14 * 24 * 60 * 60 * 1000;

type BookMap = Record<string, number>; // proId → last booked epoch ms

function readMap(): BookMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BookMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: BookMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/** Call when customer sends a request / books this pro */
export function recordBookedPro(proId: string | null | undefined) {
  const id = String(proId || "").trim();
  if (!id) return;
  const map = readMap();
  map[id] = Date.now();
  writeMap(map);
}

/** Pros still in the demotion window (not excluded — just lower priority) */
export function getRadiusDemoteProIds(now = Date.now()): string[] {
  const map = readMap();
  const out: string[] = [];
  let dirty = false;
  for (const [id, ts] of Object.entries(map)) {
    if (!Number.isFinite(ts)) {
      delete map[id];
      dirty = true;
      continue;
    }
    if (now - ts <= DEMOTE_MS) out.push(id);
    else {
      delete map[id];
      dirty = true;
    }
  }
  if (dirty) writeMap(map);
  return out;
}
