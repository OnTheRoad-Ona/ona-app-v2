"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { cn } from "@/lib/utils";

type Tab = "overview" | "referrals" | "credits" | "cashouts" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "referrals", label: "Referrals" },
  { key: "credits", label: "Credits" },
  { key: "cashouts", label: "Cashouts" },
  { key: "settings", label: "Settings" },
];

type AdminSection = Record<string, unknown>;
type AdminRow = {
  id?: string;
  status?: string;
  userId?: string;
  referrerUserId?: string;
  referredUserId?: string;
  rewardAmount?: number;
  transactionType?: string;
  amount?: number;
  createdAt?: string;
  requestedAmount?: number;
  feeAmount?: number;
  netAmount?: number;
  key?: string;
  value?: unknown;
  changeType?: string;
  oldValue?: string;
  newValue?: string;
  riskScore?: number;
  currentName?: string;
  requestedName?: string;
  reason?: string;
  flagType?: string;
  riskLevel?: string;
  description?: string;
  adminName?: string;
  adminId?: string;
  actionType?: string;
  targetType?: string;
  targetId?: string;
};

function sectionData(data: Record<string, unknown>, key: string): AdminSection {
  const v = data[key];
  return v && typeof v === "object" ? (v as AdminSection) : {};
}
function rowsOf(section: AdminSection, key: string): AdminRow[] {
  const v = section[key];
  return Array.isArray(v) ? (v as AdminRow[]) : [];
}
function statsOf(section: AdminSection): Record<string, string | number | undefined> {
  const v = section.stats;
  return v && typeof v === "object" ? (v as Record<string, string | number | undefined>) : {};
}

