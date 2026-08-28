# Ona — Intelligent Discovery, Merit Ranking & Smart Sequential Pairing (SSPE) Refactor Plan

Status: **IMPLEMENTED** (historical notes — do not rebuild).
Author: AI Builder · Date: 2026-08-04 · Stamped 2026-08-28
Read this before touching job flow: `docs/ANTI_REGRESSION.md` (mandatory) and `AGENTS.md`.

> **Live code already shipped this.** Schema `20260804_047_sspe.sql`, `src/lib/server/pairing/pairing-engine.ts`, `src/lib/server/merit/merit-engine.ts`, `/api/jobs/pairing-sweep` cron, SSPE states in `state-machine.ts`.
>
> Figures **in this document that are stale** — use code, not the original plan:
> | Plan text | Live (`src/lib/jobs/constants.ts`) |
> |-----------|-------------------------------------|
> | 66s pairing | **144s** `PAIRING_WINDOW_MS` |
> | Radius 15→50 km | **1→2→3→5 km** |
>
> Extend SSPE from **code + `docs/RULES.md`**. This file is for state names and reservation semantics only.

---

## 0. Confirmed product decisions (from the lead)

| # | Decision | Resolution |
|---|----------|-----------|
| D1 | Negotiation & escrow | **Keep** negotiation. New dispatch states wrap the existing flow. The "I can fix this / I cannot fix this" page stays **before** the negotiation page. |
| D2 | State machine | **Add new dispatch states, map old ones.** Extend `JobFlowStatus`; existing downstream states (agreed/paid_booked/en_route/…) untouched. |
| D3 | Server timers | **Server sweep route + Vercel cron + optional pg_cron.** DB-persisted `pairing_deadline` is the single source of truth. Client never enforces timers. |
| D4 | Merit ranking | **`merit_scores` table + recalculation** after completed jobs / ratings / reviews / cancellations / disputes / availability / profile updates. Verified boosts, never hides. |
| D5 | Later | **Immediate next pro** (keep current behavior): defer that pro 5 min + immediately ping next ranked pro. |
| D6 | Decline | **Per-request only.** Pro excluded permanently from THIS request; remove the 33-min cross-request cooldown. |
| D7 | Radar | **Keep decorative.** Merit ranking drives dispatch order + discovery list, not the radar animation. |
| D8 | Execution | **Full plan first → approve → build in phases**, verifying typecheck/lint/tests after each phase. |

---

## 1. What already satisfies the spec (no change)

- Customer picks the first pro manually: `request/page.tsx:258-260`, `POST /api/jobs` requires `repairProId` (`route.ts:26-28`), `createJob` binds it. The system never overrides the customer's first choice.
- Sequential, one-pro-at-a-time dispatch already exists server-side: `findNextPro` → `assignNextPro`; decline → `rerouteDeclinedJob`; no-response → `expireUnacceptedJobs` sweep (`REROUTE_AFTER_MS = 60s`).
- Append-only, timestamped `status_history` + `job_events` + `job_status_events` tables.
- Realtime via Supabase `postgres_changes` filtered to `motorist_id` / `repair_pro_id`.
- Pro profile already stores most merit inputs (`rating_avg`, `rating_count`, `jobs_completed`, `avg_response_minutes`, `completion_rate`, `verified`, `visibility_tier`) — currently **unused for ranking**.

---

## 2. Gaps being closed

1. No server-side Merit Ranking Engine. `/api/pros` sorts by distance; `findNextPro` sorts by distance.
2. State machine has no dispatch states (`created / waiting_for_selected / selected_review / sequential_pairing / waiting_for_pro / reserved`).
3. 66s timer is client-side (`incoming-popup-timing.ts`, sessionStorage). Client must only *display*; server must *enforce*.
4. No reservations, no request-queue table, no merit-score table.
5. No cron for pairing sweeps (only daily payout cron).
6. In-memory `memory` Map merged with DB in `listJobsForUser` — DB must be authoritative for pairing.
7. `Open` does nothing server-side; a separate "I can fix this" (`START_NEGOTIATION`) arms negotiation. New model: Open ⇒ reservation ⇒ "I can fix this" ⇒ Assigned ⇒ negotiation.

---

## 3. Target state machine (extended, mapped)

