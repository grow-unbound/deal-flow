# Yukti Design System — R12

The canonical design system for **Yukti** — the operating layer of the business. Charcoal + Copper · Inter · India-first, globally credible.

**Namespace:** `window.YuktiDesignSystem_13a225`
**Brand identity:** R10 Final (locked) · **Execution revision:** R12
**Canonical mode:** Light. Dark is a supported variant.

> This document is the **developer handover reference**. Every token, component prop, interaction pattern, and screen is specified here so the product can be implemented or upgraded screen-by-screen with no gaps.

---

## Changelog

| Version | Changes |
|---|---|
| **R10** | Brand identity locked — palette (Charcoal + Copper), Voussoir keystone mark, type roles (Mukta + Baloo 2), Paper ground, tagline, status = shape + label. |
| **R11** | Sidebar **light** in light mode (dark only in dark mode) · Primary buttons **charcoal**, copper reserved to ≤1 accent CTA per screen · Base UI text **15px** with explicit Mukta 700–800 heading tier · Mono swapped **IBM Plex Mono → JetBrains Mono** everywhere · Icon **strokeWidth default 2.0** (context overrides) · **₹ spacing tightened** · Page spacing increased · Full screen coverage spec. |
| **R11.1** | Base UI text **16px** · Mono swap completed · **Hover + press ("haptic") states** added across Button, Card, ProductCard, Input, Select, nav · Nav/tab-bar icon stroke reduced 2.25→1.75 · ₹ prefix proportional (0.58em) and hugging · Avatar border restored · Select rebuilt as styled dropdown · DatePicker added · Active nav: copper left border + 8% tint bg. |
| **R12 (this revision)** | **Primary UI font: Mukta → Inter** (Latin-first; higher x-height; production choice of Razorpay/Groww/Zepto; Noto Sans Devanagari added at Indic localisation time) · **Base: 16px → 14px** (Inter's x-height is ~7% taller than Mukta's; no compensation needed) · **Body weight: 400 → 500** (Inter 500 is optically equivalent to Mukta 400 in density) · **Page title: 22–24px Mukta → 36px Inter 800, letter-spacing -0.02em** · **Active nav: copper left border removed** — background-tint-only active state (`rgba(181,100,47,0.09)` bg, `#221E1A` text, no border) · **Stat card eyebrow label: JetBrains Mono 10px → Inter 500 11px uppercase 0.08em** · **JetBrains Mono scope tightened**: use only when the value is a code/ID/pure number the user would scan or copy; replace with Inter + `tabular-nums` everywhere else · **Type scale expressed as `calc()` multipliers** from a single `--yk-text-base` source of truth so the entire scale shifts when base changes · Supporting/date text: JetBrains Mono removed, now Inter with `tabular-nums` where needed · Tailwind `fontFamily.sans` and `--font-sans` CSS variable both point to Inter (shadcn/ui consumes `--font-sans`, not `--yk-font-ui`). |

### What did **not** change (locked per R10)
Brand palette · status = shape + label · `--yk-*` token naming · shadows / radii / motion tokens · the mark, tagline, signature story · Baloo 2 for wordmark/logotype.

---

## Brand principles (non-negotiable)

| Principle | Rule |
|---|---|
| **One palette** | Charcoal `#221E1A` + Copper `#B5642F` — no other brand colours |
| **Light canonical** | Light is default; dark is a variant. **Sidebar follows the mode** (light in light, dark in dark) |
| **Copper = accents only** | Copper fails AA at small sizes. Never body text, never a price, **≤1 copper CTA per screen**. Catalog/grid "Add to cart" buttons are **charcoal**, not copper — copper is reserved for a single terminal CTA (Place order, Publish catalog) |
| **Charcoal = the action** | Primary buttons are charcoal `#221E1A` — confident, not loud. **`md` is the default size** |
| **Everything responds** | Every interactive element has a hover (sub-5% warm tint or surface shift) and a press "haptic" (`scale(0.97)`). Felt, not seen |
| **Status = shape + label** | ~8% of users are colour-blind. Status is ALWAYS shape glyph + text, never colour alone |
| **Inter for UI, JetBrains Mono for codes** | Inter is the UI font. Baloo 2 is wordmark/logotype ONLY. JetBrains Mono only where a value is a code, ID, order number, or pure number a user would copy or scan (see Typography) |
| **Tabular numerals** | All money, quantities, IDs use `font-variant-numeric: tabular-nums` |
| **No ledgers/coins** | Avoid accounting/compliance/paperwork imagery |
| **Owner is the hero** | Yukti recommends, the owner decides |
| **RTL-ready** | `dir="ltr"` root; mirror layout for Arabic/Gulf markets |

