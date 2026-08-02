# Care verification status sync (forever rules)

## Problem this solves

After Care approved government ID, the app kept showing **“ID currently in review”** because:

1. Local draft (`govIdReviewStatus: "submitted"`) was shown as truth.
2. The poll used plain `fetch` without Bearer → 401 on `/api/artisan/profile`.
3. Dual-role approvals on **Customer** vs **Pro** tables were not both read.

## Forever rules

1. **Server wins** — Care status lives in Supabase. Local draft is a cache only.
2. **Always `authFetch`** for `/api/artisan/profile` (and any `requireUser` route). Never plain `fetch`.
3. **Single module** — all UI must use `src/lib/artisan/sync-care-status.ts`:
   - `loadArtisanServerProfile(userId)`
   - `applyCareServerToLocalDraft(local, snapshot)` (pure, unit-tested)
   - `syncArtisanCareStatus(userId)` (auth + merge + save)
4. **Dual role** — approved if **either** `repair_pro_profiles.gov_id_review_status` **or** `motorist_profiles.identity_review_status` is approved (or verified flags).
5. **Hard overwrite** — if server says approved, local `submitted` is always replaced with `approved`.
6. **Care actions** must write `gov_id_review_status` / `identity_review_status` and mirror dual-role (customer approve → pro row).

## Call sites

- `ArtisanOnboarding` (verification + Pro setup sheet)
- Pro `dashboard` tier banner

## Tests

```bash
npm test -- src/lib/artisan/__tests__/sync-care-status.test.ts
```

Regression cases: local `submitted` + server `approved` → `approved`; dual customer approve → `approved`.

## PR checklist

- [ ] New verification UI uses `syncArtisanCareStatus`, not a one-off fetch
- [ ] New Care approve path sets review status columns + dual mirror
- [ ] `sync-care-status` tests still pass