### New states added to `JobFlowStatus`
| New state | Spec name | Meaning | Legacy `status` mapping |
|---|---|---|---|
| `waiting_for_selected` | WaitingForSelectedRepairPro | Customer-chosen pro has the request; 66s. Actions: **Open / Later / Decline**. | `requested` |
| `selected_review` | SelectedRepairProReview | Chosen pro tapped **Open** ⇒ reservation locked; "I can fix this / I cannot fix this". 66s. | `requested` |
| `sequential_pairing` | SequentialPairing | SSPE active (customer sees "finding another pro"); one pro at a time. | `requested` |
| `waiting_for_pro` | WaitingForRepairPro | Current pairing pro pinged; 66s. Actions: **Open / Later / Decline**. | `requested` |
| `reserved` | Reserved | Pairing pro tapped **Open** ⇒ reservation held; "I can fix this / I cannot fix this". 66s. | `requested` |

### Transition map (new additions only; downstream unchanged)
```
createJob
  └─ waiting_for_selected                    (customer-chosen pro; pairing_deadline = now+66s)
       ├─ Open      → selected_review        (create reservation; lock; deadline reset 66s)
       ├─ Later     → sequential_pairing     (defer pro 5 min; immediately next pro)
       ├─ Decline   → sequential_pairing     (per-request permanent exclusion; next pro)
       └─ timeout   → sequential_pairing     (record timeout; next pro)
selected_review
       ├─ "I can fix this"   → negotiating   (ASSIGNED; existing negotiation, 20-min timer)
       ├─ "I cannot fix this"/Decline → sequential_pairing
       └─ timeout            → sequential_pairing
sequential_pairing
       └─ dispatch one pro   → waiting_for_pro
waiting_for_pro
       ├─ Open      → reserved               (reservation; "I can fix this" page; 66s)
       ├─ Later     → sequential_pairing     (defer 5 min; next pro)
       ├─ Decline   → sequential_pairing     (per-request exclusion; next pro)
       └─ timeout   → sequential_pairing     (record timeout; next pro)
reserved
       ├─ "I can fix this"   → negotiating   (ASSIGNED)
       ├─ Decline            → sequential_pairing
       └─ timeout            → sequential_pairing
sequential_pairing
       ├─ next candidate available → waiting_for_pro
       └─ exhausted (radius expanded, still none) → expired (existing `reroute_exhausted` semantics)
```

`searching` stays in the enum (legacy alias) but is no longer the dispatch state; new states map to legacy `requested` via `flowToLegacyStatus`.

---

## 4. Database changes (new migration `20260804_047_sspe.sql`)

### 4.1 `service_requests` — add dispatch columns
```sql
alter table public.service_requests
  add column if not exists chosen_pro_id uuid references public.profiles(id) on delete set null, -- customer's first pick (history)
  add column if not exists pairing_stage text,            -- mirror of dispatch sub-stage
  add column if not exists pairing_deadline timestamptz,  -- server-owned 66s deadline (source of truth)
  add column if not exists queue_position integer,        -- 1-based position in the pairing queue
  add column if not exists remaining_candidates integer,  -- candidates left before radius expansion
  add column if not exists reservation_status text,       -- none | active | confirmed | released | expired | cancelled
  add column if not exists assignment_status text,        -- none | assigned
  add column if not exists idempotency_key text;          -- client idempotency for Open/Confirm/Decline/Later
create index if not exists service_requests_pairing_idx on public.service_requests (pairing_stage, pairing_deadline)
  where pairing_deadline is not null;
```
(`status` / `flow_status` dual model retained; `status_history` remains append-only.)

### 4.2 `request_reservations` — reservations
```sql
create table if not exists public.request_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  pro_id uuid not null references public.profiles(id) on delete cascade,
  stage text not null,                         -- selected_review | reserved
  status text not null default 'active' check (status in ('active','confirmed','released','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  confirmed_at timestamptz,
  released_by text
);
create index if not exists request_reservations_req_idx on public.request_reservations (request_id, status);
create unique index if not exists request_reservations_active_uniq
  on public.request_reservations (request_id) where status = 'active';  -- one active reservation per request
```

### 4.3 `request_pairing_queue` — pairing queue (audit + recovery)
```sql
create table if not exists public.request_pairing_queue (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  pro_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null,                    -- sequence in this request's dispatch
  source text not null,                         -- chosen | pairing
  status text not null default 'pending' check (status in ('pending','offered','opened','accepted','declined','timed_out','deferred','skipped')),
  offered_at timestamptz,
  responded_at timestamptz,
  result_note text,
  created_at timestamptz not null default now()
);
create index if not exists request_pairing_queue_req_idx on public.request_pairing_queue (request_id, position);
create unique index if not exists request_pairing_queue_pro_req_uniq
  on public.request_pairing_queue (request_id, pro_id);  -- a pro is offered a request at most once
```

