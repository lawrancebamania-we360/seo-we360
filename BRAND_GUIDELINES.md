# SEO-We360 Brand Guidelines

> Internal reference for product, design, and engineering. This is the **single source of truth** for visual decisions in the we360.ai SEO dashboard. If a component disagrees with this doc, the component is wrong.

**Personality:** *Crisp, modern, confident.* The dashboard is for an internal SEO team that ships every day — the UI should feel like a capable teammate. Think **Linear meets Notion** with a we360 violet accent: clean information architecture, generous whitespace, purposeful color, small earned moments of delight.

---

## 1. Color system

The palette comes from the **we360.ai brand guidelines**: a violet primary axis, a yellow accent for highlights, and dark navy for high-density surfaces.

### 1.1 Primary brand

| Token | Hex | Use |
|---|---|---|
| Primary Purple | `#5B45E0` | Hover state on CTAs, focus rings, sidebar active states, `--ring`, `--primary` (dark mode) |
| Light Purple | `#7B62FF` | Default state on CTAs, ambient glow, `--primary` (light mode) |
| Accent Yellow | `#FEB800` | One-off highlights — pillar AIO, badge gradient end, key callouts. Never the dominant color in a section. |

**Brand gradient (use sparingly):** `linear-gradient(90deg, #5B45E0, #7B62FF, #FEB800)`. Used for the brand mark, the loading spinner, the hero CTA — **at most once per visible viewport**.

### 1.2 Surfaces & text

| Purpose | Light | Dark | Notes |
|---|---|---|---|
| Background | `#FFFFFF` | `#070127` (Dark Navy) | Body |
| Card | `#FFFFFF` | `#0F0B2E` | Elevated surface |
| Muted bg | `#F8FAFC` | `#1A1438` | Sidebar, table headers |
| Tinted purple bg | `#F0ECFF` | `#191127` | Active nav, secondary chips |
| Tinted blue bg | `#EEF2FE` | `#191127` | Accent chips |
| Heading | `#231D4F` | `#F8FAFC` | All `h1`–`h6` |
| Body large | `#191127` | `#F8FAFC` | Hero / feature copy |
| Body / muted | `#7E8492` | `#9AA0B0` | Helper text, captions |
| Border | `#E5E7EB` | `oklch(1 0 0 / 10%)` | Default `--border` |

**Tinted-surface rule:** when using a brand color as a tinted background, use `purple-500/10` in light mode and `purple-500/15–20` in dark mode. Border at `purple-500/20`.

```html
<div class="bg-[#7B62FF]/10 text-[#5B45E0] dark:text-[#7B62FF] border border-[#7B62FF]/20 rounded-md p-3">
```

### 1.3 Semantic palette

| Purpose | Light | Dark | Tailwind |
|---|---|---|---|
| Success | `emerald-600` | `emerald-400` | `text-emerald-600 dark:text-emerald-400` |
| Info | `sky-600` | `sky-400` | `text-sky-600 dark:text-sky-400` |
| Brand | `[#5B45E0]` | `[#7B62FF]` | `text-[#5B45E0] dark:text-[#7B62FF]` |
| Warning | `amber-600` | `amber-400` | `text-amber-600 dark:text-amber-400` |
| Danger | `rose-600` | `rose-400` | `text-rose-600 dark:text-rose-400` |
| Highlight | `[#FEB800]` | `[#FEB800]` | `text-[#FEB800]` (use sparingly) |

### 1.4 Pillar colors (SEO / AEO / GEO / SXO / AIO)

Used consistently across pillar cards, radars, trend charts, badges. **Never swap these in a chart — muscle memory matters.**

| Pillar | Color | Hex | Why |
|---|---|---|---|
| SEO | emerald | `#10b981` | Search — growth |
| AEO | sky | `#0ea5e9` | Answer — clarity |
| GEO | violet | `#5B45E0` | Generative AI — brand purple |
| SXO | amber | `#f59e0b` | Experience — warm |
| AIO | yellow-orange | `#FEB800` | AI Overviews — brand yellow |

### 1.5 Charts

Brand-aware sequential palette (light mode):

