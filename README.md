# Ona

Live mechanic discovery and dispatch platform — find nearby mechanics, vulcanizers, and tow trucks within 0–5 km.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** v4
- **shadcn-style** UI primitives (Radix + CVA)
- Mobile-first **iPhone 16** shell (393×852)

## Features

- Map-first home with live radius, ETA pins, and smart matching
- Service categories: Mechanics · Vulcanizers · Tow · All
- Distance slider 0–5 km with live result counts
- Filters: Nearest, 4.5+, Available Now, Verified, Fast Response
- Technician profiles, request flow, live request tracking
- Technician dashboard (online/offline, accept jobs, status updates)
- Requests, Bookings, Messages, Profile tabs

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` → `.env.local`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API (home map, radius, pins, route) |

**Never commit API keys.** `.env.local` is gitignored.

In [Google Cloud Console](https://console.cloud.google.com/):

1. Enable **Maps JavaScript API**
2. Restrict the key by **HTTP referrer** (`localhost:3000/*`, your domain)
3. Ensure billing is active if required for Maps

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
