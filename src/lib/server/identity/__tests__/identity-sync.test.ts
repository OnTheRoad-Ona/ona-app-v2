import { describe, it, expect } from "vitest";
import {
  ensureUserRole,
  syncPayoutAcrossRoles,
  detectMergeCandidates,
  detectMergeCandidatesForUser,
  mergeIdentities,
  identityStatus,
  runIdentitySync,
} from "@/lib/server/identity/identity-sync";

type Row = Record<string, unknown>;

/** Minimal in-memory fake of the PostgREST client used by identity-sync. */
class FakeDb {
  rows: Record<string, Row[]>;
  upserts: Array<{ table: string; row: Row }> = [];

  constructor(tables: Record<string, Row[]>) {
    this.rows = tables;
  }

  from(table: string) {
    return new Q(this, table);
  }
}

class Q {
  db: FakeDb;
  table: string;
  filters: Array<{ col: string; val: unknown }> = [];
  orRaw: string[] = [];
  wantSelect = false;
  limitN: number | null = null;
  orderBy: Array<{ col: string; asc: boolean }> = [];
  insertRow?: Row;
  updateRow?: Row;
  isDelete = false;
  conflictKey?: string;

  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select() {
    this.wantSelect = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }
  or(raw: string) {
    this.orRaw.push(raw);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ col, val: vals });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  private matches(row: Row): boolean {
    for (const f of this.filters) {
      if (Array.isArray(f.val)) {
        if (!f.val.includes(row[f.col])) return false;
      } else if (row[f.col] !== f.val) {
        return false;
      }
    }
    for (const raw of this.orRaw) {
      const parts = raw.split(",");
      const anyHit = parts.some((part) => {
        const m = /^(\w+)\.eq\.(.+)$/.exec(part);
        if (!m) return false;
        return String(row[m[1]]) === m[2];
      });
      if (!anyHit) return false;
    }
    return true;
  }

  private sorted(rows: Row[]): Row[] {
    const out = [...rows];
    for (const { col, asc } of [...this.orderBy].reverse()) {
      out.sort((a, b) => {
        const av = String(a[col] ?? "");
        const bv = String(b[col] ?? "");
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return out;
  }

  async maybeSingle() {
    const rows = this.sorted(this.db.rows[this.table] ?? []).filter((r) =>
      this.matches(r)
    );
    return { data: rows[0] ?? null, error: null };
  }

  insert(row: Row) {
    this.insertRow = row;
    return this;
  }
  upsert(row: Row, opts?: { onConflict?: string }) {
    this.insertRow = row;
    this.conflictKey = opts?.onConflict;
    return this;
  }
  update(row: Row) {
    this.updateRow = row;
    return this;
  }
  delete() {
    this.isDelete = true;
    return this;
  }

  then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
    const rows = this.db.rows[this.table] ?? [];
    const matches = rows.filter((r) => this.matches(r));
    try {
      if (this.isDelete) {
        const kept = rows.filter((r) => !this.matches(r));
        this.db.rows[this.table] = kept;
        resolve({ data: matches, error: null });
        return;
      }
      if (this.insertRow) {
        const row = { ...this.insertRow };
        if (this.conflictKey) {
          const key = this.conflictKey;
          const existing = rows.find((r) => r[key] === row[key]);
          if (existing) {
            Object.assign(existing, row);
            this.db.upserts.push({ table: this.table, row });
            resolve(this.wantSelect ? { data: [existing], error: null } : { error: null });
            return;
          }
        }
        rows.push(row);
        this.db.rows[this.table] = rows;
        this.db.upserts.push({ table: this.table, row });
        resolve(this.wantSelect ? { data: [row], error: null } : { error: null });
        return;
      }
      if (this.updateRow) {
        for (const r of matches) Object.assign(r, this.updateRow);
        resolve({ data: matches, error: null });
        return;
      }
      resolve({ data: this.sorted(matches), error: null });
    } catch (e) {
      reject(e);
    }
  }
}

const userId = "00000000-0000-0000-0000-000000000001";
const otherId = "00000000-0000-0000-0000-000000000002";

function baseDb(): FakeDb {
  return new FakeDb({
    profiles: [
      { id: userId, full_name: "Ade", phone: "+2348010000001", email: "a@o.com", is_active: true },
      { id: otherId, full_name: "Ade (pro)", phone: "+2348020000002", email: "a.pro@o.com", is_active: true },
    ],
    motorist_profiles: [{ user_id: userId, bank_account_number: "0123456789", bank_code: "058", created_at: "2026-01-01T00:00:00Z" }],
    repair_pro_profiles: [{ user_id: otherId, bank_account_number: "0123456789", bank_code: "058", created_at: "2026-02-01T00:00:00Z" }],
    service_requests: [{ id: "job-1", motorist_id: otherId, repair_pro_id: null }],
    user_roles: [],
    payout_methods: [],
    identity_sync_log: [],
    identity_merges: [],
    notifications: [],
    conversations: [],
    messages: [],
  });
}

describe("ensureUserRole", () => {
  it("registers a role and is idempotent", async () => {
    const db = baseDb();
    const first = await ensureUserRole(db as never, userId, "motorist");
    expect(first.ok).toBe(true);
    expect(first.created).toBe(true);
    const again = await ensureUserRole(db as never, userId, "motorist");
    expect(again.created).toBe(false);
    const roles = db.rows.user_roles.filter((r) => r.user_id === userId);
    expect(roles).toHaveLength(1);
  });
});

describe("syncPayoutAcrossRoles", () => {
  it("copies a customer bank to the pro side and writes the canonical record", async () => {
    const db = baseDb();
    // Give the user a pro side row (created at pro signup) that is missing a bank.
    db.rows.repair_pro_profiles.push({ user_id: userId });
    const res = await syncPayoutAcrossRoles(db as never, userId);
    expect(res.ok).toBe(true);
    // Canonical record written.
    const pm = db.rows.payout_methods.find((r) => r.user_id === userId);
    expect(pm?.account_number_last4).toBe("6789");
    expect(pm?.linked_role).toBe("motorist");
    // Pro side mirror was created (repair_pro_profiles row now has the bank).
    const pro = db.rows.repair_pro_profiles.find((r) => r.user_id === userId);
    expect(pro?.bank_account_number).toBe("0123456789");
  });

  it("does not invent a side-table row when the other role has not signed up", async () => {
    const db = baseDb();
    const res = await syncPayoutAcrossRoles(db as never, userId);
    expect(res.ok).toBe(true);
    expect(db.rows.repair_pro_profiles.some((r) => r.user_id === userId)).toBe(false);
    const pm = db.rows.payout_methods.find((r) => r.user_id === userId);
    expect(pm?.account_number_last4).toBe("6789");
    expect(pm?.linked_role).toBe("motorist");
  });

  it("marks a shared bank as linked to both roles", async () => {
    const db = new FakeDb({
      profiles: [],
      motorist_profiles: [
        { user_id: userId, bank_account_number: "0123456789", bank_code: "058" },
      ],
      repair_pro_profiles: [
        { user_id: userId, bank_account_number: "9876543210", bank_code: "058" },
      ],
      payout_methods: [],
      user_roles: [],
      identity_sync_log: [],
    });
    const res = await syncPayoutAcrossRoles(db as never, userId);
    expect(res.ok).toBe(true);
    const pm = db.rows.payout_methods.find((r) => r.user_id === userId);
    expect(pm?.linked_role).toBe("both");
  });
});

describe("runIdentitySync", () => {
  it("registers both roles when both side tables exist", async () => {
    const db = baseDb();
    db.rows.repair_pro_profiles.push({ user_id: userId });
    const res = await runIdentitySync(db as never, userId);
    expect(res.ok).toBe(true);
    expect(res.roles).toContain("motorist");
    expect(res.roles).toContain("repair_pro");
    const registered = db.rows.user_roles.filter((r) => r.user_id === userId);
    expect(registered.map((r) => r.role_type).sort()).toEqual(["motorist", "repair_pro"]);
  });
});

describe("detectMergeCandidates", () => {
  it("finds a motorist + pro account sharing a BVN last-4", async () => {
    const db = baseDb();
    db.rows.motorist_profiles[0] = {
      user_id: userId,
      bvn_last4: "1234",
      created_at: "2026-01-01T00:00:00Z",
    };
    db.rows.repair_pro_profiles[0] = {
      user_id: otherId,
      bvn_last4: "1234",
      created_at: "2026-02-01T00:00:00Z",
    };
    const res = await detectMergeCandidates(db as never);
    expect(res.added).toBeGreaterThan(0);
    const cand = db.rows.identity_merges[0];
    expect(cand?.primary_user_id).toBe(userId);
    expect(cand?.duplicate_user_id).toBe(otherId);
    expect(cand?.status).toBe("pending");
  });

  it("matches two pro accounts sharing a full Driver's Licence number", async () => {
    const db = baseDb();
    db.rows.repair_pro_profiles = [
      { user_id: userId, gov_id_kind: "drivers_licence", gov_id_number: "LA-123-456", created_at: "2026-01-01T00:00:00Z" },
      { user_id: otherId, gov_id_kind: "drivers_licence", gov_id_number: "la123456", created_at: "2026-02-01T00:00:00Z" },
    ];
    const res = await detectMergeCandidates(db as never);
    expect(res.added).toBe(1);
    const cand = db.rows.identity_merges[0];
    expect(cand?.match_reason).toBe("drivers_licence");
    expect(cand?.primary_user_id).toBe(userId);
    expect(cand?.duplicate_user_id).toBe(otherId);
  });

  it("matches two customer accounts sharing a full Passport number", async () => {
    const db = baseDb();
    db.rows.motorist_profiles = [
      { user_id: userId, gov_id_kind: "international_passport", gov_id_number: "A1234567", created_at: "2026-01-01T00:00:00Z" },
      { user_id: otherId, gov_id_kind: "passport", gov_id_number: "A 123 4567", created_at: "2026-02-01T00:00:00Z" },
    ];
    const res = await detectMergeCandidates(db as never);
    expect(res.added).toBe(1);
    expect(db.rows.identity_merges[0]?.match_reason).toBe("passport");
  });

  it("ignores deleted accounts as match targets", async () => {
    const db = baseDb();
    db.rows.profiles[1] = {
      id: otherId,
      full_name: "deleted",
      phone: "x",
      email: "x@x.com",
      is_active: false,
      deleted_at: "2026-05-01T00:00:00Z",
    };
    db.rows.motorist_profiles = [
      { user_id: userId, nin_last4: "1234", created_at: "2026-01-01T00:00:00Z" },
    ];
    db.rows.repair_pro_profiles = [
      { user_id: otherId, nin_last4: "1234", created_at: "2026-02-01T00:00:00Z" },
    ];
    const res = await detectMergeCandidates(db as never);
    expect(res.added).toBe(0);
  });

  it("does not flag a dual-role identity against itself", async () => {
    const db = baseDb();
    db.rows.motorist_profiles = [
      { user_id: userId, nin_last4: "1234", created_at: "2026-01-01T00:00:00Z" },
    ];
    db.rows.repair_pro_profiles = [
      { user_id: userId, nin_last4: "1234", created_at: "2026-02-01T00:00:00Z" },
    ];
    const res = await detectMergeCandidates(db as never);
    expect(res.added).toBe(0);
  });

  it("detectMergeCandidatesForUser only queues pairs involving that account", async () => {
    const db = baseDb();
    const third = "00000000-0000-0000-0000-000000000003";
    db.rows.profiles.push({ id: third, full_name: "Third", is_active: true });
    db.rows.motorist_profiles = [
      { user_id: userId, bvn_last4: "9999", gov_id_kind: "passport", gov_id_number: "P100", created_at: "2026-01-01T00:00:00Z" },
      { user_id: third, gov_id_kind: "passport", gov_id_number: "P100", created_at: "2026-03-01T00:00:00Z" },
    ];
    db.rows.repair_pro_profiles = [
      { user_id: otherId, bvn_last4: "9999", created_at: "2026-02-01T00:00:00Z" },
    ];
    const res = await detectMergeCandidatesForUser(db as never, otherId);
    expect(res.added).toBe(1);
    const cand = db.rows.identity_merges[0];
    expect(cand?.primary_user_id).toBe(userId);
    expect(cand?.duplicate_user_id).toBe(otherId);
  });

  it("does not re-add a pair that was already handled", async () => {
    const db = baseDb();
    db.rows.motorist_profiles = [
      { user_id: userId, nin_last4: "7777", created_at: "2026-01-01T00:00:00Z" },
    ];
    db.rows.repair_pro_profiles = [
      { user_id: otherId, nin_last4: "7777", created_at: "2026-02-01T00:00:00Z" },
    ];
    db.rows.identity_merges = [
      { primary_user_id: userId, duplicate_user_id: otherId, status: "rejected" },
    ];
    const res = await detectMergeCandidates(db as never);
    expect(res.added).toBe(0);
  });
});

describe("mergeIdentities", () => {
  it("moves history to the primary, registers roles, and disables the duplicate", async () => {
    const db = baseDb();
    db.rows.user_roles = [
      { user_id: otherId, role_type: "repair_pro" },
    ];
    const res = await mergeIdentities(db as never, {
      primaryUserId: userId,
      duplicateUserId: otherId,
      performedBy: userId,
    });
    expect(res.ok).toBe(true);

    // Job reference moved to primary.
    expect(db.rows.service_requests[0].motorist_id).toBe(userId);
    // Roles registered on primary (motorist kept + pro added).
    const primaryRoles = db.rows.user_roles
      .filter((r) => r.user_id === userId)
      .map((r) => r.role_type);
    expect(primaryRoles.sort()).toEqual(["motorist", "repair_pro"]);
    // Duplicate soft-disabled, its own registry rows removed.
    const dupProfile = db.rows.profiles.find((p) => p.id === otherId);
    expect(dupProfile?.is_active).toBe(false);
    expect(dupProfile?.deleted_at).toBeTruthy();
    expect(db.rows.user_roles.filter((r) => r.user_id === otherId)).toHaveLength(0);
    // Merge log written under primary.
    const log = db.rows.identity_sync_log.find(
      (r) => r.user_id === userId && r.action === "merge_completed"
    );
    expect(log?.result).toBe("ok");
  });

  it("refuses to merge an account into itself", async () => {
    const db = baseDb();
    const res = await mergeIdentities(db as never, {
      primaryUserId: userId,
      duplicateUserId: userId,
    });
    expect(res.ok).toBe(false);
  });

  it("merges two same-role accounts (customer + customer)", async () => {
    const db = baseDb();
    db.rows.motorist_profiles = [
      { user_id: userId, vehicle_make: "Toyota", bank_account_number: "1111111111", created_at: "2026-01-01T00:00:00Z" },
      { user_id: otherId, vehicle_make: null, bank_account_number: "2222222222", created_at: "2026-02-01T00:00:00Z" },
    ];
    db.rows.repair_pro_profiles = [];
    const res = await mergeIdentities(db as never, {
      primaryUserId: userId,
      duplicateUserId: otherId,
    });
    expect(res.ok).toBe(true);
    // One motorist row remains on the primary, with empty fields filled from dup.
    const primaryRows = db.rows.motorist_profiles.filter((r) => r.user_id === userId);
    expect(primaryRows).toHaveLength(1);
    expect(primaryRows[0].vehicle_make).toBe("Toyota");
    expect(primaryRows[0].bank_account_number).toBe("1111111111");
    // Duplicate side-table row removed and profile soft-disabled.
    expect(db.rows.motorist_profiles.some((r) => r.user_id === otherId)).toBe(false);
    const dup = db.rows.profiles.find((p) => p.id === otherId);
    expect(dup?.is_active).toBe(false);
    expect(dup?.deleted_at).toBeTruthy();
  });
});

describe("identityStatus", () => {
  it("reports needs_sync when the role registry is missing a side table", async () => {
    const db = baseDb();
    // Registry has motorist only, but the identity also has a pro side row.
    db.rows.user_roles = [{ user_id: userId, role_type: "motorist", role_status: "active" }];
    db.rows.repair_pro_profiles.push({ user_id: userId });
    const status = await identityStatus(db as never, userId);
    expect(status.hasMotorist).toBe(true);
    expect(status.hasPro).toBe(true);
    expect(status.syncStatus).toBe("needs_sync");
    expect(status.roles).toEqual(["motorist"]);
  });
});
