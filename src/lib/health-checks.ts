/**
 * Pure health-check helpers for Ona ops dashboard.
 * Plug real metrics at the marked INTEGRATION points.
 */

import type {
  ComponentHealth,
  HealthIssueType,
  HealthLevel,
  HealthLog,
  HealthSeverity,
  HealthSnapshot,
} from "@/types/health";

export const STORAGE_WARN_PCT = 70;
export const STORAGE_CRIT_PCT = 90;
export const API_ERROR_WARN_PER_HOUR = 10;
export const API_ERROR_CRIT_PER_HOUR = 40;
export const AUTH_FAIL_WARN_PER_HOUR = 5;
export const AUTH_FAIL_CRIT_PER_HOUR = 25;
export const MAP_ERROR_WARN_PER_HOUR = 3;
export const MAP_ERROR_CRIT_PER_HOUR = 15;

export function worstLevel(...levels: HealthLevel[]): HealthLevel {
  if (levels.includes("critical")) return "critical";
  if (levels.includes("warning")) return "warning";
  if (levels.includes("unknown")) return "unknown";
  return "healthy";
}

export function levelFromCounts(
  count: number,
  warnAt: number,
  critAt: number
): HealthLevel {
  if (count >= critAt) return "critical";
  if (count >= warnAt) return "warning";
  return "healthy";
}

export function storageLevel(pctUsed: number): HealthLevel {
  if (pctUsed >= STORAGE_CRIT_PCT) return "critical";
  if (pctUsed >= STORAGE_WARN_PCT) return "warning";
  return "healthy";
}

/** Count issues of a type in the last N ms that are unresolved (or all recent). */
export function countRecentByType(
  logs: HealthLog[],
  type: HealthIssueType,
  windowMs = 60 * 60 * 1000,
  unresolvedOnly = false
): number {
  const since = Date.now() - windowMs;
  return logs.filter((l) => {
    if (l.type !== type) return false;
    if (unresolvedOnly && l.resolved) return false;
    return new Date(l.timestamp).getTime() >= since;
  }).length;
}

export function buildFrontendHealth(
  logs: HealthLog[],
  checkedAt: string
): ComponentHealth {
  const n = countRecentByType(logs, "Frontend Error");
  const status = levelFromCounts(n, 5, 20);
  return {
    id: "frontend",
    label: "Frontend Health",
    status,
    value: `${n} client error${n === 1 ? "" : "s"} / hr`,
    description:
      status === "healthy"
        ? "No significant client render or runtime errors reported."
        : "Client-side errors detected — check Recent Issues and error boundaries.",
    lastChecked: checkedAt,
    metrics: { clientErrorsLastHour: n },
  };
}

export function buildBackendHealth(
  logs: HealthLog[],
  checkedAt: string,
  avgResponseMs?: number | null
): ComponentHealth {
  const apiErr = countRecentByType(logs, "API Error");
  const conn = countRecentByType(logs, "Connection Issue");
  const perf = countRecentByType(logs, "Performance Warning");
  const n = apiErr + conn;
  let status = levelFromCounts(n, API_ERROR_WARN_PER_HOUR, API_ERROR_CRIT_PER_HOUR);
  if (avgResponseMs != null && avgResponseMs > 2000) {
    status = worstLevel(status, "warning");
  }
  if (avgResponseMs != null && avgResponseMs > 5000) {
    status = worstLevel(status, "critical");
  }
  const avgLabel =
    avgResponseMs != null ? `${Math.round(avgResponseMs)} ms avg` : "n/a";
  return {
    id: "backend",
    label: "Backend / API",
    status,
    value: `${n} API issues / hr · ${avgLabel}`,
    description:
      status === "healthy"
        ? "API error rate and latency within normal thresholds."
        : "Elevated API failures or slow responses — inspect route logs.",
    lastChecked: checkedAt,
    metrics: {
      apiErrorsLastHour: apiErr,
      connectionIssuesLastHour: conn,
      performanceWarningsLastHour: perf,
      avgResponseMs: avgResponseMs ?? null,
    },
  };
}

