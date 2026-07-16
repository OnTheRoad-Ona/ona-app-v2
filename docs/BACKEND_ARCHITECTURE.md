# OgaMecho backend architecture

Stack: **Next.js App Router API routes · TypeScript · Supabase (Postgres + Auth + Realtime)**

## Module map

```
src/lib/server/
  admin-auth.ts              # Staff session, roles, sensitive gate
  modules/
    index.ts                 # Public exports
    security.ts              # Password 336699, timeouts, IP helpers
    admin-roles.ts           # super_admin | customer_care | support
    sensitive-unlock.ts      # Signed unlock cookie (10 min)
    rate-limit.ts            # In-memory RL (swap Redis in multi-instance)
    crypto-fields.ts         # AES-256-GCM for NIN/BVN/bank
    audit.ts                 # admin_actions writer
    care-service.ts          # Search, live board, one-click actions
  jobs/job-store.ts          # Escrow job state machine I/O
  payments/escrow-store.ts   # Payment / escrow records
  reviews.ts · prembly.ts · africastalking.ts · resend.ts · …
```

Client job domain (shared pure logic):

```
src/lib/jobs/
  state-machine.ts   # Negotiating → … → Released / Refunded
  constants.ts       # 5% fee, timers, dispute reasons
  types.ts · evidence.ts · client.ts
```

## API surface (production)

### App (motorist / pro)

| Area | Routes |
|------|--------|
| Auth | `/api/auth/*` |
| Jobs | `/api/jobs`, `/api/jobs/[id]/*` (offer, pay, transition, location, dispute, appeal, rate) |
| Escrow pay | `/api/payments/*` |
| Pros | `/api/pros/*` |
| Verify | `/api/verify/nin`, `/api/verify/bvn` |
| Calls | `/api/call/signal` |
| Config | `/api/config` |

### Customer Care / Admin

| Area | Routes |
|------|--------|
| Login | `/api/admin/auth/*` |
| **Care desk** | `/api/admin/care/status` |
| | `/api/admin/care/unlock` |
| | `/api/admin/care/search?q=` |
| | `/api/admin/care/board` |
| | `/api/admin/care/job/[id]` |
| | `/api/admin/care/user/[id]?pii=1` |
| | `/api/admin/care/action` |
| Legacy ops | `/api/admin/dashboard`, `users`, `disputes`, `payments`, `settings`, … |

## Security layers

1. **Staff session** cookie `ogamecho_admin_session` (httpOnly, 8h hard / 30m idle)  
2. **RBAC** via `profiles.admin_role`  
3. **Sensitive password** `ADMIN_SENSITIVE_PASSWORD` or default **`336699`**  
4. **Unlock cookie** `ogamecho_care_unlock` (HMAC signed, 10m)  
5. **Rate limit** unlock + sensitive routes  
6. **Audit** every sensitive action → `admin_actions`  
7. **Field encryption** helpers for PII (`ADMIN_FIELD_ENCRYPTION_KEY`)

## Escrow state machine

```
negotiating → agreed → paid_booked → en_route → arrived
→ in_progress → completed → satisfied → released
                                    ↘ disputed → under_appeal
                                    ↘ refunded / cancelled / expired
```

Platform fee: **5%** (`PLATFORM_FEE_PERCENT` in `src/lib/jobs/constants.ts`).

## Database

Migrations live in `supabase/migrations/`.  
Care/security: **`20260716_019_care_security.sql`**  
Apply with existing `npm run db:apply` / Supabase SQL editor.

## Env (production)

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_SENSITIVE_PASSWORD=336699          # change in production if desired
ADMIN_FIELD_ENCRYPTION_KEY=             # 32-byte key (hex/base64)
ADMIN_UNLOCK_SIGNING_SECRET=            # optional HMAC secret
```

## What was cleaned / kept

**Kept & improved**

- Full job escrow flow + 5% commission  
- Live tracking endpoints  
- Disputes / appeals + admin resolve  
- Verification routes (NIN/BVN)  
- In-app call signalling  
- Reviews / badges on pro profiles  
- Admin audit log  

**Care-first UI**

- `/admin` is the Customer Care desk (search + board + actions)  
- Nav prioritises Care over deep config  

**Not deleted (still used by app)**

- Existing `/api/jobs/*` and payment providers  
- Matching, maps, OTP, signup  

Dead admin “feature island” pages remain as thin tools under **System** but daily work is the Care desk.

## Extending

1. New Care action → add to `CareAction` + `executeCareAction` + UI button.  
2. New permission → `admin-roles.ts` + `requireSensitiveAction` if money/PII.  
3. Always `writeAuditLog` for irreversible ops.
