# Wallet Cashout Product — Design Doc (v1, for approval)

Status: PROPOSED — no code written yet.
Scope rule: backend + admin UI only. Consumer app untouched. Nothing existing is removed or replaced; all changes are additive. Existing `/api/security/cashout`, `/api/security/wallet`, and admin credit-control flows keep their current request/response shapes (backward compatible).

---

## 1. What exists today (verified)

- **Credit wallet** (`credit_wallets`, `credit_transactions`) — live; referral earnings land as credits.
- **Cashout requests** (`cashout_requests`) — request → funds blocked → admin approves → admin marks Paid **manually, outside the app**. No Flutterwave transfer is ever initiated for cashouts.
- **Pro job payouts** — a mature, battle-tested engine: Flutterwave transfers via static-IP proxy with failover, a hard transfer ledger with UNIQUE refs, 5-layer double-pay protection, insufficient-balance retry loop (10 min × 24 h → admin escalation), cron retries.
- **Bank rails** — verified NUBAN capture (`resolve-account`), OTP-gated bank changes, bank columns on profiles.
- **Config** — `system_settings`: `credit_cashout_minimum` (₦2000), `credit_cashout_fee_percent` (5%); `feature_flags.wallet = false` (never enforced).

## 2. Bugs found during the scan (fixed as part of this build)

1. **Blocked-funds leak (critical)**: when a cashout is marked `paid` via the pure-DB path, the blocked hold is never converted to a final debit — `blocked_credits` leaks forever. On `rejected`/`failed`, funds are **never unblocked at all** (both paths).
2. **RPC swallows ledger writes**: `credit_wallet_debit` can debit without writing a `credit_transactions` row (exception swallowed) → audit drift.
3. **Per-process mutex only**: concurrent debits can overdraw on multi-instance deploys (DB RPC mitigates only the cashout hold).
4. **Admin "Mark Paid" has no sensitive re-auth** (unlike the failed-payouts board).
5. **`destination_account` is free text** and the wallet page sends none at all.

All five are fixed in this design; none require consumer-app changes.

## 3. Target flow (full auto-payout product)

```
Pro/Customer requests cashout
  → validations: flag on, KYC gate, min/max, velocity caps, verified bank on file
  → hold funds atomically (extended credit_wallet_debit RPC)
  → status: pending
Admin (or auto-approve if enabled in settings)
  → status: approved
  → transfer engine claims a UNIQUE ledger ref: ona_cash_<cashoutId>
  → Flutterwave transfer of net_amount to the user's verified bank
  → status: processing
Transfer completes
  → verify via FLW status (webhook + poll)
  → status: paid  → hold converts to final debit (bug #1 fixed)
Failure
  → hard fail (bad account): status failed → funds unblocked (bug #1 fixed)
  → soft fail (insufficient FLW balance): retry every 10 min up to 24 h
    → then suspended_admin (ops queue, same as job payouts)
Admin can always: reject (unblocks), retry, force-fail (unblocks), mark-paid-manual
    (manual path kept for fallback — with sensitive re-auth, bug #4 fixed)
```

## 4. Backend changes (additive)

### 4.1 Migrations (new, numbered after the latest)
- `cashout_requests`: add columns `transfer_ref` (unique), `transfer_status`, `flw_transfer_id`, `retry_count`, `next_retry_at`, `last_error`, `idempotency_key` (unique, nullable), `auto_status` meta. No column removals.
- `payout_transfer_ledger`: add nullable `cashout_request_id` (existing `payment_id` stays; one of the two set).
- New RPC `credit_wallet_release` (unblock hold → either final debit or reversal) + patch: stop swallowing tx-insert failures in `credit_wallet_debit` (new version; old one left in place for compatibility, callers migrated).
- `system_settings` seeds: `credit_cashout_daily_limit`, `credit_cashout_monthly_limit`, `credit_cashout_min_account_age_days`, `credit_cashout_auto_approve_under` (default 0 = always approve), `credit_cashout_max_per_day`.

### 4.2 Server libs
- New `src/lib/server/security/cashout-engine.ts`:
  - `requestCashout` (validations + atomic hold + idempotency key support)
  - `attemptCashoutTransfer(cashoutId)` — wraps the existing `releaseToPro` + `payout-ledger` (claim → pre-check → transfer → success/fail) exactly like `attemptProPayout`
  - `processDueCashoutRetries()` — mirrors `processDuePayoutRetries`
  - `verifyPendingCashouts()` — polls FLW for stuck `processing`
  - `rejectCashout` / `forceFail` — unblock reversals
- `security-store.ts`: status transitions extended with the new states; existing function signatures preserved.

### 4.3 API routes (additive)
- `POST /api/security/cashout` — gains optional `idempotencyKey` + uses verified bank on file (body param still honored for compatibility)
- `GET /api/security/cashout` — unchanged shape, richer status fields added
- `POST /api/security/cashout/verify` (cron-secret) — poll + retry scheduler entry, same pattern as `/api/payments/payout-retry`
- `POST /api/admin/security` — new actions: `retry-cashout`, `force-fail-cashout`; existing `approve/reject/pay/fail` kept; `pay-cashout` and `fail-cashout` now require `requireSensitiveAction` and `pay-cashout` additionally records an operator attestation
- `update-setting` validation: cashout min/fee/limits clamped server-side

### 4.4 Feature switch
- `feature_flags.wallet` becomes real: `isFeatureEnabled("wallet")` gates request creation (admin credit-control keeps working regardless, so ops can always resolve stuck money)
- Admin settings page gains the new limit/auto-approve fields (same settings API)

### 4.5 Admin UI (backend control surface)
- Credit-control → Cashouts tab upgraded: live transfer status, retry countdown, FLW transfer id, retry/force-fail/verify-now buttons, manual mark-paid with attestation prompt
- Failed/aging cashouts join the ops snapshot pattern (same board style as failed job payouts)

## 5. Money-movement rules

- Units: credits are ₦ major units; FLW transfers take major units — conversion explicit, rounding always down to whole ₦ on `net_amount`
- Fee: `net = requested − (requested × fee%)`, fee computed server-side from `system_settings` at request time and frozen on the row
- Every balance mutation writes exactly one `credit_transactions` row (bug #2)
- Every transfer attempt writes to `payout_transfer_ledger` before calling FLW (existing UNIQUE dedupe)

## 6. What I need from you to build

- Approval of this flow (or edits)
- Confirmation that Flutterwave Transfers for wallet cashouts should use the **same static-IP proxy + secret** as job payouts (recommended: yes)
- Whether auto-approve under a threshold should default ON or OFF (I default OFF: admin approves everything until you flip the setting)

## 7. Explicitly NOT in this phase

- Consumer app UI changes (the existing wallet page keeps working; richer status display comes in your approved frontend pass)
- Multi-currency
- Instant (auto) first-time cashouts for brand-new accounts
