# We360.ai — PWA Manifest Handoff

Everything needed to wire the web-app manifest into the Astro site.

## 1. Copy these 4 files into the Astro project's `public/` folder

| File | Purpose |
|---|---|
| `manifest.json` | The PWA manifest |
| `icon-192.png` | Standard icon, 192×192 |
| `icon-512.png` | Standard icon, 512×512 |
| `icon-512-maskable.png` | Android adaptive icon (safe-zone padded) |

Keep the filenames exactly as-is — `manifest.json` references them by path.

## 2. Add to the root layout `<head>`

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#5B45E0">
```

## 3. Verify

Open the deployed site in Chrome → DevTools → **Application** tab → **Manifest**:
- No parse errors
- All 3 icons render in the preview
- "Installability" section shows no warnings
