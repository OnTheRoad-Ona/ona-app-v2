# Ona — Developer Screening (3000 + 4500)

**Stack:** Next.js 16.2 + Supabase + pg + Flutterwave/Paystack — `package.json:6`
**Ports:** `:3000` public (phone) + `:4500` admin (`NEXT_DIST_DIR=.next-admin`) — `package.json:8`
**Time:** 80 min max | **Total diff:** <100 lines | **No UI redesign, no new libs**

Use `.env.example` → `.env.local`. Run `npm run dev` (:3000) + `npm run dev:admin` (:4500).
Read `docs/ANTI_REGRESSION.md` before touching call/jobs/navigation.

---

### 1. Front-End (30 min — max 40 lines) — :3000 + verify :4500
**Files:** `src/components/call/in-app-call.tsx:1` or `src/app/jobs/[id]/page.tsx`
- Fix phone shell `#ona-phone` — keep `h-full min-h-0` flex chain, portal overlays inside shell.
- Wire Call/Chat via `openTelDialer()` (hard ban: no `tel:` href), respect `navigateBack` + `om-page-exit`.
- Verify `:4500/admin` still loads (no layout break). No Figma changes.

### 2. Back-End (30 min — max 30 lines) — shared API
**File:** `src/app/api/jobs/route.ts:1` (or `api/jobs/[id]`)
- Add `zod` validation + Supabase auth (from `src/lib/supabase`) + standard error response.
- Use `src/lib/jobs/constants.ts:1` (`NEGOTIATE_WINDOW_MS=20min`, `PAIRING_WINDOW_MS=144s`) + `src/lib/jobs/deadline.ts:windowLeftMs` — never hardcode deadlines.
- Return correct 401/400/429.

### 3. Database (20 min — max 15 lines) — shared Supabase
- SQL snippet only:
  1. RLS: customer sees own jobs, pro sees assigned + incoming pairings
  2. Indexes: `(pairing_deadline)`, `(negotiate_ends_at)` for sweep cron `api/jobs/pairing-sweep`
  3. One query: fetch active jobs with pagination, no N+1

---

### Rules
- 1 file per task. Obey `AGENTS.md:1` bans. Total <100 lines.

### Submit
- Git diff / PR + 3-line notes. Prove `:3000` + `:4500` both return 200.

### Pass / Fail
- Front: shell intact, call wired, back-nav works on both ports
- Back: validation + auth + deadline helpers used, no raw `Date.now()` expiry
- DB: RLS on, indexes exist, sweep query indexed
- Fail: >100 lines, new deps, breaks `npm run lint && typecheck && test`, or regresses `docs/ANTI_REGRESSION.md:7` smoke list