| # | Hex | Notes |
|---|---|---|
| 1 | `#5B45E0` | Primary purple — first series |
| 2 | `#7B62FF` | Light purple — second series |
| 3 | `#FEB800` | Brand yellow — accent series |
| 4 | `#7E8492` | Neutral — comparison / baseline |
| 5 | `#231D4F` | Heading navy — totals / outline |

---

## 2. Typography

**Font pair:** **Poppins** (sans, UI + headings + body) + **JetBrains Mono** (tabular numbers, IDs, code). Both load via `next/font/google` in `app/layout.tsx`.

- **Poppins** — geometric sans, friendly, professional. Weights loaded: 300, 400, 500, 600, 700.
- **JetBrains Mono** — monospace for keyword IDs, URLs, code blocks, tabular numbers. Weights loaded: 400, 500, 600.

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
| Metric / numeric | `text-2xl` or `text-lg` `font-mono` | — | `font-bold tabular-nums` | — | default |
| Button | `text-sm` (`text-base` for size=lg) | same | `font-medium` or `font-semibold` | — | default |

**Tabular numbers** everywhere money, counts, or dates appear in tables or stat cards: combine `font-mono tabular-nums` for hard alignment in dense tables.

### 2.2 Content voice

- **Crisp and confident.** "Run audit now" not "Would you like to run an audit?"
- **Quantified.** "$2.45 of $5 this month" not "using some of your budget".
- **Human.** "Your last audit ran 3 hours ago" over "Last execution: 3h prior".
- **No emojis in UI text** unless they're data (win emojis, pillar badges). Don't spray them.

---

## 3. Spacing scale (4px grid)

Stick to the Tailwind scale. **Never use arbitrary `p-[17px]` style values** — if the scale doesn't have it, change the design.

### 3.1 Component padding

| Component | Padding | Example |
|---|---|---|
| Tight list item | `px-3 py-2` | sidebar nav item |
| Badge | `px-2 py-0.5` (`text-[10px]`) | status pill |
| Button sm | `px-2.5 py-1` | table action |
| Button lg | `px-8 h-12` | hero CTA |
| Card compact | `p-4` | stat cards, list rows |
| Card standard | `p-5` | most dashboard cards |
| Card editorial | `p-6 lg:p-8` | admin/settings full-width cards |
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

Landing sections (if any) use `py-24 md:py-32` between sections. Always that pair — never `py-20` or `py-36`. Consistency is the point.

---

## 4. Radius, shadows, borders

### 4.1 Radius (matches `globals.css`)

| Token | Value | Use |
|---|---|---|
| `rounded` | 8px | Default — buttons, inputs, badges |
| `rounded-md` | 8px | Compact cards, table rows |
| `rounded-lg` | 12px | Standard cards, tags, containers |
| `rounded-xl` | 16px | Feature cards, modals |
| `rounded-2xl` | 24px | Hero blocks |
| `rounded-full` | round | Avatars, pills, icon buttons |

### 4.2 Shadows

- Default card: no shadow. Hover: `hover:shadow-md`.
- Raised hero mockup: `shadow-2xl shadow-[#5B45E0]/10`.
- Brand CTA: `shadow-md shadow-[#5B45E0]/25` → `hover:shadow-lg hover:shadow-[#5B45E0]/40`.
- Focus: `focus-visible:ring-3 focus-visible:ring-[#7B62FF]/50`.

### 4.3 Borders

- Default `border` everywhere except where we want softer (`border/60`) or dashed (`border-dashed` for empty states).
- Destructive cards: `border-rose-300 dark:border-rose-900`.
- Highlighted card: `border-[#7B62FF]` + `shadow-2xl shadow-[#5B45E0]/20`.

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

**Scale-in (cards on click):**
```tsx
initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
```

### 5.4 Reduced-motion

Respect `prefers-reduced-motion`. For ambient floating orbs and looped animations, guard with `useReducedMotion()` or pair with the CSS media query already in `globals.css`.

### 5.5 Animation budget