### 4.4 `merit_scores` — Merit Ranking Engine persistence
```sql
create table if not exists public.merit_scores (
  pro_id uuid primary key references public.repair_pro_profiles(user_id) on delete cascade,
  score numeric(6,3) not null,                     -- 0..100 composite
  verified_bonus numeric(6,3) not null default 0,
  rating_score numeric(6,3) not null default 0,
  jobs_completed_score numeric(6,3) not null default 0,
  review_quality_score numeric(6,3) not null default 0,
  completion_rate_score numeric(6,3) not null default 0,
  dispute_rate_score numeric(6,3) not null default 0,
  response_speed_score numeric(6,3) not null default 0,
  reliability_score numeric(6,3) not null default 0,
  availability_score numeric(6,3) not null default 0,
  profile_completeness_score numeric(6,3) not null default 0,
  recent_activity_score numeric(6,3) not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists merit_scores_score_idx on public.merit_scores (score desc);
```

### 4.5 Merit inputs & dispute metrics
- Add dispute counters for reliable ranking (derived, updated on dispute resolution):
```sql
alter table public.repair_pro_profiles
  add column if not exists disputes_count integer not null default 0,
  add column if not exists disputes_won integer not null default 0,
  add column if not exists cancellations_count integer not null default 0;
```

### 4.6 Realtime
Add new tables to `supabase_realtime` publication (reservations + queue are internal service-role writes; clients read via `/api/jobs` payloads, so only `service_requests` needs realtime — already present).

---

## 5. Merit Ranking Engine (MRE) — new server module

**File:** `src/lib/server/merit/merit-engine.ts`

- `computeMeritScore(pro, ctx)` → weighted composite `0..100`. Weights (documented in module, sum ≈ 1.0):
  1. Verified (verified / face_liveness / in_person / gov_id review) — **boosts, never gates**
  2. Customer rating (`rating_avg`, count-weighted)
  3. Completed jobs (`jobs_completed`)
  4. Review quality (`rating_avg` + review text/flag distribution from `pro_reviews`)
  5. Completion rate (`completion_rate`)
  6. Low dispute rate (`1 - disputes_count/(jobs_completed+disputes_count)`, disputes_won bonus)
  7. Response speed (`avg_response_minutes`, lower = better)
  8. Reliability (completion_rate + cancellation avoidance)
  9. Availability (online + fresh heartbeat, `is_new_artisan` penalty)
  10. Distance — **handled at query time** (dispatch/find order), not stored
  11. Profile completeness (`bio`, `skills`, `vehicle_focus`, `labour_prices`, `bank_*`, photos, guarantors)
  12. Recent activity (`location_updated_at`, last job time, `visibility_tier`)
- `recalculateMerit(proId)` — recompute + upsert `merit_scores`.
- `recalculateMeritMany(proIds)` / `backfillAllMeritScores()`.
- Recalc triggers (hook into existing code paths, not DB triggers):
  - job → `released`/`satisfied` (completed)
  - rating submitted (`POST /api/jobs/[id]/rate`)
  - review submitted (`POST /api/pros/[id]/reviews`)
  - cancellation (`applyEvent` CANCEL)
  - dispute open/resolve (`dispute` routes)
  - availability change (`POST /api/pros/live`)
  - profile update (onboarding/trade/service/bank update)
- `getMeritOrderedCandidates(job, opts)` — used by SSPE; DB: join `repair_pro_profiles` + `merit_scores`, order `merit_scores.score desc`, distance as tiebreak within merit bands.

**Wire into dispatch:** replace `findNextPro`'s `.sort((a,b)=>a.km-b.km)` (job-store.ts:1518) with merit-ordered selection (distance within merit band).

**Wire into discovery:** `/api/pros` (route.ts:209-211) gains `sort=merit|nearest`; default remains nearest for marketplace, merit available for `filterAndRankTechnicians` ("Top rated" filter). Client `scoreTechnician` remains as a fallback when merit scores absent.

---

## 6. Smart Sequential Pairing Engine (SSPE) — new server module

**File:** `src/lib/server/pairing/pairing-engine.ts`

