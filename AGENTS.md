<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Ona agent rules (mandatory)

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