- **Empty states** — gentle bounce, soften the absence.
- **Success confirmations** — checkmark spring-in.
- **Progress bars** — animate width change on value update.
- **Number counts** — stat cards count up from 0 on first mount.
- **Hover states** — cards lift `-translate-y-0.5` + shadow; icons scale `1.1`.
- **Everywhere else** — subtle. 200ms fades, minimal transforms. The dashboard is for work.

---

## 6. Breakpoints

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
- **Max content width:** `max-w-[1600px]` (dashboard), `max-w-6xl` (landing), `max-w-3xl` (editorial / docs).
- **Two-column → stack at `< md`**. Three-column → 2-col at `md`, stack at `< sm`.

### 6.2 Touch targets

Minimum 40×40px for anything a thumb can tap — `h-9` / `size-10` as the floor on mobile.

---

## 7. Components — canonical specs

### 7.1 Card

```tsx
<Card className="p-5 space-y-3">
```

In a grid, every card has the same padding and gap:

```tsx
<div className="grid gap-4 md:grid-cols-3">
  <Card className="p-5"> ... </Card>
</div>
```

**Rule:** inside one section, every card has the same padding. Don't mix `p-4` and `p-5` in the same row.

### 7.2 Button hierarchy

- `variant="brand"` → primary CTA, one per visible area (uses brand gradient or solid `#5B45E0`).
- `variant="default"` → secondary primary (solid `#7B62FF`).
- `variant="outline"` → tertiary actions (Cancel, Back).
- `variant="ghost"` → quiet actions (icon-only, nav items).
- `variant="destructive"` → delete / sign out.

Avoid stacking two brand buttons. If both are important, one is brand and one is outline.

### 7.3 Badge

Height: `text-[10px]` or `text-[9px]`. Always include the border when using tinted bg. Icon size `2.5`.

```tsx
<Badge className="text-[10px] gap-1 border bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
  <CheckCircle2 className="size-2.5" />
  Active
</Badge>
```

### 7.4 Data tables

- Header: `text-xs uppercase tracking-wider text-muted-foreground font-semibold p-3`.
- Rows: `p-3`, `divide-y`, `hover:bg-muted/30 transition-colors`.
- Numeric columns: `font-mono tabular-nums text-right`.
- Mobile: wrap in `overflow-x-auto` inside a `Card`.

### 7.5 Empty state

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

**Library:** `lucide-react` only. No custom SVGs unless it's the brand mark.

| Context | Size |
|---|---|
| Inline with body text | `size-3.5` |
| Button small | `size-3` |
| Button default | `size-4` |
| Card icon (colored tile) | `size-4` in a `size-9` tile |
| Nav icon | `size-3.5` |
| Empty state | `size-6` |

Icons are decorative — text is always primary. Icon-only buttons need an `aria-label`.

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
- **Sidebar** uses the brand purple gradient — admins are still inside the brand.
- **Cards** denser padding (`p-4` default) — admins scan lots of data.
- **Animations** subtle only. No floating orbs.

### Dashboard (`/dashboard/*`)
- **Sidebar** uses the brand gradient on the logo.
- **Cards** `p-5` default. Space over density.
- **Animations** earned (overview hero, wins, pillar trend chart) — not everywhere.

### Auth (`/login`, `/auth/*`)
- **Split-panel** layout. Right panel is the brand gradient promo side.
- **Form panel** minimalist, generous whitespace.
- **Animations** on panel swap (mode change) + stepper progress.

---

## 11. Pre-ship checklist

Before any PR merges:

- [ ] Section outer padding matches `px-4 sm:px-6 lg:px-10`.
- [ ] Max-width set correctly for context.
- [ ] Card padding consistent within the section.
- [ ] Typography uses the scale — no one-off sizes.
- [ ] Colors semantic, not hardcoded hex (except brand palette tokens).
- [ ] Numeric columns use `font-mono tabular-nums`.
- [ ] Icons sized per section 8.
- [ ] Empty state present where data can be absent.
- [ ] Animation follows section 5.
- [ ] Responsive at `sm` / `md` / `lg` breakpoints — no horizontal scroll.
- [ ] Keyboard navigable + focus-visible.
- [ ] Dark mode visually parallel.

---

Last updated: 2026-05-05
