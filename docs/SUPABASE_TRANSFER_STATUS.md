# Supabase transfer — COMPLETE

## New project
- URL: `https://rvhvzcphzusemwmlffdb.supabase.co`
- Owner account: Lionrepubliktv@gmail.com
- Vercel: still `ona-mi` → aliases `ona-mi.vercel.app` + `ona-backend.vercel.app`

## What moved
| Resource | Count (verified) |
|----------|------------------|
| Auth users | 16 |
| profiles | 16 |
| repair_pro_profiles | 12 |
| motorist_profiles | 5 |
| service_requests | 14 |
| conversations | 10 |
| messages | 29 |
| payments | 9 |
| notifications | 49 |
| job_events | 748 |
| app_settings | 9 |
| + RBAC / feature flags / reviews / etc. | yes |

## Production env
Vercel production env now points at the new Supabase URL + keys.
Local `.env.local` also updated (backup: `.env.local.bak-pre-transfer-*`).

## Login after transfer
- **Original passwords restored** for all 16 users (password hashes copied from old `auth.users`).
- **Temp password no longer works** (by design).
- **Care admin**: use your existing admin password (seed password verified).
- If any single account still fails: use **Forgot password** once.

## Smoke tests (passed)
- Care login → me, pending-counts, pros list (12), pro-review (12), customer-review (5)
- Public health `?public=1` OK
- `/api/pros` OK (empty list if no Live pros — expected)
- job_events / phone_otps blocked for anon
- jetli login + pro row present

## Security note
Keys and DB password were shared in chat. After things are stable, rotate Supabase keys if desired.