Core functions (all idempotent, DB-first, advisory-locked per request):
- `dispatchRequest(jobId)` — if `waiting_for_selected`/`waiting_for_pro`/`reserved` and no response by `pairing_deadline`, advance.
- `advancePairing(jobId)` — pop next candidate from `request_pairing_queue` (merit-ordered), set `repair_pro_id`, status → `waiting_for_pro`, `pairing_deadline = now+66s`, notify that pro, insert queue row (`offered`).
- `openRequest(jobId, proId, idempotencyKey)` — pro taps **Open**: create `request_reservations` (active, one per request), status → `selected_review`/`reserved`, `pairing_deadline = now+66s`.
- `confirmRequest(jobId, proId, idempotencyKey)` — "I can fix this": reservation → `confirmed`, status → `negotiating` (existing), arm 20-min negotiation timer, stop all pairing timers. **Assignment point.**
- `declineRequest(jobId, proId, reason)` — per-request permanent exclusion (record in `status_history` + `request_pairing_queue` `declined`); `advancePairing` immediately.
- `deferRequest(jobId, proId)` — Later: `deferred:<proId>` 5 min; `advancePairing` immediately (D5).
- `timeoutRequest(jobId)` — record `timed_out`; `advancePairing`.
- `expandRadius(jobId)` — after queue exhausted, increase radius (15km → 20km → 30km → …) and re-query; keep customer's screen alive; never force restart.

**Server sweep route:** `src/app/api/jobs/pairing-sweep/route.ts`
- Idempotent, no auth needed (guarded by secret like `expire-stale`), calls `sweepPairing(limit)`.
- `sweepPairing`: select requests where `pairing_stage in (waiting_for_selected, selected_review, waiting_for_pro, reserved)` and `pairing_deadline <= now()` and `reservation_status <> 'confirmed'`; per-row advisory lock (`pg_try_advisory_xact_lock(hashtext(id))`); apply timeout/advance atomically with `UPDATE ... WHERE pairing_stage = expected AND pairing_deadline <= now()` (compare-and-set, race-safe).

**Scheduling (D3, both):**
- Add to `vercel.json` crons: `"/api/jobs/pairing-sweep"` every minute.
- Extend existing `POST /api/jobs/expire-stale` to also call `sweepPairing` (client cadence already polls it 12s/120s).
- pg_cron: include in the migration a guarded `select cron.schedule('ona-pairing-sweep', '* * * * *', 'select public.pairing_sweep()')` guarded by `if exists (select 1 from pg_extension where extname='pg_cron')`; plus a `public.pairing_sweep()` SQL wrapper (optional; documented that the Next route is primary).

**Remove obsolete logic:**
- 33-min cross-request cooldown (D6): remove `excludeProForCustomer` / `exclusionsByCustomer` / `isProExcludedForCustomer` per-request usage → keep only per-request exclusion via `status_history` + `request_pairing_queue`.
- `rerouteDeclinedJob` replaced by `declineRequest` + `advancePairing` (kept as thin wrapper for the transition route during migration, then removed).
- `INCOMING_POPUP_VISIBLE_MS` client timer becomes display-only: client renders `pairing_deadline - now`, never enforces.

---

## 7. API & realtime changes

| Route | Change |
|---|---|
| `POST /api/jobs` | Add `chosen_pro_id`, `idempotencyKey`; create in `waiting_for_selected` with `pairing_deadline`. |
| `POST /api/jobs/[id]/transition` | Add `OPEN`, `CONFIRM`, `LATER`, `DECLINE` handling that routes to SSPE (keep existing events). Idempotency check on `idempotency_key`. |
| `POST /api/jobs/[id]/defer` | Keep, delegate to `deferRequest`. |
| `POST /api/jobs/pairing-sweep` | New server sweep. |
| `GET /api/jobs` | Include dispatch fields (`pairing_stage`, `pairing_deadline`, `reservation_status`, `queue_position`, `remaining_candidates`) in job payloads. |
| `GET /api/pros` | Optional `sort=merit`. |
| Admin dispatch API | Expose pairing stage, queue, merit, deadlines (extend `src/app/api/admin/dispatch/...`). |

**Realtime:** every SSPE transition persists to `service_requests` → existing `postgres_changes` subscriptions (`motorist_id` / `repair_pro_id`) already push to both apps; notifications inserted for the newly pinged pro. No new channels needed.

---

## 8. Network resilience & fault tolerance

- **Server-owned deadlines**: `pairing_deadline` in DB; sweep enforces even if all clients offline.
- **Idempotency**: `idempotency_key` on Open/Confirm/Decline/Later; server dedupes replayed requests.
- **Atomicity**: compare-and-set `UPDATE ... WHERE pairing_stage = expected` + advisory locks per request.
- **Duplicate protection**: unique `request_pairing_queue (request_id, pro_id)`; unique active `request_reservations (request_id)`.
- **Recovery**: sweep is a closed loop; any interrupted dispatch resumes from DB queue state; `memory` map no longer drives pairing decisions (kept only as read cache for list responses).
- **Client**: popup/polling uses server timestamps; reconnect sync via existing poll + realtime.

