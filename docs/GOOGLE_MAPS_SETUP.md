# OgaMecho: real Google Map on homepage

The app is already wired for **live Google Maps** on the home screen (your GPS pin, radius circle, nearby pros).

## 1. Env (already set if you followed earlier setup)

In `.env.local`:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
NEXT_PUBLIC_USE_LIVE_MAPS=true
```

Restart the dev server after changing env:

```bash
npm run dev
```

## 2. Google Cloud (required for the key to work)

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Select the project that owns your key
3. **Enable billing** on that project
4. **APIs & Services → Library** → enable:
   - **Maps JavaScript API** (required for homepage)
   - **Geocoding API** (optional: Google street names; app falls back to OpenStreetMap Nominatim if the key blocks Geocoding)
   - **Places API** (optional: address search autocomplete)
5. **APIs & Services → Credentials** → click **your API key** (not only Library):
   - **Application restrictions:** **HTTP referrers** (websites)
   - **Website restrictions — allow ONLY these** (OgaMecho):

     | Referrer | Purpose |
     |----------|---------|
     | `http://localhost:3000/*` | Local public app |
     | `https://ogamecho.vercel.app/*` | Production public app |
     | `https://ogamecho-backend.vercel.app/*` | Production admin backend |

     Optional (only if you need them later):
     - `http://127.0.0.1:3000/*` — same as localhost via IP
     - `http://localhost:4500/*` — local admin (`npm run dev:admin`)

   - Google needs the `/*` suffix so all paths under each site work (home, signup, admin, etc.).
   - **Do not** leave “None” if you want the key locked to OgaMecho only.
   - **API restrictions (this is the usual fix for ApiTargetBlockedMapError):**
     - Either **Don't restrict key**, or
     - **Restrict key** and **include** at least:
       - **Maps JavaScript API**
       - **Geocoding API** (street labels)
       - **Places API** (if you use place search)
6. Click **Save**, wait **5–10 minutes**, then hard-refresh the app

### Restrict key in Console (click path)

1. Open: https://console.cloud.google.com/apis/credentials  
2. Select the **project** that owns the OgaMecho Maps key  
3. Under **API keys**, open your key  
4. **Application restrictions** → **HTTP referrers (web sites)**  
5. **Add an item** for each line exactly:

```
http://localhost:3000/*
https://ogamecho.vercel.app/*
https://ogamecho-backend.vercel.app/*
```

6. **Save**

## 3. What the homepage shows when live

- Real Google map tiles  
- **You** pin from live GPS  
- Search radius circle  
- Nearby Repair Pro markers  
- Small green live dot  

If Google still rejects the key, the app falls back to OpenStreetMap for this session. Street labels still work via Nominatim when Geocoding is blocked.

## 4. Quick test

```bash
# Google Geocoding (OK if Geocoding API is allowed on the key)
curl "https://maps.googleapis.com/maps/api/geocode/json?address=Lagos&key=YOUR_KEY"

# App street labels (Google → Nominatim fallback) while dev server is running
curl "http://localhost:3000/api/reverse-geocode?lat=6.6018&lng=3.3515"
```

Then open http://localhost:3000 and allow location access. Pin labels should show a street or area name even if Google Geocoding returns REQUEST_DENIED.
