# Yukti Design System — R11

The canonical design system for **Yukti** — the operating layer of the business. Charcoal + Copper · Mukta · India-first, globally credible.

**Namespace:** `window.YuktiDesignSystem_13a225`
**Brand identity:** R10 Final (locked) · **Execution revision:** R11
**Canonical mode:** Light. Dark is a supported variant.

> This document is the **developer handover reference**. Every token, component prop, interaction pattern, and screen is specified here so the product can be implemented or upgraded screen-by-screen with no gaps.

---

## Changelog

| Version | Changes |
|---|---|
| **R10** | Brand identity locked — palette (Charcoal + Copper), Voussoir keystone mark, type roles (Mukta + Baloo 2), Paper ground, tagline, status = shape + label. |
| **R11** | Sidebar **light** in light mode (dark only in dark mode) · Primary buttons **charcoal**, copper reserved to ≤1 accent CTA per screen · Base UI text **15px** with explicit Mukta 700–800 heading tier · Mono swapped **IBM Plex Mono → JetBrains Mono** everywhere · Icon **strokeWidth default 2.0** (context overrides) · **₹ spacing tightened** · Page spacing increased · Full screen coverage spec. |
| **R11.1 (this revision)** | Base UI text **16px** (body was reading small) · Mono swap **completed in all component preview cards** (several still loaded IBM Plex) · **Hover + press ("haptic") states** added across Button, Card, ProductCard, Input, Select, nav · **Nav/tab-bar icon stroke reduced 2.25→1.75** (was clumsy at 17–23px) · ₹ prefix made **proportional (0.58em) and hugging** the number on Stat/ProductCard/KPIs · **Avatar border restored** · **Select rebuilt as a styled dropdown** (native menu replaced) · **DatePicker added** · ProductCard add-to-cart **→ charcoal** so copper stays ≤1 per screen · Sidebar **logo enlarged**. |

### What did **not** change (locked per R10)
Brand palette · font roles · status = shape + label · `--yk-*` token naming · shadows / radii / motion tokens · the mark, tagline, signature story.

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
| **Mukta everywhere** | Baloo 2 is wordmark/logotype ONLY. JetBrains Mono for numbers/IDs |
| **Tabular numerals** | All money, quantities, IDs use `font-variant-numeric: tabular-nums` |
| **No ledgers/coins** | Avoid accounting/compliance/paperwork imagery |
| **Owner is the hero** | Yukti recommends, the owner decides |
| **RTL-ready** | `dir="ltr"` root; mirror layout for Arabic/Gulf markets |

---

## Typography (R11)

Loaded via Google Fonts. Always `display=swap`.

```html
<link href="https://fonts.googleapis.com/css2?family=Mukta:wght@300;400;500;600;700;800&family=Baloo+2:wght@500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500&display=swap" rel="stylesheet">
```

**Fallback stack:** `'Mukta', -apple-system, 'Segoe UI', sans-serif` · mono: `'JetBrains Mono', ui-monospace, 'SF Mono', monospace`.

### Hierarchy tiers — separated by weight, not a third font face

| Role | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Page title / hero | Mukta | 22–24px | 800 | -0.025em |
| Section heading | Mukta | 18px | 700 | -0.02em |
| Card / group heading | Mukta | 16px | 600 | -0.015em |
| Body | Mukta | 16px | 400 | -0.01em |
| Caption / label | Mukta | 12–12.5px | 500–600 | +0.04em (uppercase optional) |
| Mono label (stat) | JetBrains Mono | 10px | 500 | 0.10em uppercase |
| Mono value (stat) | JetBrains Mono | 28px | 500 | -0.02em, tabular-nums |

**Mono usage rule:** JetBrains Mono for prices, quantities, IDs, SKUs, order numbers, stat values. Mukta `tabular-nums` for inline numeric text that doesn't need the mono treatment.

---

## Token reference (`styles.css`)

