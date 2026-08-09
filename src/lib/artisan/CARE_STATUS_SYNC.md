# Care ID status sync

**Rule:** Server (Care) is truth. Local draft is a cache.

1. Use `syncArtisanCareStatus(userId)` only — never plain `fetch` on `/api/artisan/profile`.
2. Server `approved` always replaces local `submitted` (Customer or Pro side).
3. Tests: `npm test -- src/lib/artisan/__tests__/sync-care-status.test.ts`

## Sticky Care approval (permanent)

Once Care approves T2, **client re-submit cannot demote**:

- App guards: `src/lib/server/identity/protect-approval.ts` on `/api/verify/pro-id` and `/api/verify/customer-id`
- DB triggers: migration `20260809_052_protect_verification_approval.sql` (also protects bulk transfer/import)
- Allowed demotions: Care **reject**, or Care **needs_resubmit** / re-submit note
- Dual-role mirror may only re-assert approved, never clear it