---

## Typography (R12)

Loaded via Google Fonts. Always `display=swap`.

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Baloo+2:wght@500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500&display=swap" rel="stylesheet">
```

**Fallback stack:** `'Inter', -apple-system, 'Segoe UI', sans-serif` · mono: `'JetBrains Mono', ui-monospace, 'SF Mono', monospace`.

**Indic localisation path:** When the UI is translated to Hindi/Marathi/Kannada etc., load `Noto Sans Devanagari` (or the matching Noto script) alongside Inter. Do not add Mukta back. Inter covers ASCII + Latin; Noto covers the script. Two fonts total.

### Hierarchy tiers

| Role | Font | Size token | Weight | Tracking |
|---|---|---|---|---|
| Page title / hero | Inter | `--yk-text-3xl` (~36px) | 800 | -0.02em |
| Section heading | Inter | `--yk-text-xl` (~22px) | 700 | -0.02em |
| Card / group heading | Inter | `--yk-text-lg` (~18px) | 600 | -0.015em |
| Body / prose | Inter | `--yk-text-base` (14px) | **500** | -0.01em |
| Caption / label | Inter | `--yk-text-sm` (~12px) | 500–600 | +0.04em (uppercase optional) |
| Stat eyebrow label | Inter | `--yk-text-xs` (~11px) | 500 | 0.08em, uppercase |
| Mono value (stat / price / ID) | JetBrains Mono | 28px (stat) / `--yk-text-sm` (table) | 500 | -0.02em, tabular-nums |

### JetBrains Mono — single usage rule

> **Use JetBrains Mono only when the value is a code, ID, order number, or pure numeric figure the user needs to scan or copy verbatim.**

Use JetBrains Mono for: `₹` stat values, SKU codes (`SKU-512`), order numbers (`DF-2026-00123`), transaction IDs, per-row numeric data in tables that must align optically.

Replace with **Inter + `font-variant-numeric: tabular-nums`** for: dates (`12 Jun 2026`), supporting/contextual text, section sub-labels, any string that mixes letters and numbers but isn't an ID, phone numbers, address numbers.

**The test:** if a user would highlight it to copy it as a raw string, it's JetBrains Mono. If they would read it as part of a sentence, it's Inter.

---

## Token reference (`styles.css`)

```css
/* ── Colour ── */
--yk-ink:        #221E1A   /* body text · 15.4:1 AAA on paper · PRIMARY BUTTON FILL */
--yk-surface:    #2B2825   /* dark base · DARK-MODE body canvas */
--yk-copper:     #B5642F   /* accents · light · ≤1 CTA per screen */
--yk-copper-lt:  #D9894C   /* accents · dark */
--yk-paper:      #F8F6F2   /* warm off-white — SIDEBAR bg in light mode */
--yk-card:       #FCFBF8   /* bright off-white — BODY CANVAS bg in light mode; also individual card surfaces */
--yk-card-line:  #EAE3D9   /* hairline borders */
--yk-sub:        #64594E   /* muted text + inactive nav icon · 6.4:1 */
--yk-faint:      #6F665C   /* label text · 5.3:1 */
--yk-on-dark:    #F3EEE6   /* text on dark · 12.6:1 */

/* ── Surface assignment — two semantic aliases (use these in components, not the raw tokens) ── */
/* Light mode */
--yk-bg-canvas:  var(--yk-card);    /* #FCFBF8 — body shell background (lighter, pulls forward) */
--yk-bg-sidebar: var(--yk-paper);   /* #F8F6F2 — sidebar background (warmer, slightly recessed) */
/* Dark mode (override in [data-theme="dark"] or .dark) */
/* --yk-bg-canvas:  #2B2825;           --yk-surface — dark body shell */
/* --yk-bg-sidebar: #1E1B18;           one step darker than surface — sidebar recedes in dark too */

