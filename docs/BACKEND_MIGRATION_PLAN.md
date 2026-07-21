# Ona backend migration plan (Phase A)

**Date:** 2026-07-21  
**Stack:** Next.js modular monolith · Supabase Postgres · Supabase Auth + app JWT  
**Payments default:** Flutterwave (Nigeria-first)  
**Admin:** Extend existing `/admin` + care APIs  

This phase delivers **audit + design + DB foundation**. No big cutover of live booking/auth paths.

---

## Decisions locked

| Topic | Choice |
|-------|--------|
| Architecture | Modular monolith (Next.js API routes) |
| Database | Supabase Postgres only source of truth |
| Auth | Supabase Auth + app JWT sessions |
| Payments | Flutterwave primary (`app_settings.payments`) |
| Admin | Extend `/admin` + care |
| Wallet | Tables now, **feature flag off** |
| Deploy | `ona-mi` (+ `ona-backend` only if later split) |

---

## What already works (preserve)

- Supabase Auth signup/login, OTP stubs, dual roles  
- Job escrow state machine + transitions + disputes  
- Paystack/Flutterwave/mock providers  
- Care desk search/board/actions + sensitive unlock  
- Admin verification hub  
- Notifications tables + APIs  
- Reviews, call signals, pro visibility tiers  
- Field encryption helpers for PII  

**Do not remove** these unless replaced with equivalent DB-backed behaviour.

---

## Gaps this foundation closes

1. **RBAC hardcoded** → DB tables `rbac_*` + seed roles/permissions  
2. **Pro onboarding mostly localStorage** → `repair_pro_profiles.pipeline_*` columns  
3. **No CRM tickets** → `support_tickets` + events  
4. **No wallet schema** → stub tables + flag  
5. **No payout ledger** → `payout_accounts` / `payouts`  
6. **Weak session inventory** → `user_sessions`  
7. **Partial audit** → `platform_audit_logs` alongside `admin_actions`  
8. **Addresses local-only** → `user_addresses`  

---

## Phased rollout

### Phase A (this delivery) — foundation

- [x] Architecture doc refresh  
- [x] Migration `20260721_026_platform_foundation_rbac.sql`  
- [x] Module scaffold under `src/lib/server/modules/*`  
- [x] RBAC service with DB load + code fallback  
- [ ] Apply migration to staging Supabase (`npm run db:apply` / SQL editor)  

### Phase B — wire critical domains to DB

1. Persist pro pipeline + verification docs server-side  
2. Auth sessions register/revoke on login/logout  
3. Settings privacy/addresses read/write Postgres  
4. Care tickets CRUD on desk  
5. Flutterwave as default in env + settings UI  

### Phase C — bookings/messaging/moderation depth

1. Immutable booking events only via service layer  
2. Message moderation + report tables  
3. Notification outbox + retry worker  
4. Analytics rollup jobs  

### Phase D — cutover cleanup

1. Remove localStorage as source of truth for pro verification  
2. Enforce API for all money/status transitions  
3. Multi-instance rate limit (Redis)  

---

## Apply migration

```bash
# Preferred
npm run db:apply
# or paste SQL into Supabase SQL editor:
# supabase/migrations/20260721_026_platform_foundation_rbac.sql
```

Verify:

```sql
select count(*) from rbac_permissions;
select count(*) from rbac_roles;
select * from feature_flags;
select value from app_settings where key = 'payments';
```

---

## Critical freeze list (must not break)

- Customer / pro signup & login  
- Job create → negotiate → pay → complete  
- Admin login + care unlock  
- Admin verification hub  
- Settings hub (UI can stay; backend gradually authoritative)  
- Repair Pro Setup onboarding UI (will persist in Phase B)  

---

## Module ownership map

| Module | Primary code path | Primary tables |
|--------|-------------------|----------------|
| Auth | `api/auth/*`, `admin-auth` | `profiles`, `user_sessions`, `phone_otps` |
| Users | `api/profile/*` | `profiles`, `motorist_profiles`, `user_addresses` |
| Pros | `api/pros/*`, `api/artisan/*` | `repair_pro_profiles` |
| Bookings/Jobs | `api/jobs/*`, `jobs/*` | `service_requests`, `job_events` |
| Payments | `api/payments/*` | `payments`, `payouts` |
| Messages | `api/messages/*` | `conversations`, `messages` |
| Notifications | `api/notifications/*` | `notifications` |
| Support | `api/admin/care/*` | `support_tickets` |
| Admin/RBAC | `api/admin/*` | `rbac_*`, `staff_role_assignments` |
| Audit | `modules/audit` | `admin_actions`, `platform_audit_logs` |
| Settings | `api/config`, `api/admin/settings` | `app_settings`, `feature_flags` |

---

## Success criteria for Phase A

1. Migration applies cleanly on a DB that already has 001–025.  
2. Existing app still boots without requiring new tables for happy path.  
3. Engineers can import domain services from `modules/index.ts`.  
4. RBAC seeds match product roles (super admin → support).  
5. Flutterwave is the documented default payment provider.  
