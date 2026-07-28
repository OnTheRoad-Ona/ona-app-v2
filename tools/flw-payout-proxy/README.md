# Ona Flutterwave payout proxy (static IP — fix once)

## Why

Ona on **Vercel** uses **rotating** outbound IPs. Flutterwave **Transfer API** (95% pro payout when customer taps **I am Satisfied**) requires **IP Whitelisting**.

Customer **bank transfer pay** does **not** need this.

## Permanent fix

1. Run this tiny server on a host with a **fixed public IP** (Fly, Railway, DO droplet, etc.).
2. Whitelist **that one IP** in Flutterwave → Settings → API → IP Whitelisting (**ON**).
3. Point Ona production env at the proxy. **Never re-whitelist Vercel IPs again.**

## Deploy on Fly.io (recommended)

```bash
cd tools/flw-payout-proxy
# install flyctl once: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly launch --name ona-flw-payout --region iad --no-deploy
fly ips allocate-v4
fly secrets set \
  ONA_PROXY_SECRET="pick-a-long-random-secret" \
  FLUTTERWAVE_SECRET_KEY="FLWSECK_..."
fly deploy
fly ips list   # copy the public IPv4
```

Open `https://ona-flw-payout.fly.dev/health` — note `staticEgressIp`.

## Flutterwave (once)

1. Dashboard → **Settings → API → IP Whitelisting** → **ON**
2. Add **only** the proxy’s `staticEgressIp` (from `/health`)
3. Settings → Business Preferences → **Security** → **Transfer via API** ON

## Ona (Vercel env)

| Variable | Value |
|----------|--------|
| `FLUTTERWAVE_TRANSFER_PROXY_URL` | `https://ona-flw-payout.fly.dev` (no trailing slash) |
| `FLUTTERWAVE_TRANSFER_PROXY_SECRET` | same as `ONA_PROXY_SECRET` |

Redeploy Ona. Pro releases call the proxy; Flutterwave always sees the same IP.

## Alternatives (paid)

- **Vercel Static IPs** (~$100/mo/project) — whitelist Vercel’s fixed pair
- **Fixie / QuotaGuard** — set `FIXIE_URL` or `QUOTAGUARDSTATIC_URL` on Ona (also supported in code)

## Security

- Proxy rejects requests without `x-ona-proxy-secret`
- Prefer storing `FLUTTERWAVE_SECRET_KEY` **only** on the proxy (not passed from Ona)
- Do not expose the proxy without the secret