/* Status (semantic — always paired with a shape glyph) */
--yk-success #1F6B3A · --yk-warning #8A5700 · --yk-error #9C3026 · --yk-info #2A5F8A
(each has matching -bg and -border tints)

/* ── Type ── */
--yk-font-ui:       'Inter'           /* primary UI font — all body, headings, labels */
--yk-font-wordmark: 'Baloo 2'         /* wordmark / logotype only */
--yk-font-mono:     'JetBrains Mono'  /* codes, IDs, stat values only */

/* Type scale — single source of truth with calc() multipliers */
/* Change ONLY --yk-text-base; every other step shifts automatically */
--yk-text-base: 14px;
--yk-text-xs:   calc(var(--yk-text-base) * 0.786);   /* ~11px */
--yk-text-sm:   calc(var(--yk-text-base) * 0.857);   /* ~12px */
--yk-text-md:   calc(var(--yk-text-base) * 1.071);   /* ~15px */
--yk-text-lg:   calc(var(--yk-text-base) * 1.286);   /* ~18px */
--yk-text-xl:   calc(var(--yk-text-base) * 1.571);   /* ~22px */
--yk-text-2xl:  calc(var(--yk-text-base) * 2.0);     /* ~28px */
--yk-text-3xl:  calc(var(--yk-text-base) * 2.571);   /* ~36px */

/* ─ DO NOT hardcode font-size: Xpx in components. ─ */
/* Use the --yk-text-* variables so the scale stays coherent. */

--yk-weight-light 300 → extrabold 800

/* ── Spacing (4px grid) ── */
--yk-space-1 4 · 2 8 · 3 12 · 4 16 · 5 20 · 6 24 · 8 32 · 10 40 · 12 48 · 16 64 · 20 80

/* ── Radii ── */  sm 6 · md 10 · lg 14 · xl 20 · full 9999
/* ── Shadows ── */ xs → xl, warm ink tint rgba(34,30,26,α) — never cool grey
/* ── Motion ── */ --yk-ease cubic-bezier(.22,1,.36,1) · fast 100 · base 180 · slow 280ms
/* ── Interaction ── */ --yk-hover-tint rgba(34,30,26,.05) · --yk-active-tint .08 · --yk-press-scale 0.97 · --yk-lift (card hover shadow)
```

---

## Components — props API

All components are exported on `window.YuktiDesignSystem_13a225`. `.d.ts` files carry the authoritative types.

### Button
`variant` `'primary'|'accent'|'secondary'|'ghost'|'danger'` (default primary) · `size` `'sm'|'md'|'lg'` (**default `md`** — 34/40/48px) · `label` · `children` · `icon` (ReactNode, leads) · `disabled` · `loading` · `fullWidth` · `type` · `onClick`
- **primary** = charcoal `#221E1A` fill — the default action.
- **accent** = copper `#B5642F` fill — **reserved**: max one per screen, for the single most important / terminal action (Publish catalog, Place order). Never for form submits, saves, repeated actions, or per-card "Add to cart" in a grid.

**Charcoal primary button — hover and press states:**
Dark buttons lighten on interaction (inverse of light buttons):
- **Rest:** `background: #221E1A` (charcoal)
- **Hover:** `background: #3D3630` — a ~10% white overlay lift. Do NOT darken further; there is nowhere darker to go. The lift must be perceptible on the warm paper ground.
- **Press/active:** `background: #2E2A26` (slightly lighter than rest but less than hover) + `transform: scale(0.97)` haptic. The scale is the primary feedback signal; the colour shift is secondary.
- **Disabled:** `background: #221E1A` at `opacity: 0.38`, no interaction.
- CSS pattern: `&:hover { background: #3D3630; } &:active { background: #2E2A26; transform: scale(0.97); }`

**Accent (copper) button hover/press:**
- **Hover:** `background: #C97438` (copper + ~8% white lift)
- **Press:** `background: #B5642F` + `transform: scale(0.97)`

**Every variant** has a **hover** (surface shift) and a **press** `scale(0.97)` haptic. **Do:** charcoal primary + secondary/ghost siblings. **Don't:** two copper buttons on one screen; copper for "Save".

