# Klimb Brand Guidelines

> Internal reference for product, design, and engineering. This is the **single source of truth** for visual decisions. If a component disagrees with this doc, the component is wrong.

**Personality:** *Playful but professional.* We ship audits daily; the UI should feel like a capable teammate — not a corporate dashboard and not a cartoon. Think **Linear meets Duolingo** — crisp information architecture with small moments of joy (gradient hovers, spring-physics motions, contextual micro-copy).

---

## 1. Color system

### 1.1 Primary brand

| Token | Value (oklch) | Use |
|---|---|---|
| `--primary` (light) | `oklch(0.58 0.22 280)` violet | CTAs, links, active nav, focus ring accent |
| `--primary` (dark) | `oklch(0.68 0.22 280)` violet | Same, lifted for dark mode |
| Brand gradient | `from-emerald-500 via-sky-500 to-violet-500` | Logo mark, hero gradient text, main CTA button, brand-meaningful accents only |

**Rule:** the brand gradient appears **at most once per visible viewport**. Overuse kills its meaning. The logo + one CTA = yes. Logo + CTA + hero text + 3 badges = no.

### 1.2 Semantic palette

| Purpose | Light mode | Dark mode | Tailwind |
|---|---|---|---|
| Success | `emerald-600` | `emerald-400` | `text-emerald-600 dark:text-emerald-400` |
| Info / link | `sky-600` | `sky-400` | `text-sky-600 dark:text-sky-400` |
| Brand / AI | `violet-600` | `violet-400` | `text-violet-600 dark:text-violet-400` |
| Warning | `amber-600` | `amber-400` | `text-amber-600 dark:text-amber-400` |
| Danger | `rose-600` | `rose-400` | `text-rose-600 dark:text-rose-400` |
| Accent 2 | `orange-600` | `orange-400` | `text-orange-600 dark:text-orange-400` |

**Tinted-surface rule:** when using a color as a background, use `{color}-500/10` in light mode and `{color}-500/15–20` in dark mode. The border is `{color}-500/20`.

Example — success card:
```html
<div class="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-md p-3">
```

### 1.3 Pillar colors (SEO / AEO / GEO / SXO / AIO)

Used consistently across pillar cards, radars, trend charts, badges.

| Pillar | Color | Token |
|---|---|---|
| SEO | emerald | `#10b981` |
| AEO | sky | `#0ea5e9` |
| GEO | violet | `#8b5cf6` |
| SXO | amber | `#f59e0b` |
| AIO | rose | `#f43f5e` |

Never swap these in a chart. Muscle memory matters.

### 1.4 Neutral scale

Surfaces: `background` → `card` → `muted` → `muted/30` (tinted surfaces) → `muted/50` (dialog bg). Borders: `border` default, `border-dashed` for empty states, `border/60` for softer dividers on contextual panels.

---

## 2. Typography

**Font:** Geist Sans (system + variable, via `next/font/google`). Monospace: Geist Mono for IDs, URLs, code, and tabular numbers.

### 2.1 Scale (use the Tailwind class, not arbitrary sizes)

| Role | Desktop | Mobile | Weight | Line-height | Tracking |
|---|---|---|---|---|---|
| Display (hero headline) | `text-5xl md:text-7xl` | `text-5xl` | `font-bold` | `leading-[1.05]` | `tracking-tight` |
| H1 page title | `text-2xl md:text-3xl` | `text-2xl` | `font-bold` | `leading-tight` | `tracking-tight` |
| H2 section title | `text-xl md:text-2xl` | `text-lg` | `font-semibold` | `leading-tight` | `tracking-tight` |
| H3 card title | `text-base md:text-lg` | `text-base` | `font-semibold` | `leading-snug` | default |
| Body | `text-sm` | `text-sm` | `font-normal` | `leading-relaxed` | default |
| Secondary body | `text-xs` | `text-xs` | `font-normal` | `leading-relaxed` | default |
| Eyebrow label | `text-[10px] uppercase tracking-wider font-semibold text-muted-foreground` | same | — | — | `0.1em` |
| Metric / numeric | `text-2xl` or `text-lg` | — | `font-bold tabular-nums` | — | default |
| Button | `text-sm` (`text-base` for size=lg) | same | `font-medium` or `font-semibold` | — | default |

**Tabular numbers** everywhere money, counts, or dates appear in tables or stat cards: `tabular-nums`.

### 2.2 Content voice

- **Crisp and confident.** "Run audit now" not "Would you like to run an audit?"
- **Quantified.** "$2.45 of $5 this month" not "using some of your budget".
- **Human.** "Your trial ends today" over "Trial expiry imminent".
- **No emojis in UI text** unless they're data (win emojis, pillar badges). The user opts into emojis; we don't spray them.

---

## 3. Spacing scale (4px grid)

Stick to the Tailwind scale. **Never use arbitrary `p-[17px]` style values** — if the scale doesn't have it, change the design.

### 3.1 Component padding