```css
/* ── Colour ── */
--yk-ink:        #221E1A   /* body text · 15.4:1 AAA on paper · PRIMARY BUTTON FILL */
--yk-surface:    #2B2825   /* dark surfaces · DARK-MODE sidebar only */
--yk-copper:     #B5642F   /* accents · light · ≤1 CTA per screen */
--yk-copper-lt:  #D9894C   /* accents · dark */
--yk-paper:      #F8F6F2   /* page background */
--yk-card:       #FCFBF8   /* card + LIGHT sidebar surface */
--yk-card-line:  #EAE3D9   /* hairline borders */
--yk-sub:        #64594E   /* muted text + inactive nav icon · 6.4:1 */
--yk-faint:      #6F665C   /* label text · 5.3:1 */
--yk-on-dark:    #F3EEE6   /* text on dark · 12.6:1 */

/* Status (semantic — always paired with a shape glyph) */
--yk-success #1F6B3A · --yk-warning #8A5700 · --yk-error #9C3026 · --yk-info #2A5F8A
(each has matching -bg and -border tints)

/* ── Type ── */
--yk-font-ui:   'Mukta'         --yk-font-wordmark: 'Baloo 2'   --yk-font-mono: 'JetBrains Mono'
--yk-text-xs 11.5 · sm 13 · base 16 · md 17 · lg 20 · xl 24 · 2xl 32 · 3xl 46
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
- Every variant has a **hover** (surface shift) and a **press** `scale(0.97)` haptic. **Do:** charcoal primary + secondary/ghost siblings. **Don't:** two copper buttons on one screen; copper for "Save".

### Stat
`value` · `label` · `prefix` (e.g. `₹` — rendered **proportional at 0.58em, baseline-aligned, hugging** the number, no whitespace node) · `trend` · `trendDir` `'up'|'down'|'neutral'` · `trendContext` · `icon` · `dark`
- Value: JetBrains Mono 28px/500 tabular-nums. The `₹` prefix is a sub-element of the number, never a full-size sibling — it reads as one unit. Label: JetBrains Mono 10px uppercase 0.10em. Trend %: Mukta 12px/600.

### DataTable
`columns` `[{key,label,numeric?,render?(val,row,i)}]` · `rows` · `emptyLabel` · `onRowClick(row,i)` · `stickyHeader` (default true)
- Numeric columns: right-aligned, JetBrains Mono 13.5px, tabular-nums. Header: JetBrains Mono 10.5px uppercase.

### Badge
`variant` `'copper'|'success'|'warning'|'error'|'neutral'` (default neutral) · `label`/`children` — every variant has a distinct SVG shape glyph (never colour alone). JetBrains Mono 10px uppercase.

### StatusChip
`status` `'draft'|'published'|'archived'|'received'|'confirmed'|'partially_dispatched'|'dispatched'|'delivered'|'cancelled'|'active'|'inactive'|'pending'` · `label` (override) — colour + shape glyph + label. See **Status system** below.

### Input
`label` · `placeholder` · `hint` · `error` (red ring + message) · `type` · `value`/`defaultValue` · `prefix`/`suffix` · `disabled` · `required` · `name`/`id` · `onChange`/`onBlur`

### Select
`label` · `placeholder` · `options` `[{value,label,disabled?}]` · `value`/`defaultValue` · `hint` · `error` · `disabled` · `required` · `onChange(value)`
- **Custom styled dropdown** (R11.1) — not a native `<select>`. Trigger matches the Input field (42px, copper focus ring); popover is a rounded card with per-option hover tint and a copper check on the selected row. A hidden input mirrors the value for forms.

### DatePicker
`label` · `placeholder` (default `DD MMM YYYY`) · `value`/`defaultValue` (ISO string or `Date`) · `min`/`max` · `hint` · `error` · `disabled` · `required` · `name`/`id` · `onChange(iso)`
- Field + **styled calendar popover** (Mon-first grid). Selected day = copper fill; today = copper dot; days use JetBrains Mono tabular-nums. Emits an ISO `YYYY-MM-DD` string; displays the `DD MMM YYYY` house format. Use for price-list validity, delivery dates, export ranges.

### Toggle
`checked` · `disabled` · `label` · `hint` · `size` `'sm'|'md'` · `onChange(next)` — copper track when on.

### Card
`padding` `'none'|'sm'|'md'|'lg'` · `bordered` (default true) · `elevated` · `dark` · `onClick` · `style` · `role`

### Avatar
`name` (initials + deterministic warm palette) · `src` · `alt` · `size` `'xs'|'sm'|'md'|'lg'|'xl'` · `shape` `'circle'|'square'`
- Carries a subtle `rgba(34,30,26,.10)` ring (R11.1) — reads cleaner than borderless on the warm ground.

### Alert
`variant` `'info'|'success'|'warning'|'error'` · `title` · `body` · `children` · `onDismiss` — icon + shape, warm tints.

### SearchBar
`placeholder` · `value`/`defaultValue` · `shortcut` (e.g. `⌘K`) · `size` `'sm'|'md'|'lg'` · `disabled` · `fullWidth` · `onChange`/`onClear`/`onSubmit`

### ProductCard
`name` · `brand` · `sku` · `price` · `mrp` (struck through) · `uom` · `imageUrl` · `availability` `'available'|'limited'|'out-of-stock'` · `isNew` · `onAddToCart` · `onClick`
- Price: JetBrains Mono `--yk-ink`, ₹ tight (proportional sub-element). Card lifts on hover. Add-to-cart = **charcoal** (cards appear in grids — copper would break the ≤1-per-screen rule). Copper is reserved for the cart's single "Place order".

### Tabs
`items` `[{id,label,count?,disabled?}]` · `activeId` · `size` `'sm'|'md'` · `onChange(id)` — copper underline + weight on active.

### EmptyState
`kind` `'orders'|'catalog'|'buyers'|'search'|'generic'` (structural keystone illustrations) · `title` · `body` · `action` · `illustration` (override). No coins/ledgers.

### YuktiMark
Voussoir keystone — `variant` copper / ink / white / twoTone. Wordmark uses Baloo 2.

---

## Icons — stroke-weight system (R11 §9)

Library: **Lucide** (24×24 viewBox). Default `strokeWidth = 2.0`. Context overrides — R11.1 **reduced the nav/tab strokes** (2.25/2.0 read clumsy at 17–23px on the warm ground):

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

Active nav indicator = **copper left border**, not a filled icon.

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

- **Prices:** JetBrains Mono · `tabular-nums` · `--yk-ink` · `₹` prefix tight (1px, no whitespace node). Never copper.
- **Quantities:** JetBrains Mono, right-aligned in tables.
- **Dates:** `DD MMM YYYY`, Mukta regular, `--yk-sub`.
- **Lakh/crore:** `₹4.2L` in summary/marketing; full precision (`₹4,20,000`) in data tables.
- **IDs / SKUs / order numbers:** JetBrains Mono.

---

## Interaction patterns

- **Hover & press (everything responds):** every interactive element shifts on hover — buttons swap to a `hoverBackground`, secondary/cards/rows take a sub-5% warm tint (`--yk-hover-tint`) or lift (`--yk-lift`), nav items take an 8% tint. On press, elements give a `scale(0.97)` "haptic" nudge (`--yk-press-scale`). Inputs/Select/DatePicker take a copper focus ring. Felt, not seen — nothing flashes a saturated colour.
- **Optimistic UI:** mutations apply to the cache immediately (React Query `onMutate`), roll back on error. Show the new state instantly; never block the UI on the round-trip. Confirm silently; surface only failures.
- **Loading:** skeleton screens for list/table pages (hairline `#EAE3D9` blocks on `#FCFBF8`), never a blank transition. Spinners only for in-button/inline waits. Stat values render skeleton bars until data lands.
- **Error states:** inline field errors (Input `error` prop, red ring + message); API failures as a dismissible `Alert variant="error"` banner at the top of the affected region; post-error empties use EmptyState with a retry action.
- **Empty states:** one per section (orders / catalog / buyers / search / generic), structural keystone illustration, a single primary CTA to resolve.