### Stat
`value` · `label` · `prefix` (e.g. `₹` — rendered **proportional at 0.58em, baseline-aligned, hugging** the number, no whitespace node) · `trend` · `trendDir` `'up'|'down'|'neutral'` · `trendContext` · `icon` · `dark`
- **Value:** JetBrains Mono 28px/500 tabular-nums, colour `#221E1A`. The `₹` prefix is a sub-element of the number, never a full-size sibling.
- **Eyebrow label:** Inter 500, `--yk-text-xs` (~11px), uppercase, `letter-spacing: 0.08em`, colour `#64594E` (`--yk-sub`). **Not** JetBrains Mono.
- **Trend %:** Inter 600, `--yk-text-sm` (~12px).
- **Hero/display stat numbers** on detail pages (large KPI figures that are the focus of a view): use `#4A3F35` (one step off full charcoal) instead of `#221E1A` — softens density without losing readability.

### DataTable
`columns` `[{key,label,numeric?,render?(val,row,i)}]` · `rows` · `emptyLabel` · `onRowClick(row,i)` · `stickyHeader` (default true)
- Numeric data cells: right-aligned, JetBrains Mono `--yk-text-sm`, tabular-nums.
- Column headers: Inter 500, `--yk-text-xs`, uppercase, `letter-spacing: 0.08em`. **Not** JetBrains Mono.
- Date cells: Inter regular, `--yk-text-sm`, `--yk-sub`. **Not** JetBrains Mono.

### Badge
`variant` `'copper'|'success'|'warning'|'error'|'neutral'` (default neutral) · `label`/`children` — every variant has a distinct SVG shape glyph (never colour alone). Inter 500 `--yk-text-xs` uppercase.

### StatusChip
`status` `'draft'|'published'|'archived'|'received'|'confirmed'|'partially_dispatched'|'dispatched'|'delivered'|'cancelled'|'active'|'inactive'|'pending'` · `label` (override) — colour + shape glyph + label. See **Status system** below.

### Input
`label` · `placeholder` · `hint` · `error` (red ring + message) · `type` · `value`/`defaultValue` · `prefix`/`suffix` · `disabled` · `required` · `name`/`id` · `onChange`/`onBlur`

### Select
`label` · `placeholder` · `options` `[{value,label,disabled?}]` · `value`/`defaultValue` · `hint` · `error` · `disabled` · `required` · `onChange(value)`
- **Custom styled dropdown** — not a native `<select>`. Trigger matches the Input field (42px, copper focus ring); popover is a rounded card with per-option hover tint and a copper check on the selected row.

### DatePicker
`label` · `placeholder` (default `DD MMM YYYY`) · `value`/`defaultValue` (ISO string or `Date`) · `min`/`max` · `hint` · `error` · `disabled` · `required` · `name`/`id` · `onChange(iso)`
- Field + **styled calendar popover** (Mon-first grid). Selected day = copper fill; today = copper dot; day numbers use JetBrains Mono tabular-nums. Emits ISO `YYYY-MM-DD`; displays `DD MMM YYYY`. Month/year labels: Inter.

### Toggle
`checked` · `disabled` · `label` · `hint` · `size` `'sm'|'md'` · `onChange(next)` — copper track when on.

### Card
`padding` `'none'|'sm'|'md'|'lg'` · `bordered` (default true) · `elevated` · `dark` · `onClick` · `style` · `role`

### Avatar
`name` (initials + deterministic warm palette) · `src` · `alt` · `size` `'xs'|'sm'|'md'|'lg'|'xl'` · `shape` `'circle'|'square'`
- Carries a subtle `rgba(34,30,26,.10)` ring — reads cleaner than borderless on the warm ground.

### Alert
`variant` `'info'|'success'|'warning'|'error'` · `title` · `body` · `children` · `onDismiss` — icon + shape, warm tints.

### SearchBar
`placeholder` · `value`/`defaultValue` · `shortcut` (e.g. `⌘K`) · `size` `'sm'|'md'|'lg'` · `disabled` · `fullWidth` · `onChange`/`onClear`/`onSubmit`

### ProductCard
`name` · `brand` · `sku` · `price` · `mrp` (struck through) · `uom` · `imageUrl` · `availability` `'available'|'limited'|'out-of-stock'` · `isNew` · `onAddToCart` · `onClick`
- Price: JetBrains Mono `--yk-ink`, ₹ tight (proportional sub-element). Card lifts on hover. Add-to-cart = **charcoal** (cards appear in grids — copper would break the ≤1-per-screen rule).

