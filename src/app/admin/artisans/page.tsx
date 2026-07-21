"use client";

/**
 * Admin: Approve Repair Pros on the visibility ladder (Tier 2 → 3 → 4).
 * Tier 1 = registered only. Approvals are admin-only.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  listArtisanProfiles,
  saveArtisanProfile,
} from "@/lib/artisan/local-store";
import {
  canTransition,
  statusLabel,
  resolveVisibilityTier,
  applyAdminTierPromotion,
  rulesForTier,
} from "@/lib/artisan/status";
import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import { tradeDef } from "@/lib/artisan/catalog";
import { maybeSeedTier4OneStar } from "@/lib/artisan/visibility-tiers";

export default function AdminArtisansPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [rows, setRows] = useState<ArtisanVerificationProfile[]>([]);
  const [filter, setFilter] = useState<string>("pending_review");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(listArtisanProfiles());
  }, []);

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/admin/auth/me");
      const meJson = await me.json();
      if (!meJson.ok) {
        router.replace("/admin/login");
        return;
      }
      setAdminName(meJson.data.fullName || meJson.data.email);
      load();
    })();
  }, [load, router]);

  const visible = rows.filter((r) =>
    filter === "all" ? true : r.status === filter
  );

  function promote(p: ArtisanVerificationProfile, target: 2 | 3 | 4) {
    const current = resolveVisibilityTier(p);
    if (p.status === "suspended") {
      setMsg("Unsuspend before promoting.");
      return;
    }
    if (p.status === "draft") {
      setMsg("Pro must submit for review before Tier 2 approval.");
      return;
    }
    if (p.status === "rejected") {
      setMsg("Rejected profiles must resubmit first.");
      return;
    }
    if (current >= target) {
      setMsg(`Already at Tier ${current} or higher.`);
      return;
    }
    // Sequential: 1→2→3→4 only
    if (target !== current + 1 && !(current === 1 && target === 2)) {
      setMsg(
        current === 1
          ? "Start with Tier 2 approval."
          : `Promote to Tier ${current + 1} first.`
      );
      return;
    }
    if (target === 2 && p.status === "pending_review") {
      if (!canTransition(p.status, "approved")) {
        setMsg(`Cannot approve from ${p.status}`);
        return;
      }
    }

    let next = applyAdminTierPromotion(p, target, adminName);

    if (target === 4 && !p.tier4OneStarSeeded) {
      const seed = maybeSeedTier4OneStar({
        alreadySeeded: false,
        ratingCount: Math.max(0, p.successfulJobsCount),
        ratingAvg: 4,
      });
      if (seed) {
        next = { ...next, tier4OneStarSeeded: true };
        setMsg(
          `Promoted ${p.fullName} to Tier 4 · 100% · 10 km · 1★ seed (had prior ratings).`
        );
      } else {
        setMsg(
          `Promoted ${p.fullName} to Tier 4 · 100% · 10 km (no 1★ seed — no prior ratings).`
        );
      }
    } else {
      const r = rulesForTier(target);
      setMsg(
        `Promoted ${p.fullName} to Tier ${target} · ${r.visibilityPercent}% visibility · max ${r.maxRadiusKm} km`
      );
    }

    saveArtisanProfile(next);
    load();
  }

  function reject(p: ArtisanVerificationProfile) {
    if (!reason.trim()) {
      setMsg("Rejection reason is required.");
      return;
    }
    if (!canTransition(p.status, "rejected")) {
      setMsg(`Cannot reject from ${p.status}`);
      return;
    }
    const next: ArtisanVerificationProfile = {
      ...p,
      status: "rejected",
      visibilityTier: 1,
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminName,
      rejectReason: reason.trim(),
    };
    saveArtisanProfile(next);
    setRejectId(null);
    setReason("");
    load();
    setMsg(`Rejected ${p.fullName}`);
  }

  return (
    <AdminShell adminName={adminName} roleLabel="Care">
      <div className="om-admin-page">
        <h1 className="om-admin-h1">Artisan review · visibility tiers</h1>
        <p className="om-admin-sub">
          Admin-only ladder: Tier 1 register → Tier 2 (30% · 30-day Live) → Tier
          3 (70% · 3 km · badge off) → Tier 4 (100% · 10 km).
        </p>

        {msg ? <div className="om-admin-banner">{msg}</div> : null}

        <div className="om-admin-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
          {[
            "pending_review",
            "draft",
            "approved",
            "rejected",
            "suspended",
            "all",
          ].map((f) => (
            <button
              key={f}
              type="button"
              className={
                filter === f ? "om-admin-btn om-admin-btn-primary" : "om-admin-btn"
              }
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All"
                : statusLabel(f as ArtisanVerificationProfile["status"])}
            </button>
          ))}
          <button type="button" className="om-admin-btn" onClick={load}>
            Refresh
          </button>
        </div>

        <div className="om-admin-table-wrap" style={{ marginTop: 16 }}>
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>Artisan</th>
                <th>Trade</th>
                <th>Status</th>
                <th>Visibility</th>
                <th>Portfolio</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="om-admin-muted">
                    No artisans in this filter.
                  </td>
                </tr>
              ) : (
                visible.map((p) => {
                  const t = tradeDef(p.trade.service);
                  const vt = resolveVisibilityTier(p);
                  const rules = rulesForTier(vt);
                  return (
                    <tr key={p.userId}>
                      <td>
                        <strong>{p.fullName}</strong>
                        <div className="om-admin-muted">{p.phone}</div>
                      </td>
                      <td>
                        {t?.label || p.trade.service}
                        {p.trade.specialty ? (
                          <div className="om-admin-muted">
                            {p.trade.specialty}
                          </div>
                        ) : null}
                      </td>
                      <td>{statusLabel(p.status)}</td>
                      <td className="om-admin-muted">
                        <strong>T{vt}</strong> · {rules.visibilityPercent}% ·{" "}
                        {rules.maxRadiusKm} km
                        {p.isNewArtisan ? " · New" : ""}
                        {p.goLiveWindowEndsAt ? (
                          <div>
                            Live until{" "}
                            {new Date(p.goLiveWindowEndsAt).toLocaleDateString()}
                          </div>
                        ) : null}
                      </td>
                      <td>{p.portfolio.length} photos</td>
                      <td className="om-admin-muted">
                        {p.submittedAt
                          ? new Date(p.submittedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            disabled={
                              vt >= 2 ||
                              (p.status !== "pending_review" &&
                                p.status !== "approved")
                            }
                            onClick={() => promote(p, 2)}
                            title="30% visibility · Go Live 30 days · New Badge"
                          >
                            Approve T2
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            disabled={vt < 2 || vt >= 3}
                            onClick={() => promote(p, 3)}
                            title="70% visibility · 3 km · remove New Badge"
                          >
                            Approve T3
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            disabled={vt < 3 || vt >= 4}
                            onClick={() => promote(p, 4)}
                            title="100% · 10 km · optional 1★ seed"
                          >
                            Approve T4
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={
                              p.status !== "pending_review" &&
                              p.status !== "approved"
                            }
                            onClick={() => {
                              setRejectId(p.userId);
                              setReason("");
                            }}
                          >
                            Reject
                          </button>
                        </div>
                        {rejectId === p.userId ? (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Rejection reason (required)"
                              rows={2}
                              style={{ width: "100%", fontSize: 12 }}
                            />
                            <button
                              type="button"
                              className="om-admin-btn"
                              style={{ marginTop: 4 }}
                              onClick={() => reject(p)}
                            >
                              Confirm reject
                            </button>
                          </div>
                        ) : null}
                        {p.rejectReason ? (
                          <div
                            className="om-admin-muted"
                            style={{ marginTop: 4 }}
                          >
                            Reason: {p.rejectReason}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
