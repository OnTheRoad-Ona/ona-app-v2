/**
 * Ona backend health monitoring types.
 * Used by admin dashboard, health-checks lib, and API routes.
 */

export type HealthLevel = "healthy" | "warning" | "critical" | "unknown";

export type HealthIssueType =
  | "Auth Error"
  | "Database Storage Low"
  | "Map Error"
  | "API Error"
  | "Frontend Error"
  | "Performance Warning"
  | "Connection Issue";

export type HealthSeverity = "info" | "warning" | "critical";

export type HealthSource =
  "frontend" | "backend" | "database" | "maps" | "auth" | "system";

export interface HealthLog {
  id: string;
  timestamp: string;
  type: HealthIssueType;
  severity: HealthSeverity;
  message: string;
  source: HealthSource;
  resolved: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface ComponentHealth {
  id: "frontend" | "backend" | "database" | "maps" | "auth";
  label: string;
  status: HealthLevel;
  /** Primary metric line (e.g. "12 errors / hr", "34% storage") */
  value: string;
  description: string;
  lastChecked: string;
  metrics?: Record<string, number | string | boolean | null>;
}

export interface HealthSnapshot {
  overall: HealthLevel;
  checkedAt: string;
  components: ComponentHealth[];
  issues: HealthLog[];
  /** True when real DB metrics used; false when using sample/fallback numbers */
  live: boolean;
}

export interface LogErrorPayload {
  type: HealthIssueType;
  severity?: HealthSeverity;
  message: string;
  source?: HealthSource;
  metadata?: Record<string, unknown>;
}