### Tabs
`items` `[{id,label,count?,disabled?}]` · `activeId` · `size` `'sm'|'md'` · `onChange(id)` — copper underline + weight on active.

### EmptyState
`kind` `'orders'|'catalog'|'buyers'|'search'|'generic'` · `title` · `body` · `action` · `illustration` (override). No coins/ledgers.

### YuktiMark
Voussoir keystone — `variant` copper / ink / white / twoTone. Wordmark uses Baloo 2.

---

## Icons — stroke-weight system

Library: **Lucide** (24×24 viewBox). Default `strokeWidth = 2.0`. Context overrides:

| Context | Size | strokeWidth | Colour |
|---|---|---|---|
| Cockpit sidebar nav | 17px | **1.75** | inactive `--yk-sub`, active `--yk-ink` (outlined, never filled) |
| Topbar / action bar | 16px | 2.0 | `--yk-ink` |
| Inline in buttons | 14–16px | 1.85 | inherits text |
| Table / list row | 14–16px | 1.85 | `--yk-sub` |
| Card / section icons | 18–20px | 1.75 | contextual |
| Buyer tab bar | 22–24px | **1.75** | active `--yk-ink`, inactive `--yk-sub` |
| Empty-state illustration | 32–48px | 1.5 | decorative |
| Stat trend arrow | 12px | 2.0 | semantic |

**Active nav indicator:** background tint only — no left border, no border of any kind. See Navigation patterns.

---

## Status system — exact tokens & glyphs

Always `shape glyph + text label`. Never colour alone.

| Status | Colour | Glyph | Used in |
|---|---|---|---|
| Draft | `#64594E` | dashed circle | Catalogs, Price Lists |
| Published / Confirmed | `#6a3d18` (copper-ink) | dot / check | Catalogs / Orders |
| Archived / Inactive | `#64594E` | square / dashed | Catalogs / entities |
| Received | `#2A5F8A` | ring | Orders |
| Dispatched / Partially dispatched | `#2A5F8A` | arrow | Orders |
| Delivered / Active | `#1F6B3A` | check / dot | Orders / entities |
| Cancelled | `#9C3026` | cross | Orders |
| Pending | `#8A5700` | ring | Orders, payments |

---

## Data display rules

- **Prices:** JetBrains Mono · `tabular-nums` · `--yk-ink` · `₹` prefix tight (1px gap, no whitespace node). Never copper.
- **Quantities:** JetBrains Mono, right-aligned in tables.
- **Dates:** `DD MMM YYYY`, Inter regular, `--yk-sub`. **Not** JetBrains Mono.
- **Lakh/crore:** `₹4.2L` in summary/marketing; full precision (`₹4,17,012` lakh format) in data tables.
- **IDs / SKUs / order numbers:** JetBrains Mono.
- **Supporting / contextual text:** Inter with `font-variant-numeric: tabular-nums` on any numeric spans.

---

## Interaction patterns

- **Hover & press (everything responds):** every interactive element shifts on hover — buttons swap to a `hoverBackground` (dark buttons lighten, light buttons darken), secondary/cards/rows take a sub-5% warm tint (`--yk-hover-tint`) or lift (`--yk-lift`), nav items take an 8% tint. On press, elements give a `scale(0.97)` "haptic" nudge. Inputs/Select/DatePicker take a copper focus ring. Felt, not seen.
- **Charcoal button direction:** hover → lighter (`#3D3630`). Press → `scale(0.97)` + `#2E2A26`. This is the inverse of light buttons.
- **Optimistic UI:** mutations apply to the cache immediately (React Query `onMutate`), roll back on error. Show the new state instantly; never block the UI on the round-trip.
- **Loading:** skeleton screens for list/table pages (hairline `#EAE3D9` blocks on `#FCFBF8`), never a blank transition. Spinners only for in-button/inline waits.
- **Error states:** inline field errors (Input `error` prop, red ring + message); API failures as a dismissible `Alert variant="error"` banner.
- **Empty states:** one per section, structural keystone illustration, a single primary CTA to resolve.

## Navigation patterns

**Cockpit sidebar:**
- **Sidebar shell background:** `var(--yk-bg-sidebar)` — `#F8F6F2` in light, `#1E1B18` in dark.
- **Active item** — **background tint only, no border of any kind.**
  - `background: rgba(181,100,47,0.09)` (9% copper tint)
  - `color: #221E1A` light / `#D9894C` dark
  - No copper left border. No box-shadow. No border of any kind.
