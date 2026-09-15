# Ona — Evaluator Checklist (1 page) — :3000 + :4500

Candidate: __________ Date: __________ Reviewer: __________

### Scoring: Pass=2 | Partial=1 | Fail=0 | Need 4/6 to pass

| # | Check | P | F | Notes |
|---|-------|:--:|:--:|-------|
| 1 | **Front :3000** `in-app-call.tsx:1` shell `#ona-phone` + `h-full min-h-0` + portal inside shell | | | |
| 2 | **Front :3000+:4500** Call via `openTelDialer()` + `navigateBack` + `:4500/admin` still 200 | | | |
| 3 | **Back** `api/jobs/route.ts:1` zod + auth + uses `constants.ts:1` + `deadline.ts:windowLeftMs` | | | |
| 4 | **Back** 401/400/429 correct, no `Date.now()` expiry, no hardcoded 20min/144s | | | |
| 5 | **DB** RLS (own jobs) + indexes `pairing_deadline` + `negotiate_ends_at` + sweep query optimal | | | |
| 6 | **General** <100 lines, `lint && typecheck && test` pass, no new deps, no UI rewrite, respects `ANTI_REGRESSION.md:7` | | | |

### Result
- [ ] **Hire** (5-6) — production-ready, no regressions
- [ ] **Second round** (4) — minor fixes
- [ ] **Reject** (0-3)

### Auto-reject
- `tel:` href / `window.location.href` for call, raw `Date.now()` deadline, hardcoded `144*1000`/`20*60*1000`, breaks `:4500`, >100 lines, new libs

Decision: __________ Comments (1 line): __________
