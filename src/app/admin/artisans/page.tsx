"use client";

/**
 * Dedicated admin queue: Approve / Reject artisan profiles.
 * Reads mock localStorage via API-shaped client helpers (demo).
 * TODO(api): GET /api/admin/artisans from Supabase artisan_profiles.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  listArtisanProfiles,
  saveArtisanProfile,
} from "@/lib/artisan/local-store";
import { canTransition, statusLabel } from "@/lib/artisan/status";
import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import { tradeDef } from "@/lib/artisan/catalog";

export default function AdminArtisansPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [rows, setRows] = useState<ArtisanVerificationProfile[]>([]);
  const [filter, setFilter] = useState<string>("pending_review");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    // Client-side mock store (browser). Server-rendered admin still works
    // after hydration when Care opens this page on the same device as pros.
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

  function approve(p: ArtisanVerificationProfile) {
    if (!canTransition(p.status, "approved")) {
      setMsg(`Cannot approve from ${p.status}`);
      return;
    }
    // TODO(api): POST /api/admin/artisans/[id]/approve
    const next: ArtisanVerificationProfile = {
      ...p,
      status: "approved",
      isNewArtisan: true,
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminName,
      rejectReason: null,
    };
    saveArtisanProfile(next);
    load();
    setMsg(`Approved ${p.fullName}`);
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
    // TODO(api): POST /api/admin/artisans/[id]/reject { reason }
    const next: ArtisanVerificationProfile = {
      ...p,
      status: "rejected",
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
        <h1 className="om-admin-h1">Artisan review</h1>
        <p className="om-admin-sub">
          Manual approval before Go Live. Pending profiles cannot receive jobs.
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
              {f === "all" ? "All" : statusLabel(f as ArtisanVerificationProfile["status"])}
            </button>
          ))}
          <button type="button" className="om-admin-btn" onClick={load}>
            Refresh
          </button>
        </div>

        <p className="om-admin-muted" style={{ marginTop: 8 }}>
          Demo store is browser localStorage. Open this admin tab on the same
          browser that submitted artisan onboarding to see the queue.
        </p>

        <div className="om-admin-table-wrap" style={{ marginTop: 16 }}>
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>Artisan</th>
                <th>Trade</th>
                <th>Status</th>
                <th>Tiers</th>
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
                        P{p.tiers.tier1_phone ? "1" : "–"}
                        {p.tiers.tier2_govId || p.tiers.tier2_bvn ? "2" : ""}
                        {p.tiers.tier3_liveness ? "3" : ""}
                        {p.tiers.tier4_skillProof ? "4" : ""}
                      </td>
                      <td>{p.portfolio.length} photos</td>
                      <td className="om-admin-muted">
                        {p.submittedAt
                          ? new Date(p.submittedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            disabled={p.status !== "pending_review"}
                            onClick={() => approve(p)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={p.status !== "pending_review"}
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
                          <div className="om-admin-muted" style={{ marginTop: 4 }}>
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
