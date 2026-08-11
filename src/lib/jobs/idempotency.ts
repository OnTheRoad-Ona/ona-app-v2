"use client";

/**
 * Client-side idempotency ("sticker") store.
 *
 * Ona must never double-create data when the network is bad. The rule:
 * the client keeps one sticker per *intent* and reuses it across retries.
 * The server dedupes by sticker, so a manual retry after a lost response
 * can never create a duplicate offer or duplicate request.
 *
 * A sticker lives until the request succeeds (then it is cleared), so the
 * next legitimately identical send gets a fresh sticker. Changing the
 * amount (offers) or the payload (requests) keys the sticker differently.
 */

const MAP_KEY = "om-idem-keys";
const MAX_ENTRIES = 50;
const TTL_MS = 48 * 60 * 60 * 1000;

type Stored = { sticker: string; ts: number };

function readMap(): Record<string, Stored> {
  try {
    const raw = localStorage.getItem(MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Stored>) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, Stored>) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    /* storage full / unavailable — idempotency degrades gracefully */
  }
}

function prune(map: Record<string, Stored>): Record<string, Stored> {
  const now = Date.now();
  const entries = Object.entries(map);
  const fresh = entries
    .filter(([, v]) => v && v.sticker && now - v.ts < TTL_MS)
    .sort((a, b) => a[1].ts - b[1].ts);
  const keep = fresh.slice(-MAX_ENTRIES);
  return Object.fromEntries(keep);
}

function makeSticker(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** True when localStorage can actually persist (not undefined / quota-blocked). */
function storageAvailable(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const probe = "__ona_idem_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the existing sticker for this intent, or mint and persist a new one.
 * Returns null when storage is unavailable (server then skips dedupe).
 */
export function getOrCreateIdemKey(intentKey: string): string | null {
  if (!storageAvailable()) return null;
  const map = prune(readMap());
  const existing = map[intentKey];
  if (existing?.sticker) {
    return existing.sticker;
  }
  const sticker = makeSticker();
  map[intentKey] = { sticker, ts: Date.now() };
  writeMap(map);
  return sticker;
}

/** Intent fulfilled — a later identical send is a brand-new intent. */
export function clearIdemKey(intentKey: string): void {
  const map = prune(readMap());
  if (intentKey in map) {
    delete map[intentKey];
    writeMap(map);
  }
}
