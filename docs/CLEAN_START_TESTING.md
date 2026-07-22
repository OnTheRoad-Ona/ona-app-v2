# Ona — clean start testing guide

Use this after a data wipe so new Customer and Repair Pro accounts can test from zero.

## What’s wiped vs kept

| Kept | Wiped |
|------|--------|
| App settings, feature flags, RBAC | All customers & repair pros |
| Env keys (Supabase, Flutterwave, maps) | Jobs, chats, payments, OTPs |
| Admin seed account | Auth users (except re-seeded admin) |

Reset command (local, needs service role):

```bash
cd "/Users/mac/Desktop/Code/Ona"
node scripts/wipe-user-data.mjs
npm run db:seed-admin
```

Then **hard-refresh** the browser (or clear site data) so old local vault/session is gone.

## Signup (required fields)

### Customer (`/signup/motorist`)
- Full name, gender, date of birth (16+)
- **Phone** (stored normalized, e.g. `+234…`)
- **Email** (required — not used for login)
- Vehicle details
- Password (account security; login is phone OTP)

### Repair Pro (`/signup/pro`)
- Full name, gender, DOB
- **Phone** + **Email** (email required)
- Trade / business, radius, bio
- Onboarding / verification as prompted

## Login (phone only)

1. Open `/login/signin`
2. Choose **Customer** or **Repair Pro**
3. Enter the **exact phone number used at signup**
4. **Send code** → enter the SMS code  
   - Until real SMS is live, demo code **`336699`** still works (not shown in UI)

Wrong phone → *“This phone is not registered. Use the exact number from signup.”*

## After first login

1. **Bank account required** panel (Customer home / Pro dashboard)  
   - Select bank → code auto-fills → 10-digit NUBAN → name resolve → save  
2. Customer: request a pro → negotiate → **Pay now to book** → Flutterwave  
3. Pro: complete bank for payouts, go Live, accept jobs  

## Production

| Surface | URL |
|---------|-----|
| App | https://ona-mi.vercel.app |
| Admin | https://ona-mi.vercel.app/admin/login |

Admin seed: `Oluwatosinabdullahime@gmail.com` (from `npm run db:seed-admin`).

## Deploy

```bash
cd "/Users/mac/Desktop/Code/Ona"
npx vercel --prod --yes
```
