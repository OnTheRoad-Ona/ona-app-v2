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
   - **Application restrictions:** **HTTP referrers** (websites), with:
     - `http://localhost:3000/*`
     - `http://127.0.0.1:3000/*`
     - your production domain `/*`
     - Or **None** while testing locally
   - **API restrictions (this is the usual fix for ApiTargetBlockedMapError):**
     - Either **Don't restrict key**, or
     - **Restrict key** and **include Maps JavaScript API** in the list  
       (enabling the API in Library is not enough if the key’s allow-list omits it)
6. Click **Save**, wait 1–5 minutes, hard-refresh the app

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
