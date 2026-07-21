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
| `FLUTTERWAVE_SPLIT_ENABLED` | `true` |
| `FLUTTERWAVE_PLATFORM_SUBACCOUNT` | optional `RS_…` after creating platform subaccount |

### Split payments
1. Flutterwave Dashboard → **Split Payments** → enable.  
2. Create **platform subaccount** for Ona commission (5%).  
3. Create **pro subaccounts** when pros verify bank (store `RS_` id on payout profile).  
4. Until pro subaccounts exist, full charge hits main merchant; release via Transfer API.

### Local
Keys live in `.env.local` (gitignored).

### Rotate
If a secret was ever pasted in chat or a ticket, **rotate it** in Flutterwave and update Vercel.
