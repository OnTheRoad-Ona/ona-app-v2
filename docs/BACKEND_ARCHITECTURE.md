# Ona backend architecture (modular monolith)

**Product:** Ona — two-sided repair marketplace (Nigeria-first, multi-country ready)  
**Runtime:** Next.js App Router API (`src/app/api/**`)  
**Data:** Supabase Postgres = **single source of truth**  
**Auth:** Supabase Auth + app JWT / admin session cookies  
**Payments:** Flutterwave primary (Paystack retained as adapter)  

This document supersedes earlier “OgaMecho-only” notes where they conflict.

---

## Principles

1. **Preserve working product paths** — optimize, don’t delete.  
2. **Backend validates everything sensitive** — no frontend-only authority for money, roles, verification, or status transitions.  
3. **Modular monolith** — domain folders + services; not microservices.  
4. **DB-backed config & RBAC** — permissions and settings live in Postgres.  
5. **Audit critical actions** — admin + platform logs.  
6. **Nigeria-first, extend later** — wallet/cards/multi-country behind flags.  

---

## Module map

```
src/lib/server/
  admin-auth.ts                 # Staff session (extend existing)
  api-json.ts · health-service.ts · …
  modules/
    index.ts                    # Stable exports
    security.ts · rate-limit.ts · crypto-fields.ts
    admin-roles.ts              # Code fallback map
    rbac-service.ts             # DB RBAC load + hasPermission()
    audit.ts · platform-audit.ts
    care-service.ts
    sensitive-unlock.ts
    auth/                       # Session registration hooks (Phase B)
    users/                      # Profiles, addresses, soft-delete
    pros/                       # Pipeline, skills, docs
    bookings/                   # Job transition guards (wrap state-machine)
    payments/                   # Escrow + Flutterwave default
    messaging/
    notifications/
    support/                    # Tickets CRM
    moderation/
    analytics/
    settings/                   # app_settings + feature_flags
    files/
    wallet/                     # Stubs only until flag on
  jobs/ · payments/ · reviews.ts · …
```

Shared pure domain (client-safe):

```
src/lib/jobs/state-machine.ts   # Canonical job transitions
src/lib/artisan/*               # Pro onboarding types (persist via API in Phase B)
```

---

## Roles & RBAC

### Marketplace identities (`profiles.role`)

| Role | Meaning |
|------|---------|
| `motorist` | Customer |
| `repair_pro` | Repair Professional |
| `admin` | Staff gate for `/admin` |

### Staff roles (DB `rbac_roles` + `profiles.admin_role` bridge)

- Super Administrator  
- Administrator  
- Operations Manager  
- Verification Officer  
- Finance Officer  
- Moderator  
- Customer Support / Customer Care / Support (legacy aliases)  

Permissions live in **`rbac_permissions`** and are assigned via **`rbac_role_permissions`**.  
Code fallback remains in `admin-roles.ts` if DB is unreachable.

Sensitive ops still require temporary unlock password + audit (existing Care model).

---

## Domain capabilities (target state)

| Domain | Backend owns |
|--------|----------------|
| Customer | Profile, addresses, privacy, credits, soft-delete grace |
| Pro | Pipeline states, docs, skills, bank, coverage, liveness, skill proof |
| Booking | Status machine, immutable events, cancel/dispute/refund |
| Messaging | Threads, read state, moderation hooks, internal notes |
| Support | Tickets, SLA, assignment, internal notes |
| Reviews | Post-completion only, moderation |
| Notifications | Templates, channels, queue/retry (Phase C) |
| Payments | Escrow, Flutterwave charge/verify, refunds, commission |
| Payouts | Pro bank accounts, payout queue |
| Wallet | Schema ready, **disabled** |
| Moderation | Reports, suspensions, shadow ban flags |
| Analytics | Aggregates for admin dashboard (Phase C) |
| Settings | Commission, radius, OTP, maintenance, feature flags |

---

## Job status (existing — preserve)

```
negotiating → agreed → paid_booked → en_route → arrived
→ in_progress → completed → satisfied → released
                                    ↘ disputed → under_appeal
                                    ↘ refunded / cancelled / expired
```

All transitions must go through API + `job_events` / history. Invalid transitions rejected server-side.

---

## API conventions

- REST under `/api/v1/*` for **new** modules (Phase B); keep legacy `/api/*` working.  
- Consistent JSON: `{ ok, data?, error? }` via `api-json.ts`.  
- Pagination: `limit` + `cursor` or `page`.  
- Auth: Supabase bearer / cookie; admin cookie session.  
- Never trust client for role, status, or role elevation.  

---

## Security baseline

| Control | Implementation |
|---------|----------------|
| Auth | Supabase Auth |
| Admin session | httpOnly cookie, idle timeout |
| Sensitive care | Temporary password + unlock cookie |
| PII | AES helpers (`crypto-fields`) |
| Rate limit | In-memory (→ Redis multi-instance) |
| Audit | `admin_actions` + `platform_audit_logs` |
| Uploads | Size limits enforced in app (2MB image / 10MB video) |

---

## Database

Migrations: `supabase/migrations/`  

Foundation (Phase A):

- **`20260721_026_platform_foundation_rbac.sql`**

Apply: `npm run db:apply` or Supabase SQL editor.

---

## Payments

```
PAYMENT_PROVIDER=flutterwave   # preferred
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_PUBLIC_KEY=
# Paystack remains secondary adapter
```

`app_settings.payments.defaultProvider` = `flutterwave`.

---

## Background jobs (Phase C)

Queue (BullMQ / Supabase cron / Vercel cron):

- Notification delivery  
- Booking expiry  
- Document expiry reminders  
- Analytics rollups  
- Soft-delete purge after grace days  

---

## Observability

- `app_health_logs` + `/api/health`  
- Structured `console` + optional Sentry  
- Liveness debug: `[ona-liveness]` (no frames)  

---

## What Phase A does **not** do

- No microservices split  
- No forced cutover of localStorage pro drafts (Phase B)  
- No full wallet product  
- No rewrite of working job/care routes  

---

## Extending safely

1. Add table in a new migration.  
2. Add service under `modules/<domain>/`.  
3. Export from `modules/index.ts`.  
4. Thin route handler in `app/api/…`.  
5. `writeAuditLog` / `writePlatformAudit` for sensitive ops.  
6. Permission check via `rbac-service.hasPermission`.  

See **`BACKEND_MIGRATION_PLAN.md`** for phased delivery.
