# Payout sync release — ONA-PAYOUT-SYNC-20260728

## Serial / release id

| Field | Value |
|--------|--------|
| **Release ID** | `ONA-PAYOUT-SYNC-20260728` |
| **Git short** | `fdb18ef` |
| **Git full SHA** | `fdb18ef294a80053bb1609bbfb87a3ae685bf239` |
| **Date** | 2026-07-28 |
| **Production** | https://ona-mi.vercel.app |

## Problem this fixes

UI stayed on **“Payout processing”** after Flutterwave had already paid the Repair Pro, because:

1. Transfer succeeded on FLW  
2. App never wrote `released` / `released_at` (cancel race or missed finalize)  
3. UI treated any unreleased `satisfied` job as still processing  

## Sync guarantees (do not regress)

1. **One stable transfer ref per escrow** (`ona_rel_…`) — never invent a second ref  
2. **Ledger UNIQUE(transfer_ref)** + `success` is terminal  
3. **FLW lookup before create** — NEW/PENDING/SUCCESS → mark released, no second credit  
4. **On every `getJob`**: if FLW already paid that ref → recover job + payment to `released`  
5. **On successful transfer**: mark payment + job released in the same flow; finalize notifies once  
6. **Cancel cannot be overwritten** by a late retry (`updateEscrowUnlessCancelled`)  
7. **UI spinner** only when `escrow_status` is `pending_settlement` or `release_pending`  
8. **Auto-retry**: every **10 minutes**, max **24 hours**, then admin suspend  
9. **Min service charge ₦120** so pro 87.5% ≥ FLW ₦100 minimum  

## Manual recovery (if ever desynced)

1. FLW dashboard → find transfer by `ona_rel_…` ref  
2. If SUCCESSFUL: open job in app (auto-recover) or set payment + job to `released`  
3. Never create a second transfer for the same job  

## Split (service S ≥ ₦120)

| Slice | Share |
|--------|--------|
| Pro | 87.5% of S |
| Ona | 5% of S (FLW fees from this) |
| VAT | 7.5% of S (held on FLW) |
