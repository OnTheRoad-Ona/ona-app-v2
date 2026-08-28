<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Ona agent rules (mandatory)

Handover index: **`docs/HANDOFF.md`**. Visual freeze: **`docs/UI.md`**. Product rules: **`docs/RULES.md`**.

Before changing **call**, **messages**, **navigation**, **job flow**, **dashboard/jobs list**, or **negotiation/pricing**, read and obey:

**[`docs/ANTI_REGRESSION.md`](./docs/ANTI_REGRESSION.md)**

### Hard bans (regressions we already fixed)

1. **Never** `window.location.href = \`tel:…\`` (or `sms:` / `mailto:`). Use `openTelDialer()` in `src/components/call/in-app-call.tsx`.
2. **Never** leave Call/Chat buttons unwired or Chat only going to `/messages` when a job thread exists.
3. **Never** break Back: use `navigateBack` / in-app stack; clear `om-page-exit` on every route change.
4. **Never** hide additional motorist jobs from a Repair Pro who already has an active job — multi-request always.
5. **Never** hardcode negotiation as 10 min / 3 offers / price 0 — use `src/lib/jobs/constants.ts` (20 min, 6 offers, min 1, max 6 digits).

### Phone shell layout

Consumer UI is a fixed phone frame (`#ona-phone`). Preserve `h-full min-h-0` flex chains. Overlays (call, menus, popups) portal **into** the shell.

### After related edits

Run through the smoke list in `docs/ANTI_REGRESSION.md` §7 before considering the task done.

### Pre-merge gate (mandatory, no exceptions)

Before committing **any** change, run all three — a failure in any of them blocks the commit:

```bash
npm run lint && npm run typecheck && npm run test
```

- Fix, don't suppress: never disable rules or add `eslint-disable` to make lint pass.
- One concern per commit (fix the bug OR change the style, not both) so regressions can be cleanly reverted.
- Any edit to **timer / pairing / payment / clock** logic must keep a single source of truth:
  - Use the helpers in `src/lib/jobs/deadline.ts` (`windowLeftMs` / `windowStillOpen`, server-clock base).
  - Never re-derive "past deadline?" with raw `Date.now()` in a screen, list, or popup.
  - Never hardcode `66`, `20 * 60 * 1000`, or a pay/countdown window — import from `src/lib/jobs/constants.ts`.
  - Countdown contract (do not regress): render with `useExactCountdown` (fires at the exact deadline, never a 1s-late tick), display seconds with `secondsLeftFloor`, and check expiry with `isDeadlinePast` (all in `src/lib/jobs/`). Never reintroduce `Math.round` on remaining time or a `setInterval(…, 1000)`-driven expiry; the shared math has tests that must keep passing.
- Deadlines are server-owned: clients only render `pairing_deadline` / `negotiate_ends_at` / `payment_session_ends_at`; the server sweep enforces them.
