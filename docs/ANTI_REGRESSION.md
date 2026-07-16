# OgaMecho — anti-regression rules (do not reintroduce)

These bugs already shipped once. **Never reintroduce them.** Agents and humans must treat this file as mandatory.

## 1. Phone shell must never collapse

The consumer app lives inside `#oga-mecho-phone` (fixed max height, flex column).

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

## 3. Back navigation must always work

**Never:**
- Depend only on browser history after `tel:` / dialer / camera / maps handoff
- Stack-duplicate the same path so Back loops on the same screen
- Leave Back without a sensible `backHref` fallback on secondary pages

**Always:**
- `recordNavigation` on each consumer route (`AppFrame`)
- `navigateBack` pops the in-app stack and `router.push` to the previous path
- Thread chat: `backHref="/messages"`; inbox: role home (`/` or `/dashboard`)

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

Portals for menus/call sheets must mount on `#oga-mecho-phone`, not `document.body` alone when that would break the shell.

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