## Navigation patterns

- **Cockpit:** sidebar-first. Active item = copper left border + slightly darker/600 text + ~8% warm-tint background (never a solid dark block). Hover = ~5% warm tint. Breadcrumb appears on detail pages (`Brands / Amul / Products`).
- **Buyer PWA:** 4 primary tabs only — **Home · Catalog · Orders · Profile**. Cart/Checkout/Product detail are deep screens (no tab bar; back button in header). Active tab = copper top-border (2px) + heavier text, not a solid fill. Sticky frosted header on scroll.

---

## Screen inventory (implementation spec)

### Seller cockpit — 10 sections
| Section | Contents |
|---|---|
| Dashboard | 6-KPI row, low-stock alert banner, recent orders table, top buyers, activity feed *(built: `templates/seller-cockpit`)* |
| Brands | brand cards (logo, product count, active toggle), search + filter, empty state |
| Products | filterable table (SKU/brand/price/stock/status), bulk select, CSV import, empty state |
| Customers | buyer table, cohort badge + credit-limit columns, search, add-buyer CTA |
| Cohorts | cohort cards (name, member count, rule preview), builder preview, empty state |
| Price Lists | table with active/scheduled/expired StatusChips, assign CTA, empty state |
| Catalogs | published/draft cards, share link, buyer count, **publish CTA = accent (copper)**, empty state |
| Orders | order table, status filter chips, expandable row |
| Exports | export-type list (Tally Item Master, Sales Voucher, Ledger Master, Zoho), date range, download CTA |
| Settings | 7 tabs — General, Team, Billing, Integrations, Locations, Features, Notifications |

