# Care ID status sync

**Rule:** Server (Care) is truth. Local draft is a cache.

1. Use `syncArtisanCareStatus(userId)` only — never plain `fetch` on `/api/artisan/profile`.
2. Server `approved` always replaces local `submitted` (Customer or Pro side).
3. Tests: `npm test -- src/lib/artisan/__tests__/sync-care-status.test.ts`
