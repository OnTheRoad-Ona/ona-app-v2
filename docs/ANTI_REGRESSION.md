# Ona — anti-regression rules (do not reintroduce)

These bugs already shipped once. **Never reintroduce them.** Agents and humans must treat this file as mandatory.

## 1. Phone shell must never collapse

The consumer app lives inside `#ona-phone` (fixed max height, flex column).

**Never:**
- Set `window.location.href` / `location.assign` / `location.replace` to `tel:`, `sms:`, `mailto:`, or other external schemes
- Navigate away from the SPA for “call” handoff
- Leave `om-page-exit` on the shell after animations
- Use full-page overlays that unmount the shell or set height to 0
- Build secondary pages without `h-full min-h-0 flex flex-col overflow-hidden` when they have internal scroll

**Always:**
- Use `openTelDialer()` from `@/components/call/in-app-call` (temporary `<a href="tel:">` click)
- Keep call UI as a portal overlay **inside** the phone shell; End call must fully clear phase/timers/mic
- Clear exit class via `clearPageExitClass()` on route change and back
- Prefer `navigateBack(router, fallback)` / `router.push` over fragile `history.back()` after external app handoffs

## 2. Call + Message actions must stay wired

On job / profile surfaces:

**Never:**
- Render Call or Chat icons with no `onClick` / dead buttons
- Send Chat to a bare `/messages` list when a job-specific thread exists (or can be created)

**Always:**
- Call → `useInAppCall().startCall({ name, phone, … })` with a real phone when available
- Chat → open `/messages/{threadId}` via `ensureChatForRequest` (or existing thread for that job)
- If phone is missing, show a flash and prefer Chat — do not blank the UI

## 3. Back navigation = hierarchical parent only

**Never:**
- `router.back()` / `history.back()` / browser “previous page”
- Session visit stacks that send users to random earlier screens
- Cross-role hops via Back (only menu **Use as** switches roles)
- Leave secondary pages without a logical parent

**Always:**
- `navigateBack(router, backHref?, accountType)` → `router.push` to **logical parent**
- Parent comes from explicit `backHref` or `smartBackFallback(pathname, role)`
- Examples: Settings child → `/settings` → role home; Job detail → `/jobs`; Request detail → `/history` (customer) or `/jobs` (pro); Chat thread → jobs/requests list
- Multi-step **wizards** (signup steps) use local step state for in-flow Back — not browser history

## 4. Repair Pro multi-request (always notify)

**Never:**
- Hide new motorist jobs because the pro already has an active trip
- Auto-set the pro Away / offline solely because one job started
- Filter the pro job list down to a single “current” job

**Always:**
- List all non-terminal jobs for that pro (negotiating sorted first)
- Surface new requests via `IncomingJobPopup` even mid-job
- Keep a “+N other requests” path back to `/jobs`

## 5. Negotiation product rules (source of truth: `src/lib/jobs/constants.ts`)

| Rule | Value |
|------|--------|
| Window | **20 minutes** (`NEGOTIATE_WINDOW_MS`) |
| Max offers total | **6** (`MAX_NEGOTIATION_OFFERS`) |
| Min price | **1** (not 0) |
| Max digits | **6** (amount ≤ 999999) |

**Never** hardcode `10 * 60 * 1000`, max 3 offers, or allow amount `0` in UI/API without going through these constants and `validateOfferAmount` / `canPlaceOffer`.

UI offer input: digits only, `maxLength={MAX_OFFER_DIGITS}`, reject pure zeros. API: `z.number().int().min(1).max(999_999)`.

## 6. Layout / scroll checklist (any new full-screen page)

```
outer:  flex h-full min-h-0 flex-col overflow-hidden
header: shrink-0
body:   min-h-0 flex-1 overflow-y-auto overscroll-contain
footer: shrink-0 (if any)
```

Portals for menus/call sheets must mount on `#ona-phone`, not `document.body` alone when that would break the shell.

## 7. Mobile data — never reintroduce these burners

| Consumer | Rule |
|----------|------|
| Trip GPS `POST /api/jobs/.../location` | **No Google Distance Matrix** — haversine only; slim response |
| Marketplace `/api/pros` | **Haversine only** — no batch Distance Matrix on list |
| Supabase Realtime jobs | Filter by `motorist_id` / `repair_pro_id` of current user only |
| Supabase Realtime pros | **Disabled** — GPS writes must not refresh all motorists |
| Reverse geocode | At most every **15 min** |
| Job list polls | ≥ **60s**; pause when tab hidden |
| Live pro GPS upload | ≥ **45–60s** between pushes |
| Intro video | `preload="none"` — do not auto-download 600KB+ on open |
| In-app call | Prefer WebRTC via Supabase signaling; `tel:` only via `openTelDialer` never `location.href` |

### In-app voice (WebRTC)
- Signaling: Realtime broadcast on `call-inbox:{userId}` + `call-session:{callId}`
- STUN only (Google public) — no paid TURN required for many networks
- Job Call passes `userId` (peer) + optional `phone` fallback
- Incoming: Accept / Decline UI on the other device when app is open

## 8. Pre-merge smoke (call / message / negotiate)

1. Open active job → Call → dialer opens → End call → shell intact → Back works  
2. Job → Chat → thread opens → Back → messages → Back → previous screen  
3. Pro Live with job A open → new job B request → popup or badge → can open B  
4. Negotiate: timer ~20:00, up to 6 offers, reject `0` and 7+ digit amounts  

If any step fails, **do not ship**.