| Component | Padding | Example |
|---|---|---|
| Tight list item | `px-3 py-2` | sidebar nav item |
| Badge | `px-2 py-0.5` (`text-[10px]`) | status pill |
| Button sm | `px-2.5 py-1` | table action |
| Button lg | `px-8 h-12` (checkout, hero CTA) | — |
| Card compact | `p-4` | stat cards, list rows |
| Card standard | `p-5` | most dashboard cards |
| Card editorial | `p-6 lg:p-8` | admin/billing full-width cards |
| Dialog body | `p-6` | all modals |

### 3.2 Stack gaps

| Container | Gap | Class |
|---|---|---|
| Inside card | 12–16px | `space-y-3` or `space-y-4` |
| Form fields | 6px | `space-y-1.5` |
| Card section dividers | 24px | `space-y-6` |
| Major page sections | 32px | `space-y-8` |

### 3.3 Page section rhythm

Every dashboard page uses this outer shell. **Do not deviate.**

```tsx
<div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-8 max-w-[1600px] w-full mx-auto">
```

Landing sections use `py-24 md:py-32` between sections. Always that pair — never `py-20` or `py-36`. Consistency is the point.

---

## 4. Radius, shadows, borders

### 4.1 Radius

| Token | Value | Use |
|---|---|---|
| `rounded` | 10px | Default — buttons, inputs, badges |
| `rounded-md` | 8px | Compact cards, table rows |
| `rounded-lg` | 10px | Standard cards |
| `rounded-xl` | 14px | Feature cards, modals, pricing tiles |
| `rounded-2xl` | 18px | Hero blocks, landing feature cards |
| `rounded-full` | round | Avatars, pill buttons, badges with gradient |

### 4.2 Shadows

- Default card: no shadow. Hover: `hover:shadow-md`.
- Raised hero mockup: `shadow-2xl shadow-violet-500/10`.
- Brand CTA: `shadow-md shadow-violet-500/25` → `hover:shadow-lg hover:shadow-violet-500/40`.
- Focus: use `focus-visible:ring-3 focus-visible:ring-ring/50` (already in all inputs).

### 4.3 Borders

- Default `border` — everywhere except where we want softer (`border/60`) or dashed (`border-dashed` for empty states).
- Destructive cards: `border-rose-300 dark:border-rose-900`.
- Highlighted pricing tier: `border-primary` + `shadow-2xl shadow-violet-500/20`.

---

## 5. Motion

We use **motion/react**. All animations follow these rules:

### 5.1 Easing

- **Standard exits and entries:** `[0.22, 1, 0.36, 1]` (custom ease-out). Feels confident, lands crisply.
- **Spring interactions (drag, modals opening):** `{ type: "spring", damping: 24, stiffness: 200 }`.
- **Micro-interactions (hover, toggle):** `duration: 0.2, ease: "easeOut"`.

### 5.2 Durations

| Interaction | Duration |
|---|---|
| Hover / press | 150–200ms |
| Tooltip / dropdown | 180–250ms |
| Modal open | 300ms |
| Page section fade-up | 400–500ms, staggered by 40–80ms |
| Hero headline entry | 500–600ms, delay 150ms |
| Chart draw-in | 700–900ms |

### 5.3 Entry patterns

Every section uses one of three patterns:

**Fade-up (default):**
```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-80px" }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
/>
```

**Stagger children:**
```tsx
transition={{ duration: 0.5, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
```

**Scale-in (for cards appearing on click):**
```tsx
initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
```

### 5.4 Reduced-motion

Respect `prefers-reduced-motion`. For ambient floating orbs and looped animations, guard with `useReducedMotion()` or pair with the CSS media query we already have for scrollbars.

### 5.5 Animation budget — where playful lives

Playful moments are **earned** — they shouldn't distract from work:

- **Hero** — floating orbs, animated gradients, pillar-card bounces. Yes, expressive.
- **Empty states** — animated illustrations or bouncing elements to soften the absence.
- **Success confirmations** — checkmark spring-in, confetti burst for big wins (plan upgraded, first audit complete).
- **Progress bars** — animate width change on value update.
- **Number counts** — stat cards count up from 0 on first mount.
- **Hover states** — cards lift `-translate-y-0.5` + shadow; icons scale `1.1`.

**Everywhere else** — subtle. 200ms fades, minimal transforms. The dashboard is for work, not decoration.

---

## 6. Breakpoints

Desktop-first content, mobile-first code (Tailwind default).

| Device | Min width | Tailwind |
|---|---|---|
| Mobile (portrait) | 0 | default |
| Mobile (landscape) | 640px | `sm:` |
| Tablet | 768px | `md:` |
| Small desktop | 1024px | `lg:` |
| Desktop | 1280px | `xl:` |
| Large desktop | 1536px | `2xl:` |

### 6.1 Layout behavior

- **Sidebar** collapses to mobile menu at `< lg`.
- **Page outer padding:** `px-4 sm:px-6 lg:px-10`.
- **Max content width:** `max-w-[1600px]` (dashboard), `max-w-6xl` (landing sections), `max-w-3xl` (editorial / docs pages).
- **Two-column → stack at `< md`**. Three-column → 2-col at `md`, stack at `< sm`.

### 6.2 Touch targets

