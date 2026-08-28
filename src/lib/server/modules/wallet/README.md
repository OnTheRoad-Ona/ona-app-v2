# Wallet module (stub tables only)

`wallet_accounts` / `wallet_transactions` are **unused stubs**.

Live credit ledger is `credit_wallets` + `credit_transactions` + `cashout_requests`, implemented in:

- `src/lib/server/security/security-store.ts`
- `src/lib/server/security/cashout-engine.ts` (Flutterwave cashout, refs `ona_cash_*`)

Flag: `feature_flags.wallet` (checked on cashout request). Admin Features UI does not currently expose this toggle.

Do not build a third ledger. See `docs/HANDOFF.md` (wallet freeze).