## 9. I’m Satisfied / release pay after pro marks complete

**Never:**
- Treat job status `completed` as “finished / link unavailable” in notification center or toasts
- Use `isJobFinishedStatus` alone to block navigation to `/jobs/[id]` (it includes `completed` for chat-end only)
- Leave the customer on home with only a notification when pro taps Mark complete

**Always:**
- `completed` stays a **live shell** status (`JOB_LIVE_SHELL_STATUSES` / `isJobLiveShellStatus`)
- Notification open → `/jobs/{id}` with **I’M SATISFIED — RELEASE PAYMENT** CTA
- Gate navigation with `isNavigationBlocked` / `isJobHistoryOnlyStatus` (not blanket finished)
- `MotoristReleasePayGate` force-routes motorist to `/jobs/{id}` while status is `completed`

## 10. Repair Pro incoming Service Request lower panel — never regress

**Never:**
- Put a border/outline on the request **cards** inside the panel (`incoming-job-popup.tsx`) — cards are `border: none`, visually separated by `gap` only
- Flatten the panel to fewer than three levels (`level: "middle" | "full" | "collapsed"`) or start it collapsed/minimized — it opens at **middle** on an incoming request; only a **swipe-down** steps it down (full → middle → collapsed), a swipe-up/flip goes to **full**
- Lose the middle level's **2-at-a-time** Q&A frames (chevron paging, `pageSize={2}`), or cap the **full** level below **77% of the phone shell** (`height: min(77%,760px)`, all Q&A on one scrollable page)
- Let the panel collapse while the user scrolls at **full** — the card list scrolls **inside** the panel (`[data-panel-scroll]` is `flex-1 min-h-0 overflow-y-auto`); only a deliberate swipe-down on the grabber/header steps it down, and at full the wheel/pointer skip that scroll area
- Lose the reset-to-top on level change — every expansion must scroll the card list to the top so the **profile picture placeholder appears first**, staying put until the user scrolls (`panelScrollRef` + `scrollTop = 0` on `level`)
- Let the expand gesture's leftover trackpad momentum scroll the fresh content — the wheel listener is **native + non-passive** (`{ passive: false }`, like `bottom-sheet.tsx`); expanding to full arms a ~400 ms cooldown that swallows wheel over `[data-panel-scroll]`, so the profile picture stays first until a deliberate scroll
- Show **₦0 / blank** for the Call Out Fee, or drop the section to "Calculating…" once a quote exists — the line is forced; when the server quote isn't payable, fall back to the **open trade** fee via `calculateCalloutFee` (`incoming-job-popup.tsx` → `tradeFallbackFee`, never ₦0 for a real trade)
- Tighten the `gap-3` between cards — the panel must stay roomy, never squeezed
- Restore a second (translucent) background layer: the panel is **one** opaque background, cards are transparent
- Make card frequency or timer logic depend on a **local-only** countdown when a server deadline exists — the ring must count the same source (`pairing_deadline` / real `negotiate_ends_at`) the customer sees
- Delay removal of a closed request (customer cancel/complete, pro decline) behind multiple polls — close must be near-instant

**Always:**
- Close the pro-side card the moment the server moves the job out of an actionable status (realtime payload → `removeJobAndMaybeNext`, plus the next poll)
- A poll must never lose a realtime/visibility update (use the `pending` re-run flag) — dropping a mid-flight update was the "close is a few seconds late" bug
- Realtime subscription for the pro (`repair_pro_id=eq.<id>`) passes its row payload through; `<img>` avatars for requests come from `profiles.avatar_url`

## 11. Repair Pro incoming card close-check — single source of truth

**Never:**
- Hand-roll "is this request card still valid?" in the popup or realtime handler with a local status list / stale check
- Let a cancelled/closed request linger on the pro's screen past ~1s because the realtime push was missed on a slow connection

**Always:**
- Use the shared `isProRequestCardKeepable(status, pairingStage)` from `src/lib/jobs/incoming-popup-timing.ts` (with `PRO_CARD_KEEP_STATUSES`) for **every** keep/close decision: list poll (`ingest`), realtime close (`applyRealtimeClose`), and the per-card status check
- While a card is visible, poll the ultra-light `/api/jobs/pro-incoming-status` (one tiny query scoped to the pro's own requests) every ~1s, and run the full lean list every few cycles to surface new offers and reconcile
- The poll cadence is decided **when the timer fires** from what is currently visible, and mount / realtime pushes arm the fast 1s interval — a freshly surfaced card must never sit behind a stale 12s idle timer before its first status check
- The contract is locked by tests in `src/lib/jobs/__tests__/incoming-popup-timing.test.ts` — extend those, never bypass them

## 12. Customer GPS — never show a "timed out" on reload

**Never:**
- Hardcode a GPS timeout under `GPS_TIMEOUT_FLOOR_MS` in a screen — the 5s boot timeout caused "Location timed out. Check GPS signal, then tap Retry." on every page reload
- Surface a location error banner from a boot or background refresh when the user already has a usable location (cached fix / manual pin)
- Reinstate a 5s `navigator.geolocation.getCurrentPosition` anywhere for the customer home

**Always:**
- Use `src/lib/location-gps.ts` for all GPS timeouts and `shouldSurfaceLocationError()` — boot/refresh is silent when a cached location exists; the banner appears only on an explicit Retry tap or when nothing usable is cached
- Budget GPS failures quietly (longer `maximumAge`, silent refresh) and let the user Retry explicitly