- **Hover** — `background: rgba(34,30,26,0.05)` light / `rgba(255,255,255,0.05)` dark
- **Inactive** — `color: #64594E` (`--yk-sub`) light / `rgba(243,238,230,0.55)` dark
- Sidebar nav text: Inter 500, `--yk-text-sm` (~12px). Section headers: Inter 500 uppercase `--yk-text-xs`, `--yk-faint`.
- Breadcrumb appears on detail pages (`Brands / Amul / Products`).

**Buyer PWA:** 4 primary tabs only — **Home · Catalog · Orders · Profile**. Active tab = copper top-border (2px) + heavier text weight, not a solid fill. Sticky frosted header on scroll.

---

## Screen inventory (implementation spec)

### Seller cockpit — 10 sections
| Section | Contents |
|---|---|
| Dashboard | 6-KPI row, low-stock alert banner, recent orders table, top buyers, activity feed |
| Brands | brand cards (logo, product count, active toggle), search + filter, empty state |
| Products | filterable table (SKU/brand/price/stock/status), bulk select, CSV import, empty state |
| Customers | buyer table, cohort badge + credit-limit columns, search, add-buyer CTA |
| Cohorts | cohort cards (name, member count, rule preview), builder preview, empty state |
| Price Lists | table with active/scheduled/expired StatusChips, assign CTA, empty state |
| Catalogs | published/draft cards, share link, buyer count, **publish CTA = accent (copper)**, empty state |
| Orders | order table, status filter chips, expandable row |
| Exports | export-type list (Tally Item Master, Sales Voucher, Ledger Master, Zoho), date range, download CTA |
| Settings | 7 tabs — General, Team, Billing, Integrations, Locations, Features, Notifications |

**Composers:** Add/Edit Brand · Add/Edit Product · Add/Edit Buyer · Create Cohort · Create Price List · Publish Catalog (**publish = copper accent**) · Order status update · Add Team Member · Zoho connect.

**Detail pages:** Brand · Product · Buyer · Order — each: header identity + status + actions, then tabs.

### Buyer PWA — 10 screens
OTP login · Home · Catalog · Product detail · Cart *(**Place order = copper accent**)* · Checkout *(confirm = charcoal)* · Order placed · Orders list · Order detail · Profile.

---

## Accessibility (WCAG 2.1 AA)

- **Confirmed text/background pairs:** ink/paper 15.4:1 (AAA) · sub/paper 6.4:1 · faint/paper 5.3:1 · on-dark/surface 12.6:1 · all status colours ≥4.5:1 on their tint.
- **Copper `#B5642F`** passes AA only at ≥18px/bold — use for fills + `#6a3d18` copper-ink for small text. Never copper for body or prices.
- **Focus ring:** `outline: 2px solid #B5642F` on `:focus-visible`, 2px offset.
- **Touch targets:** ≥44px on the buyer PWA.
- **Status:** never colour alone — shape glyph + label is the AA-safe pattern.
- Toggle is `role="switch"` with `aria-checked`; Alert is `role="alert"`.

## RTL readiness (Gulf markets)

Root `dir="ltr"`; set `dir="rtl"` to mirror. Components needing mirroring: **sidebar** (active-bg still shows, border flip not needed since we removed the left border), **Tabs** underline order, **Button/ProductCard** icon side, **breadcrumb** chevrons, **tab bar** order. Numbers/prices stay LTR inside RTL flow.

## Dark mode

Light is canonical. The surface hierarchy rule is the same in both modes: **sidebar is always slightly darker/more recessed than the body canvas.**

| Token | Light mode | Dark mode |
|---|---|---|
| `--yk-bg-canvas` (body shell) | `#FCFBF8` | `#2B2825` (`--yk-surface`) |
| `--yk-bg-sidebar` (sidebar) | `#F8F6F2` | `#1E1B18` (one step below surface) |
| Individual cards | `#FCFBF8` (same as canvas) + `rgba(0,0,0,.04)` border | `#2B2825` + `rgba(255,255,255,.08)` border |
| Body text | `#221E1A` | `#F3EEE6` (`--yk-on-dark`) |
| Sidebar text/icons | `#221E1A` / `#64594E` | `#F3EEE6` / `rgba(243,238,230,.55)` |
| Copper accent | `#B5642F` | `#D9894C` (`--yk-copper-lt`) |
| Active nav bg | `rgba(181,100,47,.09)` | `rgba(181,100,47,.18)` |
| Active nav text | `#221E1A` | `#D9894C` |

