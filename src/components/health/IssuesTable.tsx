"use client";

import type {
  HealthIssueType,
  HealthLog,
  HealthSeverity,
} from "@/types/health";

const TYPES: Array<HealthIssueType | ""> = [
  "",
  "Auth Error",
  "Database Storage Low",
  "Map Error",
  "API Error",
  "Frontend Error",
  "Performance Warning",
  "Connection Issue",
];

export function IssuesTable({
  issues,
  loading,
  typeFilter,
  severityFilter,
  query,
  onTypeFilter,
  onSeverityFilter,
  onQuery,
  onToggleResolved,
}: {
  issues: HealthLog[];
  loading?: boolean;
  typeFilter: string;
  severityFilter: string;
  query: string;
  onTypeFilter: (v: string) => void;
  onSeverityFilter: (v: string) => void;
  onQuery: (v: string) => void;
  onToggleResolved: (id: string, resolved: boolean) => void;
}) {
  const filtered = issues.filter((i) => {
    if (typeFilter && i.type !== typeFilter) return false;
    if (severityFilter && i.severity !== severityFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const blob = `${i.message} ${i.type} ${i.source}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="om-admin-panel">
      <div className="om-admin-toolbar">
        <strong>Recent issues</strong>
        <input
          placeholder="Search message, type, source…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          style={{ minWidth: 200, marginLeft: "auto" }}
        />
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => onSeverityFilter(e.target.value)}
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
      </div>

      <table className="om-admin-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Message</th>
            <th>Source</th>
            <th>Resolved</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="om-admin-muted">
                Loading issues…
              </td>
            </tr>
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="om-admin-muted">
                No real issues logged. Table stays empty until something posts
                to <code>/api/log-error</code> or a health threshold is hit.
              </td>
            </tr>
          ) : (
            filtered.map((i) => (
              <tr key={i.id}>
                <td className="om-admin-muted">
                  {new Date(i.timestamp).toLocaleString()}
                </td>
                <td>{i.type}</td>
                <td>
                  <span
                    className={`om-admin-badge ${
                      i.severity === "critical"
                        ? "rejected"
                        : i.severity === "warning"
                          ? "pending"
                          : "approved"
                    }`}
                  >
                    {i.severity}
                  </span>
                </td>
                <td style={{ maxWidth: 360 }}>{i.message}</td>
                <td className="om-admin-muted">{i.source}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={i.resolved}
                    onChange={(e) => onToggleResolved(i.id, e.target.checked)}
                    aria-label={`Mark ${i.type} resolved`}
                    title="Toggle resolved"
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
