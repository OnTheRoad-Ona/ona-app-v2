# Ona Local BackUp

Local fallout protection for **database + payment transactions** (escrow, refunds, payouts).  
Snapshots live on this Mac under `Local BackUp/snapshots/` (gitignored).

---

## 1. Does Flutterwave need bank code for escrow **payment**?

### Short answer

| Action | Bank code needed? |
|--------|-------------------|
| **Customer pays into escrow** (card / USSD / bank transfer checkout) | **No** |
| **Release 95% to Repair Pro** (Flutterwave Transfer) | **Yes** (`account_bank` = bank code) |
| **Refund to customer bank** (if you refund by transfer) | **Yes** for bank refunds |

### Details

1. **Escrow charge (Pay now to book)**  
   Flutterwave opens a **payment link**. The customer pays with card, USSD, or bank transfer on Flutterwave’s page.  
   Ona does **not** send the customer’s bank code for that charge.  
   Money lands on **your Flutterwave merchant balance**; Ona marks the job **Booked** / escrow **held**.

2. **Payout to pro (after job success)**  
   Flutterwave **Transfers API** needs:
   - bank code (`account_bank`, e.g. `058` for GTBank)
   - account number  
   - account name  
   That is why **bank setup is forced after Tier 1** for pros.

3. **Refunds**  
   Card refunds can use the original charge reference.  
   Bank-account refunds need the customer’s bank details (including code).  
   That’s why customers also save a bank after Tier 1.

**Summary:** Bank code is for **sending money out** (payout / bank refund), not for **taking the escrow payment in**.

---

## 2. What this backup does

Exports critical Supabase tables to:

```text
Local BackUp/snapshots/<timestamp>/
  manifest.json
  PAYMENT_LEDGER.json      ← easy money audit
  PAYMENT_ALERTS.json      ← held / failed highlight
  payments.json + payments.sql
  service_requests.*
  profiles.*
  motorist_profiles.*      ← refund banks
  repair_pro_profiles.*    ← payout banks
  job_status_events.* / job_events.*
  …
  LATEST.txt
```

Use when:

- Flutterwave deducted but app status is wrong  
- Dispute “I paid but job not Booked”  
- Need a local copy if Supabase/API is down  
- Compare held vs refunded rows  

This is **evidence + restore aid**, not a full managed DR platform. Keep the Mac disk safe / copy snapshots off-site if you want.

---

## 3. How to run

### A. Customer Care (admin)

1. Open Care desk: `/admin` (local: `npm run dev:admin` → http://localhost:4500/admin)  
2. Click **Backup now**  
3. Snapshot appears under `Local BackUp/snapshots/`  

Also runs **automatically** (debounced ~15s) when a payment row changes to held / released / refunded / failed / paid.

> Works when Next runs **on this Mac**. On Vercel alone, the app cannot write to your laptop disk — use Care on local admin, CLI, or keep `backup:local:watch` running.

### B. CLI

From the **Ona repo root**:

```bash
# One-shot backup now
npm run backup:local

# Keep running: backup now, then every 24 hours
npm run backup:local:watch
```

Needs in `.env.local` (already used by the app):

- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
- `SUPABASE_DB_PASSWORD`

Optional:

- `BACKUP_KEEP=30` — how many daily snapshots to retain (default 30)

### macOS daily (optional, without keeping terminal open)

```bash
# Example launchd / cron — run once per day at 03:00
# crontab -e
0 3 * * * cd "/Users/mac/Desktop/Code/Ona" && /usr/bin/npm run backup:local >> "Local BackUp/snapshots/cron.log" 2>&1
```

---

## 4. After a failed / double charge

1. Run `npm run backup:local` (or open latest snapshot).  
2. Open `PAYMENT_LEDGER.json` + `PAYMENT_ALERTS.json`.  
3. Match `provider_ref` / `tx_ref` with Flutterwave dashboard.  
4. Fix job/payment status in app or Care desk; refund via Flutterwave if needed.  

---

## 5. Security

- Snapshots can contain **PII and bank fields** — never commit them.  
- `Local BackUp/snapshots/` is gitignored.  
- Do not upload raw snapshots to public chat.