export function buildDatabaseHealth(
  checkedAt: string,
  opts: {
    connected: boolean;
    storagePctUsed: number;
    /** When true, pct is from live query; otherwise sample */
    live: boolean;
  }
): ComponentHealth {
  if (!opts.connected) {
    return {
      id: "database",
      label: "Database Health",
      status: "critical",
      value: "Connection failed",
      description: "Cannot reach Postgres / Supabase. Check service role + URL.",
      lastChecked: checkedAt,
      metrics: { connected: false, storagePctUsed: null },
    };
  }
  const pct = Math.max(0, Math.min(100, opts.storagePctUsed));
  const status = storageLevel(pct);
  return {
    id: "database",
    label: "Database Health",
    status,
    value: `${pct.toFixed(1)}% storage used`,
    description:
      status === "healthy"
        ? opts.live
          ? "DB reachable. Storage under warning threshold (70%)."
          : "DB reachable. Storage estimate under 70% (sample metric — wire real size query)."
        : status === "warning"
          ? "Storage ≥ 70%. Plan cleanup or upgrade before 90%."
          : "Storage ≥ 90%. Immediate action required.",
    lastChecked: checkedAt,
    metrics: {
      connected: true,
      storagePctUsed: pct,
      liveStorage: opts.live,
      warnAt: STORAGE_WARN_PCT,
      criticalAt: STORAGE_CRIT_PCT,
    },
  };
}

export function buildMapsHealth(
  logs: HealthLog[],
  checkedAt: string,
  mapsLiveFlag: boolean
): ComponentHealth {
  const n = countRecentByType(logs, "Map Error");
  let status = levelFromCounts(n, MAP_ERROR_WARN_PER_HOUR, MAP_ERROR_CRIT_PER_HOUR);
  if (!mapsLiveFlag) {
    status = worstLevel(status, "warning");
  }
  return {
    id: "maps",
    label: "Maps Integration",
    status,
    value: mapsLiveFlag
      ? `${n} map error${n === 1 ? "" : "s"} / hr`
      : "Live maps flag off",
    description: mapsLiveFlag
      ? status === "healthy"
        ? "Google Maps key + live flag healthy; no surge in map load failures."
        : "Map load/API errors reported — check key, billing, referrers, quota."
      : "NEXT_PUBLIC_USE_LIVE_MAPS is false or unset — app may use fallback tiles.",
    lastChecked: checkedAt,
    metrics: { mapErrorsLastHour: n, mapsLive: mapsLiveFlag },
  };
}

export function buildAuthHealth(
  logs: HealthLog[],
  checkedAt: string
): ComponentHealth {
  const n = countRecentByType(logs, "Auth Error");
  const status = levelFromCounts(
    n,
    AUTH_FAIL_WARN_PER_HOUR,
    AUTH_FAIL_CRIT_PER_HOUR
  );
  return {
    id: "auth",
    label: "Authentication",
    status,
    value: `${n} failed auth event${n === 1 ? "" : "s"} / hr`,
    description:
      status === "healthy"
        ? "Login/signup failure rate within normal bounds."
        : "Spike in auth failures — review credentials, rate limits, session cookies.",
    lastChecked: checkedAt,
    metrics: { authErrorsLastHour: n },
  };
}

export function assembleSnapshot(input: {
  logs: HealthLog[];
  dbConnected: boolean;
  storagePctUsed: number;
  storageLive: boolean;
  mapsLive: boolean;
  avgResponseMs?: number | null;
  checkedAt?: string;
}): HealthSnapshot {
  const checkedAt = input.checkedAt || new Date().toISOString();
  const components: ComponentHealth[] = [
    buildFrontendHealth(input.logs, checkedAt),
    buildBackendHealth(input.logs, checkedAt, input.avgResponseMs),
    buildDatabaseHealth(checkedAt, {
      connected: input.dbConnected,
      storagePctUsed: input.storagePctUsed,
      live: input.storageLive,
    }),
    buildMapsHealth(input.logs, checkedAt, input.mapsLive),
    buildAuthHealth(input.logs, checkedAt),
  ];
  const overall = worstLevel(...components.map((c) => c.status));
  return {
    overall,
    checkedAt,
    components,
    issues: input.logs,
    live: input.dbConnected,
  };
}

export function severityToLevel(s: HealthSeverity): HealthLevel {
  if (s === "critical") return "critical";
  if (s === "warning") return "warning";
  return "healthy";
}