export default function AdminCreditControlPage() {
  const gate = useAdminGate();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchSection = useCallback(async (section: Tab, params?: string) => {
    setLoading(true);
    try {
      const url = `/api/admin/security?section=${section}${params ? `&${params}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setData((prev) => ({ ...prev, [section]: json.data }));
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!gate.ready) return;
    void fetchSection("overview");
  }, [gate.ready, fetchSection]);

  const onAction = useCallback(async (action: string, body: Record<string, unknown>) => {
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json();
      if (json.ok) {
        setActionMsg(`${action} succeeded`);
        void fetchSection(tab);
      } else {
        setActionMsg(json.error || "Action failed");
      }
    } catch { setActionMsg("Network error"); }
    setTimeout(() => setActionMsg(null), 3000);
  }, [tab, fetchSection]);

  if (!gate.ready) return <AdminShell><div className="p-6 text-[var(--om-text-muted)]">Loading...</div></AdminShell>;
  if (gate.error) return <AdminShell><div className="p-6 text-red-500">{gate.error}</div></AdminShell>;

  const overview = sectionData(data, "overview");
  const stats = statsOf(overview);
  const refEvents = rowsOf(sectionData(data, "referrals"), "events");
  const txs = rowsOf(sectionData(data, "credits"), "transactions");
  const cashoutList = rowsOf(sectionData(data, "cashouts"), "requests");
  const settings = rowsOf(sectionData(data, "settings"), "settings");

  const card = "rounded-xl border border-[var(--om-border)] bg-[var(--om-panel)] p-4";
  const badge = (cls: string) => `inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`;

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          ["Referral Rewards Issued", `₦${(stats.totalReferralRewards ?? 0).toLocaleString()}`, "bg-green-50 text-green-700"],
          ["Total Credits Earned", `₦${(stats.totalCreditsEarned ?? 0).toLocaleString()}`, "bg-teal-50 text-teal-700"],
          ["Pending Cashouts", stats.pendingCashouts ?? 0, "bg-orange-50 text-orange-700"],
          ["Active Wallets", stats.activeWallets ?? "—", "bg-blue-50 text-blue-700"],
          ["Approval Queue", stats.approvalQueueCount ?? 0, "bg-indigo-50 text-indigo-700"],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className={cn(card)}>
            <p className="text-[11px] font-semibold text-[var(--om-text-muted)]">{String(label)}</p>
            <p className={cn("mt-1 text-[22px] font-bold", cls)}>{String(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderReferrals = () => (
    <div className="space-y-3">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--om-border)] text-[11px] font-semibold text-[var(--om-text-muted)]">
            <th className="p-2">Referrer</th>
            <th className="p-2">Referred</th>
            <th className="p-2">Reward</th>
            <th className="p-2">Status</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {refEvents.map((ev) => (
            <tr key={String(ev.id)} className="border-b border-[var(--om-border-soft)]">
              <td className="p-2 font-medium">{String(ev.referrerUserId ?? "").slice(0, 8)}</td>
              <td className="p-2">{String(ev.referredUserId ?? "").slice(0, 8)}</td>
              <td className="p-2">₦{ev.rewardAmount}</td>
              <td className="p-2"><span className={badge(
                ev.status === "approved" ? "bg-green-50 text-green-700" :
                ev.status === "rejected" ? "bg-red-50 text-red-700" :
                "bg-yellow-50 text-yellow-700"
              )}>{ev.status}</span></td>
              <td className="p-2">
                <div className="flex gap-1">
                  {ev.status === "pending" ? (
                    <>
                      <button type="button" onClick={() => onAction("approve-referral", { id: ev.id, rewardAmount: 500, reason: "Approved" })}
                        className="rounded bg-green-500 px-2 py-1 text-[10px] font-bold text-white">Approve</button>
                      <button type="button" onClick={() => onAction("reject-referral", { id: ev.id, reason: "Rejected" })}
                        className="rounded bg-red-500 px-2 py-1 text-[10px] font-bold text-white">Reject</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => onAction("reverse-referral", { id: ev.id, reason: "Reversed" })}
                      className="rounded bg-orange-500 px-2 py-1 text-[10px] font-bold text-white">Reverse</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {refEvents.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-[var(--om-text-muted)]">No referrals</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const renderCredits = () => (
    <div className="space-y-3">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--om-border)] text-[11px] font-semibold text-[var(--om-text-muted)]">
            <th className="p-2">User</th>
            <th className="p-2">Type</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Status</th>
            <th className="p-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((tx) => (
            <tr key={String(tx.id)} className="border-b border-[var(--om-border-soft)]">
              <td className="p-2 font-medium">{String(tx.userId ?? "").slice(0, 8)}</td>
              <td className="p-2 capitalize">{String(tx.transactionType ?? "").replace("_", " ")}</td>
              <td className="p-2">₦{Number(tx.amount ?? 0).toLocaleString()}</td>
              <td className="p-2"><span className={badge(
                tx.status === "completed" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
              )}>{tx.status}</span></td>
              <td className="p-2 text-[var(--om-text-muted)]">{new Date(String(tx.createdAt ?? "")).toLocaleDateString()}</td>
            </tr>
          ))}
          {txs.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-[var(--om-text-muted)]">No transactions</td></tr>}
        </tbody>
      </table>
      <div className={cn(card, "mt-4")}>
        <p className="mb-2 text-[13px] font-bold">Adjust Balance</p>
        <div className="flex gap-2">
          <input id="adj-user" placeholder="User ID" className="flex-1 rounded-lg border border-[var(--om-border)] bg-[var(--om-input)] px-3 py-2 text-[12px] outline-none" />
          <input id="adj-amount" type="number" placeholder="Amount (+/-)" className="w-32 rounded-lg border border-[var(--om-border)] bg-[var(--om-input)] px-3 py-2 text-[12px] outline-none" />
          <button type="button" onClick={() => {
            const u = (document.getElementById("adj-user") as HTMLInputElement)?.value;
            const a = Number((document.getElementById("adj-amount") as HTMLInputElement)?.value);
            if (u && a) onAction("adjust-balance", { userId: u, amount: a, reason: "Admin adjustment" });
          }} className="rounded-lg bg-[var(--om-accent)] px-4 py-2 text-[12px] font-bold text-white">Apply</button>
        </div>
      </div>
    </div>
  );

  const renderCashouts = () => (
    <div className="space-y-3">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--om-border)] text-[11px] font-semibold text-[var(--om-text-muted)]">
            <th className="p-2">User</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Fee</th>
            <th className="p-2">Net</th>
            <th className="p-2">Status</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {cashoutList.map((c) => (
            <tr key={String(c.id)} className="border-b border-[var(--om-border-soft)]">
              <td className="p-2 font-medium">{String(c.userId ?? "").slice(0, 8)}</td>
              <td className="p-2">₦{Number(c.requestedAmount ?? 0).toLocaleString()}</td>
              <td className="p-2 text-[var(--om-text-muted)]">₦{c.feeAmount}</td>
              <td className="p-2">₦{Number(c.netAmount ?? 0).toLocaleString()}</td>
              <td className="p-2"><span className={badge(
                c.status === "paid" ? "bg-green-50 text-green-700" :
                c.status === "pending" ? "bg-yellow-50 text-yellow-700" :
                c.status === "rejected" ? "bg-red-50 text-red-700" :
                "bg-blue-50 text-blue-700"
              )}>{c.status}</span></td>
              <td className="p-2">
                <div className="flex gap-1">
                  {c.status === "pending" ? (
                    <>
                      <button type="button" onClick={() => onAction("approve-cashout", { id: c.id })}
                        className="rounded bg-green-500 px-2 py-1 text-[10px] font-bold text-white">Approve</button>
                      <button type="button" onClick={() => onAction("reject-cashout", { id: c.id, reason: "Rejected" })}
                        className="rounded bg-red-500 px-2 py-1 text-[10px] font-bold text-white">Reject</button>
                    </>
                  ) : c.status === "approved" ? (
                    <button type="button" onClick={() => onAction("pay-cashout", { id: c.id })}
                      className="rounded bg-blue-500 px-2 py-1 text-[10px] font-bold text-white">Mark Paid</button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
          {cashoutList.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-[var(--om-text-muted)]">No cashout requests</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-4">
      {settings.map((s) => (
        <div key={String(s.key)} className={cn("flex items-center justify-between rounded-xl border border-[var(--om-border)] bg-[var(--om-panel)] p-4")}>
          <div>
            <p className="text-[13px] font-semibold text-[var(--om-text)]">{String(s.key ?? "").replace(/_/g, " ")}</p>
            <p className="text-[12px] text-[var(--om-text-muted)]">Current: {JSON.stringify(s.value)}</p>
          </div>
          <div className="flex items-center gap-2">
            <input id={`set-${String(s.key)}`} defaultValue={typeof s.value === "string" ? s.value : JSON.stringify(s.value)}
              className="w-32 rounded-lg border border-[var(--om-border)] bg-[var(--om-input)] px-3 py-1.5 text-[12px] outline-none" />
            <button type="button" onClick={() => {
              const el = document.getElementById(`set-${String(s.key)}`) as HTMLInputElement;
              if (el) onAction("update-setting", { key: s.key, value: el.value });
            }} className="rounded-lg bg-[var(--om-accent)] px-3 py-1.5 text-[11px] font-bold text-white">Save</button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <AdminShell>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-bold text-[var(--om-text)]">Credit Control</h1>
          {actionMsg && (
            <span className={cn("rounded-lg px-3 py-1 text-[11px] font-semibold", actionMsg.includes("succeeded") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
              {actionMsg}
            </span>
          )}
        </div>

        <AdminGuideBanner pageId="credit-control" />

        <div className="mb-6 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); void fetchSection(t.key); }}
              className={cn(
                "rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors",
                tab === t.key ? "bg-[var(--om-accent)] text-white" : "bg-[var(--om-nav)] text-[var(--om-text)] hover:bg-[var(--om-nav-hover)]"
              )}
            >{t.label}</button>
          ))}
        </div>

        {loading && <p className="text-[13px] text-[var(--om-text-muted)]">Loading...</p>}

        {tab === "overview" && renderOverview()}
        {tab === "referrals" && renderReferrals()}
        {tab === "credits" && renderCredits()}
        {tab === "cashouts" && renderCashouts()}
        {tab === "settings" && renderSettings()}
      </div>
    </AdminShell>
  );
}
