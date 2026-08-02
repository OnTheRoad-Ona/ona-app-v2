"use client";

import type { ComponentHealth, HealthLevel } from "@/types/health";

function badgeClass(status: HealthLevel): string {
  if (status === "healthy") return "om-admin-badge approved";
  if (status === "warning") return "om-admin-badge pending";
  if (status === "critical") return "om-admin-badge rejected";
  return "om-admin-badge";
}

function accent(status: HealthLevel): string {
  if (status === "healthy") return "var(--om-success)";
  if (status === "warning") return "var(--om-warn)";
  if (status === "critical") return "var(--om-danger)";
  return "var(--om-text-faint)";
}

export function StatusCard({
  component,
  loading,
}: {
  component?: ComponentHealth;
  loading?: boolean;
}) {
  if (loading || !component) {
    return (
      <div
        className="om-admin-card"
        style={{ minHeight: 120, opacity: 0.65 }}
        aria-busy
      >
        <div className="label">Checking…</div>
        <div
          className="value"
          style={{ fontSize: 16, height: 28, background: "var(--om-input)" }}
        />
        <p className="om-admin-muted" style={{ marginTop: 8, fontSize: 11 }}>
          Loading metrics
        </p>
      </div>
    );
  }

  return (
    <div
      className="om-admin-card"
      style={{
        minHeight: 120,
        borderLeft: `3px solid ${accent(component.status)}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div className="label">{component.label}</div>
        <span className={badgeClass(component.status)}>
          {component.status}
        </span>
      </div>
      <div className="value" style={{ fontSize: 15, marginTop: 6, lineHeight: 1.25 }}>
        {component.value}
      </div>
      <p
        className="om-admin-muted"
        style={{ margin: "8px 0 0", fontSize: 11, lineHeight: 1.35 }}
      >
        {component.description}
      </p>
      <p className="om-admin-muted" style={{ margin: "6px 0 0", fontSize: 10 }}>
        Last check:{" "}
        {component.lastChecked
          ? new Date(component.lastChecked).toLocaleString()
          : "Not set"}
      </p>
    </div>
  );
}
