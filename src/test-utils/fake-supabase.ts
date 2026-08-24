/**
 * Shared in-memory fake of the service-role Supabase client (PostgREST) for
 * unit tests.
 *
 * Mirrors the FakeDb used by the identity-sync suite: rows live in plain
 * arrays per table, queries are filtered/sorted in memory, and errors can be
 * simulated by throwing inside a query's `.then()`. Extends it with `.auth`
 * handlers so route handlers (signup, login, merge) can be exercised without
 * a network client. No database or network is ever touched.
 */

export type Row = Record<string, unknown>;

export type AuthResult = {
  data?: { user?: Row | null; session?: Row | null };
  error?: { message: string; status?: number } | null;
};

export type FakeAuthHandlers = {
  createUser?: (input: Record<string, unknown>) => Promise<AuthResult>;
  signInWithPassword?: (input: Record<string, unknown>) => Promise<AuthResult>;
  updateUserById?: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<AuthResult>;
};

const NO_ROWS_ERROR = { message: "No rows found", code: "PGRST116" };

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
}

export class FakeAuth {
  db: FakeSupabase;
  users: Row[] = [];
  private counter = 0;
  private handlers: Required<FakeAuthHandlers>;

  constructor(db: FakeSupabase, handlers: FakeAuthHandlers = {}) {
    this.db = db;
    this.handlers = {
      createUser:
        handlers.createUser ??
        (async (input) => {
          this.counter += 1;
          const id = String(input.id || `auth-user-${this.counter}`);
          const user: Row = {
            id,
            email: String(input.email || ""),
            phone: String(input.phone || ""),
            created_at: new Date().toISOString(),
          };
          this.users.push(user);
          return { data: { user }, error: null };
        }),
      signInWithPassword:
        handlers.signInWithPassword ??
        (async () => {
          this.counter += 1;
          const id = `session-user-${this.counter}`;
          return {
            data: {
              user: { id },
              session: {
                access_token: `fake-access-${this.counter}`,
                refresh_token: `fake-refresh-${this.counter}`,
                expires_at: Date.now() + 3600_000,
              },
            },
            error: null,
          };
        }),
      updateUserById:
        handlers.updateUserById ??
        (async (id) => ({ data: { user: { id } }, error: null })),
    };
  }

  get admin() {
    return {
      createUser: async (input: Record<string, unknown>) =>
        this.handlers.createUser(input),
      updateUserById: async (id: string, patch: Record<string, unknown>) =>
        this.handlers.updateUserById(id, patch),
    };
  }

  signInWithPassword(input: Record<string, unknown>) {
    return this.handlers.signInWithPassword(input);
  }
}

export class FakeSupabase {
  rows: Record<string, Row[]>;
  upserts: Array<{ table: string; row: Row }> = [];
  auth: FakeAuth;

  constructor(
    tables: Record<string, Row[]> = {},
    authHandlers?: FakeAuthHandlers,
  ) {
    this.rows = tables;
    this.auth = new FakeAuth(this, authHandlers);
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

export class FakeQuery {
  db: FakeSupabase;
  table: string;
  filters: Array<{ col: string; val: unknown }> = [];
  notFilters: Array<{ col: string; op: string; val: unknown }> = [];
  likeFilters: Array<{ col: string; pattern: string }> = [];
  orRaw: string[] = [];
  wantSelect = false;
  isSingle = false;
  limitN: number | null = null;
  orderBy: Array<{ col: string; asc: boolean }> = [];
  insertRow?: Row;
  updateRow?: Row;
  isDelete = false;
  conflictKey?: string;

  constructor(db: FakeSupabase, table: string) {
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
  not(col: string, op: string, val: unknown) {
    this.notFilters.push({ col, op, val });
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
  ilike(col: string, pattern: string) {
    this.likeFilters.push({ col, pattern });
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
  single() {
    this.isSingle = true;
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
    for (const nf of this.notFilters) {
      if (nf.op === "is" && nf.val === null) {
        if (row[nf.col] != null) return false;
      } else if (row[nf.col] === nf.val) {
        return false;
      }
    }
    for (const { col, pattern } of this.likeFilters) {
      if (!likeToRegex(pattern).test(String(row[col] ?? ""))) return false;
    }
    for (const raw of this.orRaw) {
      const parts = raw.split(",");
      const anyHit = parts.some((part) => {
        let m = /^(\w+)\.eq\.(.+)$/.exec(part);
        if (m) return String(row[m[1]]) === m[2];
        m = /^(\w+)\.not\.isnull$/.exec(part);
        if (m) return row[m[1]] != null;
        return false;
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
      this.matches(r),
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
    const single = (data: Row | Row[] | null) => {
      if (!this.isSingle) return resolve({ data, error: null });
      if (Array.isArray(data)) {
        if (data.length === 0) {
          return resolve({ data: null, error: NO_ROWS_ERROR });
        }
        return resolve({ data: data[0], error: null });
      }
      return resolve({ data, error: null });
    };
    try {
      if (this.isDelete) {
        const kept = rows.filter((r) => !this.matches(r));
        this.db.rows[this.table] = kept;
        single(matches);
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
            if (!this.wantSelect) {
              resolve({ error: null });
              return;
            }
            single([existing]);
            return;
          }
        }
        rows.push(row);
        this.db.rows[this.table] = rows;
        this.db.upserts.push({ table: this.table, row });
        if (!this.wantSelect) {
          resolve({ error: null });
          return;
        }
        single([row]);
        return;
      }
      if (this.updateRow) {
        for (const r of matches) Object.assign(r, this.updateRow);
        single(matches);
        return;
      }
      const list = this.sorted(matches);
      if (this.isSingle) {
        if (list.length === 0) {
          resolve({ data: null, error: NO_ROWS_ERROR });
          return;
        }
        resolve({ data: list[0], error: null });
        return;
      }
      resolve({ data: list, error: null });
    } catch (e) {
      reject(e);
    }
  }
}

export function createFakeSupabase(
  tables: Record<string, Row[]> = {},
  authHandlers?: FakeAuthHandlers,
): FakeSupabase {
  return new FakeSupabase(tables, authHandlers);
}