Minimum 40×40px for anything a thumb can tap — `h-9` / `size-10` as the floor on mobile. Never shrink Button `size="xs"` for mobile primary actions.

---

## 7. Components — canonical specs

### 7.1 Card

Default card:
```tsx
<Card className="p-5 space-y-3">
```

When cards live in a grid, they all get the same padding and gap:
```tsx
<div className="grid gap-4 md:grid-cols-3">
  <Card className="p-5"> ... </Card>
</div>
```

**Rule:** inside one section, every card has the same padding. Don't mix `p-4` and `p-5` in the same row.

### 7.2 Button hierarchy

- `variant="brand"` → primary CTA, one per visible area.
- `variant="default"` → secondary primary (solid violet).
- `variant="outline"` → tertiary actions (Cancel, Back, Secondary).
- `variant="ghost"` → quiet actions (icon-only, nav items).
- `variant="destructive"` → delete / sign out / force-cancel.

Avoid stacking two brand buttons. If both are important, one is brand and one is outline.

### 7.3 Badge

Height: `text-[10px]` or `text-[9px]`. Always include the border (`border`) when using tinted bg. Icon: `size-2.5`. Example:

```tsx
<Badge className="text-[10px] gap-1 border bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
  <CheckCircle2 className="size-2.5" />
  Active
</Badge>
```

### 7.4 Data tables

- Header: `text-xs uppercase tracking-wider text-muted-foreground font-semibold p-3`.
- Rows: `p-3`, `divide-y`, `hover:bg-muted/30 transition-colors`.
- Mobile: wrap in `overflow-x-auto` inside a `Card`.

### 7.5 Empty state

Pattern:
```tsx
<Card className="border-dashed p-10 lg:p-12 text-center">
  <Icon className="size-6 mx-auto mb-2 opacity-50" />
  <div className="text-sm font-medium">No data yet</div>
  <div className="text-xs text-muted-foreground mt-1">Short explanation of what will show up here</div>
  {actionButton}
</Card>
```

Never leave a truly blank area. Always explain what's coming.

---

## 8. Iconography

**Library:** `lucide-react` only. No Heroicons, no custom SVGs unless the brand mark.

**Sizes:**
| Context | Size |
|---|---|
| Inline with body text | `size-3.5` |
| Button small | `size-3` |
| Button default | `size-4` |
| Card icon (colored tile) | `size-4` in a `size-9` tile |
| Nav icon | `size-3.5` |
| Empty state | `size-6` |

Icons are decorative — text is always primary. If an icon communicates alone, add an `aria-label` or wrap in a `<button aria-label>`.

---

## 9. Accessibility checklist

Every component must pass before ship:

- [ ] Focus ring visible on keyboard tab (`focus-visible:ring-3 focus-visible:ring-ring/50`).
- [ ] Tap target ≥ 40×40px on mobile.
- [ ] Color contrast: text vs surface AA (4.5:1 body, 3:1 large).
- [ ] Semantic HTML (`<button>` not `<div onClick>`).
- [ ] Icon-only buttons have `aria-label`.
- [ ] Modals trap focus + close on ESC (Base UI handles).
- [ ] Form errors announced inline (aria-invalid + visible text).

---

## 10. Platform-specific rules

### Admin (`/admin/*`)
- **Sidebar** tone slightly warmer (`rose → orange → amber` gradient on logo) — signals "different zone".
- **Cards** may use denser padding (`p-4` default) — admins scan lots of data.
- **Animations** subtle only. No floating orbs, no brand-gradient bars. It's a tool.

### Customer dashboard (`/dashboard/*`)
- **Sidebar** uses the brand gradient on the logo.
- **Cards** `p-5` default. Space over density.
- **Animations** earned (hero page, wins, pillar trend chart) — not everywhere.

### Landing / marketing (`/`, `/privacy`, `/terms`, `/security`)
- **Most expressive** surface. Big headlines, gradient text, floating orbs, pillar bounces.
- **Section rhythm:** `py-24 md:py-32` between sections. Always.
- **Max width:** `max-w-6xl` for grids, `max-w-3xl` for prose.

### Auth / onboarding (`/login`, `/signup/*`)
- **Split-panel** layout. Right panel is the promo side (brand gradient background).
- **Form panel** minimalist, generous whitespace.
- **Animations** on panel swap (mode change) + stepper progress.

---

## 11. Klimb brand checklist (pre-ship)

Before any PR merges:

- [ ] Section outer padding matches `px-4 sm:px-6 lg:px-10`.
- [ ] Max-width set correctly for context.
- [ ] Card padding consistent within the section.
- [ ] Typography uses the scale — no one-off sizes.
- [ ] Colors semantic, not hardcoded hex.
- [ ] Icons sized per section 8.
- [ ] Empty state present where data can be absent.
- [ ] Animation follows section 5 (easing + duration + entry pattern).
- [ ] Responsive at `sm` / `md` / `lg` breakpoints — no horizontal scroll.
- [ ] Keyboard navigable + focus-visible.
- [ ] Dark mode visually parallel (not just "works").

---

Last updated: 2026-04-20
