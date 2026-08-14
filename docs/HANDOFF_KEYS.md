# Ona payment keys (ops)

## Flutterwave (production escrow — default)

Set these in **Vercel → Project → Settings → Environment Variables** (Production + Preview).  
**Never commit secret keys to git.**

| Variable | Value |
|----------|--------|
| `PAYMENT_PROVIDER` | `flutterwave` |
| `FLUTTERWAVE_SECRET_KEY` | *(server only — from Flutterwave dashboard)* |
| `FLUTTERWAVE_PUBLIC_KEY` | `FLWPUBK-…` |
| `NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY` | same public key |
| `FLUTTERWAVE_SPLIT_ENABLED` | `false` (escrow holds full labour, pays pros via Transfer API) |
| `FLUTTERWAVE_PLATFORM_SUBACCOUNT` | optional `RS_…` after creating platform subaccount |
| `FLUTTERWAVE_TRANSFER_PROXY_URL` | `https://ona-flw-payout.fly.dev` (static-IP transfer proxy) |
| `FLUTTERWAVE_TRANSFER_PROXY_SECRET` | *(matches `x-ona-proxy-secret` on the Fly proxy)* |

> **Every payout transfers through `FLUTTERWAVE_TRANSFER_PROXY_URL`** (static egress IP),
> with direct `api.flutterwave.com` as fallback. Because Flutterwave IP Whitelisting is ON,
> the **proxy egress IP must be whitelisted** — see below. If `resolveProvider()` finds no
> `FLUTTERWAVE_SECRET_KEY` on a deployed runtime it now **fails closed** (no silent mock
> "success"); mock payouts only run locally in dev.

### Split payments
1. Flutterwave Dashboard → **Split Payments** → enable.  
2. Create **platform subaccount** for Ona commission (5%).  
3. Create **pro subaccounts** when pros verify bank (store `RS_` id on payout profile).  
4. Until pro subaccounts exist, full charge hits main merchant; release via Transfer API.

### Local
Keys live in `.env.local` (gitignored).

### IP Whitelisting (critical for payouts)
Flutterwave **IP Whitelisting is ON** for this merchant. Requests from a non-whitelisted IP
are rejected with `"This request cannot be processed. Please contact your account administrator"`
(≈ same as FLW's IP/account block). These IPs are whitelisted today:

- `152.233.42.58` — static egress of the Fly.io transfer proxy (`ona-flw-payout.fly.dev`). **Primary.**
- `152.233.48.151` — legacy/secondary whitelisted address.

Check the live egress IP anytime: `curl https://ona-flw-payout.fly.dev/egress-ip`.
If the Fly host IP ever changes, re-add it in **Flutterwave → Settings → API → IP Whitelisting**
or payouts will fail again with the account-administrator error above.

### Rotate
If a secret was ever pasted in chat or a ticket, **rotate it** in Flutterwave and update Vercel.
