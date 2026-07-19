# OgaMecho Customer Care guide

**Who this is for:** Customer Care, Support, Super Admin  
**Where:** https://ogamecho.vercel.app/admin (local: http://localhost:4500/admin)  
**Temporary sensitive password:** `336699`  

If the site says **“This deployment is temporarily paused”**, that is a Vercel account/usage block — not a bad Care login. Use local admin or fix Vercel usage (see `docs/VERCEL_DEPLOY.md`).

---

## Daily workflow (2 minutes)

1. Log in at `/admin/login` with your staff email + password.
2. You land on **Care desk** (`/admin`).
3. **Unlock sensitive mode** when you need money/freeze/PII:
   - Enter **`336699`** → Unlock
   - Stays open ~**10 minutes**, then locks again
4. **Search** phone, name, job ID, or plate number.
5. **Open** a job from search or the live board.
6. Use one-click buttons:
   - **Release escrow** → pay Repair Pro (95%) + platform (5%)
   - **Refund motorist** → full refund path
   - **Dispute → pay pro / refund** → final dispute decision
   - **Freeze / Unfreeze** motorist or pro
7. Check **Audit trail** if someone asks “who did what?”

---

## Sensitive actions (always need `336699`)

| Action | Why locked |
|--------|------------|
| Escrow release | Moves money to pro |
| Escrow refund | Returns money to motorist |
| Freeze / unfreeze user | Blocks app access |
| Dispute / appeal final decision | Ends locked funds |
| View full NIN / BVN / bank | PII |
| System settings changes | App-wide behaviour |

Support role can **view** jobs and search but **cannot** run money/freeze actions.

---

## Roles

| Role | Can do |
|------|--------|
| **Super Admin** | Everything + settings + role changes |
| **Customer Care** | Search, board, escrow, freeze, disputes, PII (with password) |
| **Support** | Search, board, audit view only |

Staff accounts use `profiles.role = admin` (panel access) and `profiles.admin_role` for the narrow role above.

---

## Job money flow (remember this)

```
Negotiating → Agreed → Paid/Booked → En Route → Arrived
→ In Progress → Completed → Satisfied → Released
```

- Money is **held in escrow** after **Paid/Booked**.
- On **Released**: **95% Repair Pro · 5% platform**.
- **Dispute / Appeal** keeps funds locked until Care decides.

---

## Search tips

- Phone: `0803…` or full international form  
- Name: partial OK (`Ade`, `Chukw`)  
- Job ID: full UUID from app or SMS  
- Plate: motorist plate number  

---

## Security you rely on

1. Staff login (Supabase auth)  
2. Role permissions  
3. Temporary password **336699** for sensitive ops  
4. 10-minute unlock window  
5. 30-minute **idle** admin session timeout  
6. Rate limits on unlock + sensitive routes  
7. **Audit log** with action, staff ID, IP, job/user target  

---

## If something fails

| Message | What to do |
|---------|------------|
| Sensitive action locked | Enter `336699` on Care desk |
| Permission denied | Your role is Support — escalate to Care/Super Admin |
| Too many attempts | Wait 1–5 minutes; don’t share password |
| Job not found | Confirm UUID; try name/phone search |

---

## Escalation

- Payment stuck after “Satisfied” → Care desk → **Release escrow**  
- Fraud / abuse → **Freeze** user + note in audit reason  
- Unfair dispute → open **Disputes** page, review evidence, resolve with password  

**Never** share `336699` in chat groups or with customers.