**Composers (slide-over primary, inline form on mobile):** Add/Edit Brand · Add/Edit Product (details→pricing→images→publish) · Add/Edit Buyer (GSTIN, credit, address, cohort) · Create Cohort (rule builder→preview count) · Create Price List (products→prices→validity) · Publish Catalog (price list→buyers/cohorts→preview→**publish = copper accent** + share token) · Order status update (confirm dialog) · Add Team Member · Zoho connect (disconnected/connecting/connected/error).

**Detail pages (header identity + status + actions, then tabs):** Brand (Overview/Products/Settings) · Product (Overview/Pricing/Media) · Buyer (Overview/Orders/Price Lists/Activity) · Order (Items/Fulfilment/Notes/Invoice).

### Buyer PWA — 10 screens *(catalog browse built: `templates/buyer-app`)*
OTP login · Home · Catalog · Product detail · Cart *(**Place order = copper accent**)* · Checkout *(confirm = charcoal)* · Order placed · Orders list (Orders/Enquiries/Invoices sub-tabs) · Order detail · Profile.

---

## Accessibility (WCAG 2.1 AA)

- **Confirmed text/background pairs:** ink/paper 15.4:1 (AAA) · sub/paper 6.4:1 · faint/paper 5.3:1 · on-dark/surface 12.6:1 · all status colours ≥4.5:1 on their tint.
- **Copper `#B5642F`** passes AA only at ≥18px/bold — use for fills + the `#6a3d18` copper-ink for small text, never copper for body or prices.
- **Focus ring:** `outline: 2px solid #B5642F` on `:focus-visible`, 2px offset.
- **Touch targets:** ≥44px on the buyer PWA.
- **Status:** never colour alone — shape glyph + label is the AA-safe pattern.
- Toggle is a `role="switch"` with `aria-checked`; Alert is `role="alert"`.

## RTL readiness (Gulf markets)

Root `dir="ltr"`; set `dir="rtl"` to mirror. Components needing mirroring: **sidebar** (border + active-border flip to right), **Tabs** underline order, **Button/ProductCard** icon side, **breadcrumb** chevrons, **tab bar** order. Numbers/prices stay LTR inside RTL flow. Mono and tabular-nums are direction-agnostic.

## Dark mode

Light is canonical. In dark mode only these change: page `--yk-paper`→`--yk-surface`; **sidebar background `#2B2825`** (the charcoal surface, used *only* here); cards `#2B2825` with `rgba(255,255,255,.08)` borders; text → `--yk-on-dark`; copper → `--yk-copper-lt #D9894C`; active nav = `rgba(181,100,47,.18)` bg + `#D9894C` text. Shadows, radii, spacing, type are mode-independent.

## Tailwind config mapping

```js
// tailwind.config.ts — map --yk-* tokens
theme: { extend: {
  colors: {
    ink:'#221E1A', surface:'#2B2825', copper:'#B5642F', 'copper-lt':'#D9894C',
    paper:'#F8F6F2', card:'#FCFBF8', line:'#EAE3D9', sub:'#64594E', faint:'#6F665C',
    success:'#1F6B3A', warning:'#8A5700', error:'#9C3026', info:'#2A5F8A',
  },
  fontFamily: { ui:['Mukta','sans-serif'], wordmark:['"Baloo 2"','sans-serif'], mono:['"JetBrains Mono"','monospace'] },
  borderRadius: { sm:'6px', md:'10px', lg:'14px', xl:'20px' },
  boxShadow: { /* warm ink-tint xs→xl */ },
}}
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
| **Seller Cockpit** | `templates/seller-cockpit/` | R11 cockpit shell — light sidebar (10 nav), charcoal actions, Dashboard |
| **Buyer App** | `templates/buyer-app/` | R11 retailer PWA — catalog browse, **charcoal** add-to-cart (copper reserved to the cart's Place order), 4-tab bar with copper border indicator |

Each template loads the system via its sibling `ds-base.js` (lists the global stylesheets, then `_ds_bundle.js`). In a consuming project, point the `base` line in `ds-base.js` at the bound `_ds/<folder>` tree.

---

## Voice & copy

| Use | Avoid |
|---|---|
| "3 prices need review." | "Leverage AI-powered insights to optimize." |
| "That didn't save. Here's how to fix it." | "An unexpected error occurred." |
| "Let's get your catalog live." | "Welcome to the platform!" |
| "You decide. Yukti makes it pay off." | "Let Yukti run your business for you." |