---

## 9. Customer & Repair Pro UI changes

### Customer (`job-flow-screen.tsx`)
- `waiting_for_selected` → "Waiting for {chosen pro}…" + countdown from `pairing_deadline`.
- `selected_review` → "Repair Pro reviewing your request" (D1).
- `sequential_pairing` → existing SearchingScreen (radar stays decorative, D7).
- `waiting_for_pro` / `reserved` → "Finding another pro…" / "Repair Pro reviewing your request".
- No new timer logic — all countdowns render `pairing_deadline`.

### Repair Pro (`incoming-job-popup.tsx` + a new confirmation sheet)
- Popup: **Open / Later / Decline** + 66s countdown rendered from `pairing_deadline` (display-only).
- **Open** ⇒ reservation sheet: "I can fix this / I cannot fix this" (D1). Confirm → `negotiating` (existing negotiation page). Cannot fix / Decline → SSPE advances.
- All three buttons call SSPE APIs with idempotency keys.
- Dashboard "Incoming" filter (`INCOMING_STATUSES`) extended to include the new dispatch states.

---

## 10. Admin dashboard

Extend the dispatch board to show per request:
- Pairing stage, current pro, queue order + remaining candidates, reservation status, `pairing_deadline`, merit score of current pro, timeout/decline history (from `request_pairing_queue`), assignment time, notification status.
- Keep existing `forceRerouteJob` / `adminExpireJob` / `clearJobCooldowns` / `adminReassignJob`.

---

## 11. Performance targets (mapped to implementation)

| Target | How met |
|---|---|
| Request creation < 500 ms | Single insert + notification (unchanged path). |
| Candidate lookup < 300 ms | `merit_scores` index + DB-side filter; no per-row Google calls. |
| Merit calc < 300 ms | Weighted read of existing profile columns + `merit_scores` upsert; recalcs are event-driven, not per-dispatch. |
| Dispatch < 1 s | `advancePairing` = one indexed UPDATE + notification. |
| Realtime sync < 1 s | Existing `postgres_changes` channels. |
| Notification delivery < 2 s | Existing notifications insert + realtime. |

---

## 12. Phased execution plan (build order)

| Phase | Scope | Deliverable | Verify |
|---|---|---|---|
| **1** | DB migration `20260804_047_sspe.sql` (tables/columns/indexes) + realtime publication + pg_cron wrapper | Schema + indexes | `supabase db reset` or apply; typecheck unaffected |
| **2** | Merit Ranking Engine module + recalc hooks + backfill route | `merit-engine.ts`, recalc wiring, `/api/pros?sort=merit` | Unit tests for scoring; typecheck |
| **3** | State machine extension + SSPE module + transition routes + idempotency + sweep route + cron | `pairing-engine.ts`, new transitions, `pairing-sweep`, vercel.json | State-machine unit tests; typecheck |
| **4** | Job payload fields + `listJobsForUser`/`createJob`/`findNextPro` refactor to SSPE; remove obsolete cooldown logic | Dispatch fully DB-driven | Existing tests + typecheck |
| **5** | Customer UI (dispatch states, countdown from server) | `job-flow-screen.tsx` | Smoke tests §8 |
| **6** | Repair Pro UI (popup Open/Later/Decline + confirmation sheet + dashboard filter) | `incoming-job-popup.tsx`, new sheet | Smoke tests §8 |
| **7** | Admin dispatch board + analytics/audit visibility | Admin pages | Manual QA |
| **8** | Network resilience hardening, duplicate/race tests, full regression | Tests, load sanity | `npx tsc`, `npx vitest`, per-file eslint |

Each phase ends with typecheck + affected tests green before the next phase starts. Full smoke checklist from `docs/ANTI_REGRESSION.md` §8 runs before final sign-off.

---

## 13. Open items for you (confirm before/while building)

1. **Reservation timeout length** for `selected_review`/`reserved` (the "I can fix this" page): use the same **66s** as the popup? (Plan assumes 66s for both; easy to change.)
2. **Radius expansion steps** for SSPE: assume 15 → 20 → 30 → 50 km, then `expired`. OK?
3. **Merit default sort** for `/api/pros`: keep **nearest-first** as the marketplace default (merit available as a toggle). OK, or make merit the default?
4. **Non-verified pros in dispatch**: merit ranking may surface a verified pro first, but non-verified are still eligible (D4). Confirm no separate "verified-only" toggle is required in dispatch.