In dark mode, set `--yk-bg-canvas` and `--yk-bg-sidebar` overrides inside `[data-theme="dark"]` or `.dark`. All component files should reference the semantic aliases (`--yk-bg-canvas`, `--yk-bg-sidebar`), never the raw hex values.

**Charcoal primary button in dark mode:** `#221E1A` on a dark canvas is near-invisible. Invert to `background: #F3EEE6` + `color: #221E1A`. Hover: `background: #EAE3D9`. Copper accent keeps `#D9894C` — no change needed.

---

## Tailwind config mapping

```ts
// tailwind.config.ts — three locations must be updated together (Codex misses these)
// 1. fontFamily in theme
// 2. CSS variable --font-sans (shadcn/ui reads this, not --yk-font-ui)
// 3. Google Fonts URL (must list all weights: 400;500;600;700;800)

theme: { extend: {
  colors: {
    ink:'#221E1A', surface:'#2B2825', copper:'#B5642F', 'copper-lt':'#D9894C',
    paper:'#F8F6F2', card:'#FCFBF8', line:'#EAE3D9', sub:'#64594E', faint:'#6F665C',
    success:'#1F6B3A', warning:'#8A5700', error:'#9C3026', info:'#2A5F8A',
  },
  fontFamily: {
    sans: ['Inter', '-apple-system', '"Segoe UI"', 'sans-serif'],  // shadcn/ui default stack
    ui:   ['Inter', 'sans-serif'],     // --yk-font-ui alias
    wordmark: ['"Baloo 2"', 'sans-serif'],
    mono: ['"JetBrains Mono"', 'monospace'],
  },
  borderRadius: { sm:'6px', md:'10px', lg:'14px', xl:'20px' },
  boxShadow: { /* warm ink-tint xs→xl */ },
}}
```

```css
/* globals.css or layout root — shadcn/ui reads --font-sans, not --yk-font-ui */
:root {
  --font-sans: 'Inter', -apple-system, 'Segoe UI', sans-serif;
  --yk-font-ui: 'Inter';
}
```

---

## Using components in a @dsCard preview

```html
<script src="../_ds_bundle.js"></script>
<script type="text/babel" data-presets="env,react">
  const { Button, StatusChip } = window.YuktiDesignSystem_13a225;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <Button variant="accent" label="Publish catalog" />
  );
</script>
```

## Templates

| Template | Path | Description |
|---|---|---|
| **Seller Cockpit** | `templates/seller-cockpit/` | R12 cockpit shell — light sidebar (10 nav), charcoal actions, background-only active nav, Dashboard |
| **Buyer App** | `templates/buyer-app/` | R12 retailer PWA — catalog browse, **charcoal** add-to-cart (copper reserved for Place order), 4-tab bar with copper top-border indicator |

---

## Voice & copy

| Use | Avoid |
|---|---|
| "3 prices need review." | "Leverage AI-powered insights to optimize." |
| "That didn't save. Here's how to fix it." | "An unexpected error occurred." |
| "Let's get your catalog live." | "Welcome to the platform!" |
| "You decide. Yukti makes it pay off." | "Let Yukti run your business for you." |

---

## One file or full design system folder?

**This readme is sufficient to drive Codex implementations.** It is the source of truth — Codex reads it for tokens, rules, and component contracts and applies them in the Next.js codebase. You proved this already: R11 was applied with just the readme.

The **full design system folder** (JSX component files, CSS, HTML previews) serves a different purpose: visual reference, Claude Design re-generation of component previews, and design handoffs to non-engineers. The right workflow is:

1. Update this readme (done — R12).
2. When you need fresh component previews or want to hand the DS to a designer, pass this readme to Claude Design and ask it to regenerate the full folder from scratch.
3. Keep the readme and the generated folder in sync by treating the readme as the source and the folder as the output.

There is no urgency to regenerate the folder for implementation. Do it when you need the visual artifacts.
