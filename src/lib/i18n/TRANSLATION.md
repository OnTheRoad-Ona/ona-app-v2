# Ona full-app translation system

## Goal

Every user-visible string in Ona goes through `t("key")` so all **11 languages** stay in sync.

| Code | Language |
|------|----------|
| `en` | English (master) |
| `yo` | Yoruba |
| `ig` | Igbo |
| `ha` | Hausa |
| `fr` | French |
| `pt` | Portuguese |
| `ar` | Arabic (RTL) |
| `es` | Spanish |
| `sw` | Swahili |
| `pcm` | Nigerian Pidgin |
| `zh` | Chinese (Simplified) |

Default: **English**. Preference is stored in `localStorage` (`ona-app-locale`).

## How to add a string

1. Add the key to `catalog/en.ts` (English only, clear wording).
2. Add the same key to **every** locale file under `catalog/*.ts` (`yo`, `ig`, `ha`, …).
3. Use it in UI: `const t = useT(); return t("my.key");`
4. Optional vars: `t("settings.themeSaved", { name: "Ada" })` → `{name}` placeholders.

## Rules for quality

- **One key = one meaning.** Do not reuse a key for different contexts.
- Keep **Nigeria-first product voice**: short, plain, respectful.
- **Do not translate** brand name **Ona**, product terms like **Repair Pro**, **Live**, **BVN** when they are product labels (unless a locale needs a short gloss).
- **Arabic** sets `dir="rtl"` automatically via `I18nProvider`.
- Prefer existing keys (`common.*`, `auth.*`) before inventing new ones.

## Check parity

```ts
import { assertCatalogParity } from "@/lib/i18n/catalog";
console.log(assertCatalogParity()); // [] when perfect
```

## Coverage today

- Settings, Language, Notifications, Location pages  
- Bottom nav, radius label  
- Auth role labels  
- Catalog keys for Jobs, Messages, Profile, Verify, Signup, Dashboard, Menu (ready to wire)

## Wiring more screens

Replace hard-coded English with `useT()`:

```tsx
import { useT } from "@/lib/i18n";

export function MyScreen() {
  const t = useT();
  return <h1>{t("jobs.title")}</h1>;
}
```

Expand `catalog/en.ts` first whenever you add new UI copy.
