# DealFlow — Cockpit Layout & Presentation Backlog (v2)

**Spec version:** DealFlow_Product-Spec_v1 · Layout revision 2026-05-28  
**Extends:** `DealFlow_User-Stories_v1.md` (EP-01 through EP-12 remain unchanged)  
**Story format:** 5-part BDD schema — Objective · Common Layout · Acceptance Criteria · Design System · Verification  
**Design source of truth:**
- Landing pages → `design-system/Brands Landing v3.html` + `design-system/v3/Modules.jsx` + `design-system/v2/Shared.jsx`
- Detail pages → `design-system/Detail Pages v2.html` + `design-system/v2/DetailsV2.jsx`

**Total stories:** 28 across 5 epics (3 stories deprecated; superseded stories retained for reference)

---

## Story ID Convention

```
EP-{EPIC_NUM}-{STORY_NUM}
```

Stories EP-13-001 and EP-14-001 are **foundation stories** — they define all shared, reusable shell components. All subsequent page stories in the same epic depend on (and must not re-implement) those foundations.

---

## Epic Index

| Epic | Module | Feature Flag | Stories |
|------|--------|-------------|---------|
| EP-13 | Cockpit Landing Pages (v3 layout) | `df_brand_product_master` · `df_customer_master` · `df_cohorts` · `df_catalog_publishing` · `df_order_management` · `df_pricing_engine` | 9 |
| EP-14 | Cockpit Detail Pages (v2 layout) | same as above, per entity | 9 |
| EP-15 | Estimates | `df_order_management` · `df_estimates` | 2 |
| EP-16 | Invoices | `df_order_management` · `df_invoices` | 2 |
| EP-17 | Document Composers (Create & Edit) + Detail Views | `df_order_management` · `df_estimates` · `df_sales_orders` · `df_invoices` | 6 (3 composer · 3 detail) |

---

---

# EPIC 13 — Cockpit Landing Pages (v3 Layout)

> **Design reference:** `design-system/Brands Landing v3.html`  
> **Layout pattern:** 1440 px-capped container → `PageHeader` → `InsightStrip4` → `V3CalloutPanel` ("Today's read") → `FilterBar` → body (table **or** grid, fixed per module)  
> **Toggle:** list/grid toggle is **removed** — each module has a single fixed body.

---

### EP-13-001 — Shared Landing Page Shell & Reusable Components

#### 1. Objective & User Value

- **As a** developer building any cockpit landing page, **I want** a set of shared, typed React components that enforce the v3 layout, **so that** all six landing pages (Brands · Products · Customers · Orders · Cohorts · Catalogs) are pixel-consistent and maintain the 1440 px width cap without per-page duplication.

#### 2. Common Layout

This story **defines** the layout shell that every other EP-13 story **consumes**. The hierarchy is:

```
SellerShell (existing sidebar nav — do not modify)
  └── PageWrap                        ← max-w-[1440px] mx-auto w-full px-8 py-6
        ├── PageHeader                ← eyebrow · h1 · subtitle · right CTAs
        ├── InsightStrip4             ← exactly 4 KPI tiles
        ├── V3CalloutPanel            ← "Today's read" — always 3 callout cards
        ├── FilterBar                 ← search · filter chips · count · sort
        └── {body}                    ← table (list modules) OR tile grid (visual modules)
```

The **1440 px cap** is set once, on `PageWrap`. No child component may override it with a wider `max-w-*` or `w-full` that escapes the cap.

#### 3. Acceptance Criteria (Functional Boundaries)

- `PageWrap` renders a `<div>` with `max-w-[1440px] mx-auto w-full px-8 py-6`. Any page wrapped in it is automatically center-aligned on viewports wider than 1440 px.
- `PageHeader` accepts props: `eyebrow`, `title`, `subtitle`, `horizon` (period picker label), `secondary` (`{ label, icon }`), `primary` (string label). Renders a horizontal bar: text block on the left, actions on the right.
- `InsightStrip4` accepts exactly 4 tile objects. Tile shape: `{ label, value, sub?, delta?, deltaTone?: 'up'|'down', tone?: 'accent'|'warn' }`. Throws a console warning if the array length ≠ 4.
- `V3CalloutPanel` accepts an array of exactly 3 callout items. Item shape: `{ kind: 'risk'|'info'|'opportunity', eyebrow, hint, rows: [{ initials, hue, name, reason, trailing }] }`. Header shows "Today's read" eyebrow and a staleness hint.
- `FilterBar` accepts: `count` (formatted string), `searchPlaceholder`, `chips` (string array), `activeChip`, `sortBy`, `hideViewToggle` (boolean — always `true` in v3).
- `StatusTag` renders a pill span with class determined by `tone`: `success` (teal), `warning` (amber), `danger` (red), `neutral` (cream).
- `GrowthPill` renders `↑ +N%` (green), `↓ N%` (red), or `· flat` (cream) based on a numeric `value` prop.
- `EntityAvatar` renders a square with rounded corners, initials text, and background color derived from the `hue` prop (`'teal'|'ember'|'cream'`). Accepts `size` (number, default 38).
- All components are exported from `src/components/seller/layout/index.ts` as named exports.
- All props are typed with TypeScript interfaces; no `any`.

#### 4. Design System & UI/UX Constraints

**File locations:**

| Component | File |
|-----------|------|
| `PageWrap` | `src/components/seller/layout/PageWrap.tsx` |
| `PageHeader` | `src/components/seller/layout/PageHeader.tsx` |
| `InsightStrip4` | `src/components/seller/layout/InsightStrip4.tsx` |
| `V3CalloutPanel` | `src/components/seller/layout/V3CalloutPanel.tsx` |
| `FilterBar` | `src/components/seller/layout/FilterBar.tsx` |
| `StatusTag` | `src/components/seller/layout/StatusTag.tsx` |
| `GrowthPill` | `src/components/seller/layout/GrowthPill.tsx` |
| `EntityAvatar` | `src/components/seller/layout/EntityAvatar.tsx` |
| Barrel export | `src/components/seller/layout/index.ts` |

**PageHeader — token spec:**

- Eyebrow: `text-[11px] font-semibold tracking-[0.14em] uppercase text-cream-700`
- Title h1: `font-display text-[28px] font-semibold text-cream-950`
- Subtitle: `text-[13px] text-cream-700 leading-[1.55] mt-1 max-w-[560px]`
- Horizon picker button: secondary ghost style, `text-[12px]`, displays "Showing / {period} / ▾"
- Secondary CTA: `cockpit-btn cockpit-btn-secondary` — Lucide icon (16 px, left) + label
- Primary CTA: `cockpit-btn cockpit-btn-primary` — `<Plus/>` icon (13 px, left) + label, `bg-teal-500 text-cream-50`

**InsightStrip4 — token spec:**

- Strip container: 4-column CSS grid, `gap-3`, `mt-5`, `mb-0`
- Tile: `bg-cream-50 border border-cream-200 rounded-[12px] px-5 py-4`
- Accent tile (`.is-accent`): `bg-teal-50 border-teal-200`
- Warn tile (`.is-warn`): `bg-amber-50 border-amber-200`
- Tile label: eyebrow sm class (`text-[10px] font-semibold tracking-[0.12em] uppercase text-cream-600`)
- Tile value: `text-[24px] font-semibold font-display text-cream-950 mt-1`
- Tile sub: `text-[11px] text-cream-600 mt-1` · delta `up` = `text-teal-700`, `down` = `text-danger-600`

**V3CalloutPanel — token spec:**

- Section header: eyebrow "Today's read" + hint text right-aligned, `text-[11px] text-cream-500`
- Three callout cards: horizontal flex, `gap-4`, equal width
- Card base: `bg-cream-50 border border-cream-200 rounded-[12px] px-4 py-4`
- `is-risk` card: `border-danger-200 bg-danger-50`; colored dot `bg-danger-500`
- `is-info` card: `border-teal-200 bg-teal-50`; colored dot `bg-teal-500`
- `is-opportunity` card: `border-ember-200 bg-ember-50`; colored dot `bg-ember-500`
- Card eyebrow: `text-[11px] font-semibold uppercase tracking-[0.1em]`
- Card hint: `font-mono text-[10px] text-cream-500`
- Each row within a card: `EntityAvatar` (32 px) + name (`text-[13px] font-medium`) + reason (`text-[11px] text-cream-600`) + trailing value right-aligned (`font-mono text-[12px]`)
- Empty state per card: `text-[11px] text-cream-500 italic` — "None right now. Within thresholds."

**FilterBar — token spec:**

- Bar: horizontal flex, `gap-3`, `mt-5 mb-2`, `items-center`
- Search input: `bg-cream-100 border border-cream-200 rounded-[8px] h-8 px-3 pl-8 text-[12.5px]`; magnifier icon `text-cream-500` left-inset
- Filter chips: horizontal scroll flex row, `gap-2`; chip: `rounded-full px-3 py-1 text-[11.5px] border border-cream-200 bg-cream-50`; active chip: `bg-cream-900 text-cream-50 border-cream-900`
- Count: `text-[11.5px] text-cream-600 ml-auto`
- Sort button: `text-[12px]`, displays "Sort / {sortBy} / ▾"
- View toggle: hidden (`hideViewToggle = true`) for all v3 landing pages

**StatusTag — tone classes:**

| `tone` | Classes |
|--------|---------|
| `success` | `bg-teal-100 text-teal-700` |
| `warning` | `bg-amber-100 text-amber-700` |
| `danger` | `bg-danger-100 text-danger-700` |
| `neutral` | `bg-cream-200 text-cream-700` |

**Table base styles (list-body modules):**

- Wrapper `div.v2-body`: `mt-2 rounded-[12px] border border-cream-200 overflow-hidden`
- `table.v2-table`: `w-full border-collapse text-[13px]`
- `thead tr`: `bg-cream-100 border-b border-cream-200`
- `th`: `px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-cream-600`
- `th.num`: `text-right`
- `tbody tr`: alternating `bg-cream-50` / `bg-white`; `hover:bg-teal-50 cursor-pointer`
- `td`: `px-4 py-3 text-[13px] text-cream-900`
- `td.chev`: `text-[16px] text-cream-400 text-right pr-3`
- `.num-display`: `font-mono font-semibold text-cream-950`
- `.ent` wrapper: `flex items-center gap-3`; `.ent-name`: `font-medium`; `.ent-sub`: `text-[11px] text-cream-500 mt-0.5 uppercase tracking-[0.05em]`

**Grid base styles (visual-body modules — Cohorts & Catalogs):**

- `div.v2-grid-body`: `mt-2 grid grid-cols-2 gap-4` (2-column on desktop)

#### 5. Automated Verification Steps

```bash
npx tsc --noEmit                              # Zero type errors
npm run lint                                   # Zero ESLint warnings on new files
npm run test:unit -- --testPathPattern=seller/layout
# Unit tests must cover:
# - InsightStrip4 warns on tile count ≠ 4
# - StatusTag renders correct class per tone
# - GrowthPill renders ↑/↓/flat branch correctly
# - PageWrap has max-w-[1440px] and mx-auto in rendered output
```

---

### EP-13-002 — Brands Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to see all my brand principals on a single page with portfolio KPIs, an attention digest, and a sortable table, **so that** I can immediately spot which brands need action and which are performing.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Portfolio" · title="Brands"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     7 columns — see §4
```

Route: `app/(seller)/brands/page.tsx`  
Feature flag gate: `df_brand_product_master`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page is gated behind `df_brand_product_master`; if disabled, renders the standard flag-off empty state.
- KPI tiles are computed from the tenant's `app.tenant_brands` joined with `app.orders` for the current month. "This month" is defined by the `horizon` picker (default: calendar month to date).
- The table renders all brands the tenant carries, sorted by GMV descending by default.
- Clicking a brand row navigates to `/brands/{id}` (Brand detail — EP-14-002).
- "Needs attention" callout group shows brands with at least one active alert (`catalog_stale`, `low_stock_risk`, etc.). Empty state: "None right now. Within thresholds."
- "Top performers" callout shows the top 2 brands by GMV this month.
- "Top risers" callout shows the top 2 brands by MoM growth %.
- Filter chips (`All categories`, `Wines`, `Beer`, `Spirits`, `At risk`) filter the table rows in real time (client-side).
- The sort dropdown controls table row order (options: "GMV (high → low)", "GMV (low → high)", "Growth", "Catalog age").
- "Add a brand" CTA opens the Add Brand drawer/dialog (existing EP-02 story).
- "Invite a principal" CTA opens the Invite Principal dialog.

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Portfolio"` |
| `title` | `"Brands"` |
| `subtitle` | `"Five brand principals. Phani Distribution carries them across 142 buyers in 6 cohorts. This is your portfolio at a glance."` (replace hardcoded counts with live data) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Invite a principal", icon: <UserPlus size={13}/> }` |
| `primary` | `"Add a brand"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Portfolio GMV` | Sum of `gmv` across all tenant brands MTD | `↑ +{growth}% vs last month` | `accent` |
| 2 | `Brands carried` | Count of active `tenant_brands` rows | `{activeBuyers} of {totalBuyers} buyers active` | default |
| 3 | `Need attention` | Count of brands with `alerts.length > 0` | `{n} alerts open` | `warn` |
| 4 | `Catalog freshness` | Count of brands with `daysSinceCatalog ≤ 14` | `published in last 14 days` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Needs attention"` | count of brands with alerts | `EntityAvatar` + brand name + first 2 alert labels joined " · " + `GrowthPill` trailing |
| 2 | `info` | `"Top performers"` | `"by GMV"` | `EntityAvatar` + brand name + `"{share}% of portfolio · {activeBuyers} buyers"` + INR GMV trailing |
| 3 | `opportunity` | `"Top risers"` | `"fastest growth"` | `EntityAvatar` + brand name + `"from {gmvPrior} → {gmv} this month"` + `GrowthPill` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"5 brands"` (live count) |
| `searchPlaceholder` | `"Search brand or category…"` |
| `chips` | `['All categories', 'Wines', 'Beer', 'Spirits', 'At risk']` |
| `activeChip` | `'All categories'` (default) |
| `sortBy` | `"GMV (high → low)"` |
| `hideViewToggle` | `true` |

**Table — 7 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Brand | 320 px | `EntityAvatar` (38 px) + name (`.ent-name`) + sub: `{CATEGORY} · {REGION} · {N} SKUs` (`.ent-sub`) |
| GMV · MTD | — | `.num-display` INR formatted |
| Growth | — | `GrowthPill` |
| Share of portfolio | — | Mini progress bar (width = `share * 2.4%`, ember or cream hue) + `"{share}% of ₹{portfolioGmv}"` |
| Active buyers | — | `"{active}"` + `" / {total}"` (total in `text-cream-600`) — `.num` alignment |
| Catalog | — | `StatusTag` — `success` if `daysSinceCatalog ≤ 14`, else `warning`; label = `"{N}d ago"` |
| › | — | Chevron, `text-cream-400`, right-aligned |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=brands/landing
npm run test:integration -- --testPathPattern=brands-landing-page
# Integration tests must cover:
# - Portfolio GMV tile shows correct sum from Supabase RPC
# - "At risk" filter chip hides brands with alerts.length === 0
# - Clicking a brand row navigates to /brands/{id}
# - Flag off → flag-off empty state rendered, no data fetched
npx tsc --noEmit && npm run lint
```

---

### EP-13-003 — Products Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to scan all SKUs by stock status and revenue, **so that** I can immediately identify out-of-stock and low-stock items to replenish before they affect orders.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Catalog" · title="Products"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     9 columns — see §4
```

Route: `app/(seller)/products/page.tsx`  
Feature flag gate: `df_brand_product_master`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page is gated behind `df_brand_product_master`.
- KPI tiles are computed from `app.tenant_products` joined with `app.tenant_inventory` and `app.order_items`.
- "Out of stock" = `onHand = 0`. "Low stock" = `daysCover < 14` and `onHand > 0`.
- "Needs attention" callout: products where `status.tone === 'danger' || status.tone === 'warning' || growth < 0`, max 3.
- "Top performers" callout: top 2 by `gmv` MTD.
- "Top risers" callout: top 2 by `growth` MoM %.
- Brand filter chips filter the table to products belonging to that brand.
- "Low stock" chip filters to products with `daysCover < 14`.
- Clicking a product row navigates to `/products/{id}` (EP-14-003).
- "Add a product" CTA opens the Add Product dialog.
- "Bulk import" CTA triggers the CSV import flow.

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Catalog"` |
| `title` | `"Products"` |
| `subtitle` | `"357 SKUs across 5 brands. 8 out of stock, 24 running low — those are the ones to chase this week."` (live counts) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Bulk import", icon: <Upload size={13}/> }` |
| `primary` | `"Add a product"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Active SKUs` | `tenant_products` where `deleted_at IS NULL` | `"{total} total · {archived} archived"` | default |
| 2 | `Out of stock` | Count where `onHand = 0` | `"replenish urgently"` | `warn` |
| 3 | `Low stock` | Count where `daysCover < 14` | `"< 14 days of cover"` | default |
| 4 | `Revenue` | Sum of `order_items.total` MTD | `↑ +{growth}% vs last month` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Needs attention"` | count | Brand `EntityAvatar` (32 px) + product name + `"{status.label} · {onHand} on hand · {daysCover}d cover"` + `GrowthPill` trailing |
| 2 | `info` | `"Top performers"` | `"by GMV"` | Brand avatar + product name + `"{units} units · {brand}"` + INR GMV trailing |
| 3 | `opportunity` | `"Top risers"` | `"fastest growth"` | Brand avatar + product name + `"{brand} · {gmv} MTD"` + `GrowthPill` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"Showing {n} of {total}"` |
| `searchPlaceholder` | `"Search product, SKU, brand…"` |
| `chips` | `['All brands', 'Red wine', 'White wine', 'Beer', 'Spirits', 'Low stock']` |
| `activeChip` | `'All brands'` |
| `sortBy` | `"GMV (high → low)"` |
| `hideViewToggle` | `true` |

**Table — 9 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Product | 340 px | Bottle icon thumbnail (38×38 px, gradient `#EAF1EE → #C6DAD3`) + name + sub: `{SKU} · {category}` |
| Brand | — | `EntityAvatar` (22 px) + brand name (`text-[12.5px]`) |
| On hand | — | Unit count, `.num` |
| Days cover | — | `.num` · `0d` = `text-danger-700 font-semibold font-mono`; `< 7d` = `text-warning-700 font-semibold font-mono`; else normal |
| Units · MTD | — | Unit count, `.num` |
| Revenue | — | `.num-display` INR |
| Growth | — | `GrowthPill` |
| Status | — | `StatusTag` |
| › | — | Chevron |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=products/landing
npm run test:integration -- --testPathPattern=products-landing-page
# - Out of stock count matches tenant_inventory where onHand = 0
# - Days cover coloring: 0d = danger class, 5d = warning class, 20d = normal
# - Low stock chip filters correctly
# - Product row click → /products/{id}
npx tsc --noEmit && npm run lint
```

---

### EP-13-004 — Customers Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** a consolidated view of all retailer-buyers with spend, credit, and activity signals, **so that** I can prioritize outreach, track dues, and identify growth opportunities without opening individual records.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Buyers" · title="Customers"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     9 columns — see §4
```

Route: `app/(seller)/customers/page.tsx`  
Feature flag gate: `df_customer_master`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_customer_master`.
- KPI tiles from `app.buyers` joined with `app.orders` and `app.buyer_credit`.
- "Dormant > 30d" = buyers with no orders in the last 30 calendar days.
- "Outstanding dues" = sum of unpaid invoice balances across all buyers.
- "Needs a call" callout: buyers with `status.tone === 'warning' || status.tone === 'danger' || growth < 0 || dues > 80000`, max 3.
- "Top spenders" callout: top 2 buyers by `spend` MTD.
- "Top risers" callout: top 2 buyers with `growth > 0`, sorted descending.
- Filter chips work client-side. "Has dues" chip filters to buyers with `dues > 0`.
- Clicking a buyer row navigates to `/customers/{id}` (EP-14-004).
- "Add a customer" and "Invite buyer" CTAs open their respective dialogs.

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Buyers"` |
| `title` | `"Customers"` |
| `subtitle` | `"142 retailers across 6 cohorts. 89 active this month. The Tier-A names buy 70% of revenue — that's where dues sit too."` (live counts) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Invite buyer", icon: <Send size={13}/> }` |
| `primary` | `"Add a customer"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Active buyers` | `"{active}/{total}"` where active = ordered this month | `"{pct}% of base ordered"` | default |
| 2 | `Spend · MTD` | Sum of `orders.total` MTD | `↑ +{growth}% vs last month` | `accent` |
| 3 | `Dormant > 30d` | Count buyers with no order in 30 days | `"haven't ordered in a month"` | `warn` |
| 4 | `Outstanding dues` | Sum of unpaid balances | `"across {n} buyers"` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Needs a call"` | count | `EntityAvatar` + buyer name + if `dues > 0`: `"Last order {date} · {dues} dues"`, else `"Last order {date} · spend {growth}% MoM"` + `GrowthPill` trailing |
| 2 | `info` | `"Top spenders"` | `"by GMV"` | `EntityAvatar` + buyer name + `"{orders} orders · {city}"` + INR spend trailing |
| 3 | `opportunity` | `"Top risers"` | `"fastest growth"` | `EntityAvatar` + buyer name + `"{city} · {spend} this month"` + `GrowthPill` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"Showing {n} of {total}"` |
| `searchPlaceholder` | `"Search buyer, city, GSTIN…"` |
| `chips` | `['All tiers', 'Tier A', 'Tier B', 'Dormant', 'Has dues']` |
| `activeChip` | `'All tiers'` |
| `sortBy` | `"Spend (high → low)"` |
| `hideViewToggle` | `true` |

**Table — 9 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Buyer | 320 px | `EntityAvatar` (38 px) + name + Tier badge (`bg-ember-50 text-ember-700 text-[10px] font-mono font-semibold px-1.5 rounded`) + city (`.ent-sub`) |
| Cohort | — | Cohort name, `text-[12.5px] text-cream-800` |
| Spend · MTD | — | `.num-display` INR |
| Growth | — | `GrowthPill` |
| Orders | — | Count, `.num` |
| Last order | — | Date string, `font-mono text-[12px]` |
| Credit | — | Mini progress bar (`bg-teal-500` if `used/limit < 0.75`, else `bg-warning-500`) + `"{used} / {limit}"` label below |
| Status | — | `StatusTag` |
| › | — | Chevron |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=customers/landing
npm run test:integration -- --testPathPattern=customers-landing-page
# - Active buyer count matches orders with placed_at in current month
# - Dormant count: buyers with no orders for 30 days
# - Credit bar: >75% usage → warning color
# - "Has dues" filter hides zero-dues buyers
# - Row click → /customers/{id}
npx tsc --noEmit && npm run lint
```

---

### EP-13-005 — Sales Orders Landing Page

> **Updated:** Renamed from "Orders" to "Sales Orders". Route moved to `/sales-orders`. Status `received` now displays as "Received" (neutral), not "On Hold" (danger). `invoiced` and `partially_invoiced` statuses added. Gated by both `df_order_management` (umbrella) and `df_sales_orders` (sub-flag).

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** a live sales order workboard showing every open order with status, GMV, and dispatch urgency, **so that** I can confirm incoming orders, process dispatches, and track what's been invoiced — all without switching tools.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Transactions" · title="Sales Orders"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     8 columns — see §4
```

Route: `app/(seller)/sales-orders/page.tsx`  
Redirect: `301 /orders → /sales-orders` (add in `next.config.js` redirects)  
Feature flag gate: `df_order_management` (umbrella) AND `df_sales_orders` (sub-flag); if either is off, render flag-off empty state.

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_order_management` + `df_sales_orders`.
- KPIs from `app.orders` for the current month.
- `status = 'received'` displays as **"Received"** with tone `neutral` — not "On Hold". No `draft` status exists on sales orders (migration moved any `draft` rows to `received`).
- `status = 'invoiced'` displays as **"Invoiced"** with tone `success`. `status = 'partially_invoiced'` displays as **"Partly invoiced"** with tone `warning`.
- "Pending dispatch" = orders with `status = 'confirmed'`.
- "Needs action" callout: orders with `status = 'received'` (unconfirmed), max 3.
- "Biggest tickets" callout: top 2 orders by GMV this month.
- "In motion" callout: orders with `status IN ('dispatched', 'partially_dispatched')`, max 2.
- Status filter chips work client-side.
- Default sort: "Recent first" (`placed_at` desc).
- Clicking a row navigates to `/sales-orders/{id}`.
- "Record a sales order" CTA opens the new sales order dialog.
- "Sync to Tally" CTA triggers the Tally CSV export flow (EP-09).

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Transactions"` |
| `title` | `"Sales Orders"` |
| `subtitle` | `"{n} sales orders this month from {m} buyers. {p} pending dispatch, {q} received and awaiting confirmation."` (live counts) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Sync to Tally", icon: <RefreshCw size={13}/> }` |
| `primary` | `"Record a sales order"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Sales Orders · MTD` | Count of `app.orders` this month | `↑ +{growth}% vs last month` | default |
| 2 | `GMV` | Sum of `orders.total_amount` MTD | `"AOV {inrShort(aov)}"` | `accent` |
| 3 | `Pending dispatch` | Count where `status = 'confirmed'` | `"awaiting dispatch"` | `warn` |
| 4 | `Received` | Count where `status = 'received'` | `"awaiting seller confirmation"` | default |

**Status → `StatusTag` tone mapping:**

| DB status | Display label | Tone | Filter chip |
|-----------|--------------|------|-------------|
| `received` | Received | `neutral` | Received |
| `confirmed` | Confirmed | `warning` | Confirmed |
| `partially_dispatched` | Partly dispatched | `warning` | In transit |
| `dispatched` | In transit | `neutral` | In transit |
| `delivered` | Delivered | `success` | Delivered |
| `invoiced` | Invoiced | `success` | Invoiced |
| `partially_invoiced` | Partly invoiced | `warning` | Invoiced |
| `cancelled` | Cancelled | `neutral` | Cancelled |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Needs action"` | count of `received` orders | Buyer `EntityAvatar` (32 px) + buyer name + `"{orderId} · Received · {deliveryCity}"` + `StatusTag` trailing |
| 2 | `info` | `"Biggest tickets"` | `"this month"` | Buyer avatar + buyer name + `"{orderId} · {items} items · {city}"` + INR GMV trailing |
| 3 | `opportunity` | `"In motion"` | `"dispatching now"` | Buyer avatar + buyer name + `"{orderId} · {city} · {inrShort(gmv)}"` + `StatusTag` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"Showing {n} of {total}"` |
| `searchPlaceholder` | `"Search order ID, buyer, city…"` |
| `chips` | `['All', 'Received', 'Confirmed', 'In transit', 'Invoiced', 'Delivered', 'Cancelled']` |
| `activeChip` | `'All'` |
| `sortBy` | `"Recent first"` |
| `hideViewToggle` | `true` |

**Table — 8 columns:**

| Column | Content |
|--------|---------|
| Order | Order number, `font-mono text-[12px] text-cream-800` |
| Buyer | `EntityAvatar` (30 px) + buyer name (`text-[13px] font-medium`) |
| Delivery | Delivery city, `text-[12.5px]` |
| Items | Count, `.num` |
| GMV | `.num-display` INR, `.num` |
| Status | `StatusTag` |
| Placed | Date, `font-mono text-[12px] text-cream-700` |
| › | Chevron |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=sales-orders/landing
npm run test:integration -- --testPathPattern=sales-orders-landing-page
# - status 'received' renders label "Received" with neutral tone (NOT "On Hold" / danger)
# - status 'invoiced' renders label "Invoiced" with success tone
# - Pending dispatch tile = orders with status 'confirmed'
# - Received tile = orders with status 'received'
# - "Received" filter chip hides all non-received orders
# - Row click → /sales-orders/{id}
# - 301 redirect: GET /orders → /sales-orders (verify in next.config.js)
# - Flag: df_sales_orders OFF → flag-off empty state; df_order_management OFF → same
npx tsc --noEmit && npm run lint
```

---

### EP-13-006 — Cohorts Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin`, **I want** a visual overview of all buyer cohorts with conversion rates and GMV, **so that** I can assess which segments are underperforming and need a new catalog or pricing adjustment.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Segmentation" · title="Cohorts"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── div.v2-grid-body   2-column cohort tile grid — see §4
```

Route: `app/(seller)/cohorts/page.tsx`  
Feature flag gate: `df_cohorts`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_cohorts`.
- KPIs from `app.cohorts` joined with `app.orders` and `app.buyers`.
- "Uncategorised" = buyers in `app.buyers` with no row in `app.cohort_members`.
- "Avg conversion" = (orders placed from catalogs / unique catalog views) × 100, averaged across cohorts.
- "Low conversion" callout: bottom 2 cohorts by conversion rate.
- "Top performers" callout: top 2 cohorts by GMV MTD.
- "Top risers" callout: top 2 cohorts by MoM growth %.
- Filter chips: `['All', 'Geo-based', 'Tier-based', 'Brand affinity']` — filter by `cohort.type`.
- Clicking a cohort tile navigates to `/cohorts/{id}` (EP-14-005).
- "New cohort" CTA opens the cohort builder.
- "Publish catalog" CTA opens the catalog publish flow.

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Segmentation"` |
| `title` | `"Cohorts"` |
| `subtitle` | `"Four buyer groups defined by geo, tier, and brand affinity. Each one gets its own catalogs and price list."` (live count) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Publish catalog", icon: <Grid size={13}/> }` |
| `primary` | `"New cohort"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Cohorts` | Count of active cohorts | `"covering {members} of {totalBuyers} buyers"` | default |
| 2 | `Combined GMV` | Sum of GMV across all cohorts MTD | `↑ +{growth}% vs last month` | `accent` |
| 3 | `Avg conversion` | Average conversion rate across cohorts | `"catalog → order"` | default |
| 4 | `Uncategorised` | Count of buyers not in any cohort | `"not in any cohort"` | `warn` |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Low conversion"` | count | Initials avatar (derived from cohort name) + cohort name + `"{conversion}% conversion · {active} of {members} active"` + conversion % trailing |
| 2 | `info` | `"Top performers"` | `"by GMV"` | Initials avatar + cohort name + `"{members} buyers · AOV {aov}"` + INR GMV trailing |
| 3 | `opportunity` | `"Top risers"` | `"fastest growth"` | Initials avatar + cohort name + `"{catalogs} catalogs live · {active} active"` + `GrowthPill` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"4 cohorts"` (live count) |
| `searchPlaceholder` | `"Search cohort or rule…"` |
| `chips` | `['All', 'Geo-based', 'Tier-based', 'Brand affinity']` |
| `activeChip` | `'All'` |
| `sortBy` | `"GMV (high → low)"` |
| `hideViewToggle` | `true` |

**Grid body — Cohort tile (`v2-coh-tile`):**

```
article.v2-coh-tile  (bg-cream-50 border border-cream-200 rounded-[14px] p-5 cursor-pointer hover:border-teal-300)
  ├── header row        cohort name (h3, font-semibold text-[15px]) · StatusTag (right)
  ├── description       text-[12.5px] text-cream-700 mt-2
  ├── focus chips       "FOCUS:" label (font-mono text-[11px] text-cream-500) + brand name chips
  └── stats grid        4-column grid (gap-3 mt-4):
                          GMV · MTD | Growth | Members ({active}/{total}) | Conversion%
                        Each stat: label (text-[10px] uppercase text-cream-500) + value (text-[17px] font-semibold)
                        Growth value: green if ≥ 10%, else cream-900
```

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=cohorts/landing
npm run test:integration -- --testPathPattern=cohorts-landing-page
# - Uncategorised count = buyers with no cohort_members row
# - Cohort tile click → /cohorts/{id}
# - Avg conversion renders as "X%" with one decimal place
npx tsc --noEmit && npm run lint
```

---

### EP-13-007 — Catalogs Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to see all published catalogs with their funnel metrics (views → orders → GMV), **so that** I can identify which catalogs to extend, archive, or create next.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Distribution" · title="Catalogs"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── div.v2-grid-body   2-column catalog tile grid — see §4
```

Route: `app/(seller)/catalogs/page.tsx`  
Feature flag gate: `df_catalog_publishing`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_catalog_publishing`.
- KPIs from `app.published_catalogs` joined with `app.orders`.
- "Live catalogs" = `status = 'live'`; "Draft" = `status = 'draft'`; "Ended" = `status = 'ended'`.
- "Avg conversion" = (orders / unique catalog views) averaged across live catalogs.
- "Orders attributed" = orders linked to a catalog share token this month.
- "Needs attention" callout: `status = 'Draft'` OR `status = 'Ended'` OR `daysLeft ≤ 5 && daysLeft > 0`, max 3.
- "Top performers" callout: top 2 live catalogs by GMV.
- "Top risers" callout: top 2 catalogs by `growth` (vs previous catalog to same cohort).
- Filter chips: `['All', 'Live', 'Draft', 'Ended']`.
- Clicking a catalog tile navigates to `/catalogs/{id}` (EP-14-006).
- "Publish a catalog" and "New from template" CTAs open the publish flow.

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Distribution"` |
| `title` | `"Catalogs"` |
| `subtitle` | `"The mailers your retailers see in the buyer app. Each one targets a cohort, runs for a validity window, and rolls up to one funnel."` |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "New from template", icon: <LayoutGrid size={13}/> }` |
| `primary` | `"Publish a catalog"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Live catalogs` | Count where `status = 'live'` | `"{draft} in draft, {ended} ended"` | default |
| 2 | `GMV from catalogs` | Sum of orders.total linked to catalogs MTD | `↑ +{growth}% vs last month` | `accent` |
| 3 | `Avg conversion` | Avg (orders/views) across live catalogs | `"opens → orders"` | default |
| 4 | `Orders attributed` | Count of catalog-attributed orders this month | `"this month"` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Needs attention"` | count | Initials avatar + catalog name + if `Draft`: `"Draft · not yet shipped to cohort"`; if `Ended`: `"Ended {validUntil} · {orders} orders"`; if expiring: `"Expires in {daysLeft}d · {orders} orders"` + `StatusTag` trailing |
| 2 | `info` | `"Top performers"` | `"by GMV"` | Initials avatar + catalog name + `"{cohort} · {orders} orders · {conversion}% conv."` + INR GMV trailing |
| 3 | `opportunity` | `"Top risers"` | `"fastest growth"` | Initials avatar + catalog name + `"{cohort} · expires in {daysLeft}d"` + `GrowthPill` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"{n} catalogs"` (live count) |
| `searchPlaceholder` | `"Search catalog or cohort…"` |
| `chips` | `['All', 'Live', 'Draft', 'Ended']` |
| `activeChip` | `'All'` |
| `sortBy` | `"Recently published"` |
| `hideViewToggle` | `true` |

**Grid body — Catalog tile (`v2-cat-tile`):**

```
article.v2-cat-tile  (bg-cream-50 border border-cream-200 rounded-[14px] overflow-hidden cursor-pointer hover:border-teal-300)
  ├── hero band (.v2-cat-hero, h-{hue})
  │     background = hue-derived gradient
  │     ├── name (h3, font-semibold text-[15px] text-white)
  │     ├── sub  "{products} products · {brands} brands" (text-[11px] text-white/70)
  │     └── status badge (top-right absolute)
  │           Draft = bg-amber-100 text-amber-700
  │           Ended = bg-cream-200 text-cream-700
  │           Live  = no extra class
  └── body (.v2-cat-body, p-4)
        Row: Cohort → {cohortName}
        Row: GMV → {gmv > 0 ? inrShort : "—"}
        Row: Orders → {orders > 0 ? "{orders} ({conversion}%)" : "—"}
        Row (dashed top border): Days left / Ended / Validity → "{daysLeft}d · until {validUntil}" or "{validUntil}"
        Each row: label text-[11px] text-cream-500 · value text-[12.5px] text-cream-900 font-medium right-aligned
```

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=catalogs/landing
npm run test:integration -- --testPathPattern=catalogs-landing-page
# - Live count matches status = 'live' in DB
# - Draft catalog tile shows amber status badge
# - Expiring soon (daysLeft ≤ 5) appears in attention callout
# - Catalog tile click → /catalogs/{id}
npx tsc --noEmit && npm run lint
```

---

### EP-13-008 — Price Lists Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin`, **I want** to see all price lists in one place with their cohort coverage, validity windows, and expiry status, **so that** I can immediately spot which lists are about to lapse or which cohorts have no active pricing and act before buyers start hitting base prices.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Pricing" · title="Price Lists"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     7 columns — see §4
```

Route: `app/(seller)/price-lists/page.tsx`  
Feature flag gate: `df_pricing_engine`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_pricing_engine`; if disabled, renders the standard flag-off empty state.
- KPIs from `app.price_lists` joined with `app.price_list_items` and `app.price_list_assignments`.
- "Active" = `status = 'active'` AND `valid_until >= now()`.
- "Expiring soon" = active lists with `valid_until` within 7 days.
- "Cohorts covered" = distinct cohorts with at least one active price list assigned via `price_list_assignments`.
- "Products with overrides" = count of `price_list_items` where the list price differs from the product's `base_selling_price`.
- "Expiring soon" callout: active lists with `valid_until ≤ now() + 7 days`, max 3.
- "Most coverage" callout: top 2 lists by product count (`price_list_items` rows).
- "Uncovered cohorts" callout: cohorts with no active `price_list_assignments` row, max 3 — renders as a risk that buyers in those cohorts fall back to `base_selling_price`.
- Filter chips (`All`, `Active`, `Draft`, `Expired`) filter table rows client-side by `status`.
- Clicking a price list row navigates to `/price-lists/{id}` (EP-14-007).
- "New price list" CTA opens the price list creation dialog.
- "Clone list" secondary CTA opens a clone-from-existing dialog.

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Pricing"` |
| `title` | `"Price Lists"` |
| `subtitle` | `"Custom pricing per cohort. Each list sets prices on a window — once it lapses, buyers fall back to base. Keep them fresh."` |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Clone a list", icon: <Copy size={13}/> }` |
| `primary` | `"New price list"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Active lists` | Count where `status = 'active'` AND `valid_until >= now()` | `"{draft} in draft"` | default |
| 2 | `Cohorts covered` | Distinct cohort count in `price_list_assignments` with active list | `"of {totalCohorts} cohorts"` | default |
| 3 | `Expiring soon` | Count of active lists with `valid_until ≤ now() + 7d` | `"renew before they lapse"` | `warn` |
| 4 | `Products with overrides` | Count of `price_list_items` where `list_price != base_selling_price` | `"custom priced SKUs"` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Expiring soon"` | count | Initials avatar (from list name) + list name + `"Expires {validUntil} · {cohortsCount} cohort(s)"` + `StatusTag` trailing |
| 2 | `info` | `"Most coverage"` | `"by products"` | Initials avatar + list name + `"{productCount} products · valid until {validUntil}"` + product count trailing |
| 3 | `opportunity` | `"Uncovered cohorts"` | `"no active list"` | Initials avatar (from cohort name) + cohort name + `"{memberCount} buyers · falling back to base price"` + member count trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"{n} price lists"` (live count) |
| `searchPlaceholder` | `"Search price list or cohort…"` |
| `chips` | `['All', 'Active', 'Draft', 'Expired']` |
| `activeChip` | `'All'` |
| `sortBy` | `"Recently updated"` |
| `hideViewToggle` | `true` |

**Table — 7 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Price list | 280 px | Initials avatar (38 px, derived from list name, `hue='teal'`) + name (`.ent-name`) + sub: `"Created by {user} · {productCount} SKUs"` (`.ent-sub`) |
| Cohort(s) | — | Cohort name(s) as comma-separated text, `text-[12.5px] text-cream-800`; if multiple: first name + `"+{n} more"` in `text-cream-500` |
| Products | — | Count, `.num` |
| Validity | — | `"{validFrom} → {validUntil}"`, `font-mono text-[12px]`; if expired: `text-cream-500 line-through` |
| Avg discount | — | `"-{pct}%"` off base in `text-teal-700 font-mono font-semibold`; if no discount: `"—"` in `text-cream-400` |
| Status | — | `StatusTag` — `success` for Active, `warning` for Draft, `neutral` for Expired |
| › | — | Chevron |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=price-lists/landing
npm run test:integration -- --testPathPattern=price-lists-landing-page
# - Expiring soon tile = active lists with valid_until within 7 days
# - "Expired" chip hides active/draft lists
# - Uncovered cohorts callout = cohorts with no active price_list_assignments row
# - Price list row click → /price-lists/{id}
# - Flag off → flag-off empty state, no data fetched
npx tsc --noEmit && npm run lint
```

---

### EP-13-009 — Seller Navigation & Global Header Redesign

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** the sidebar navigation grouped by how often I use each section and the notification bell in the top bar — **so that** my daily workload (orders, estimates, invoices) is at the top, setup items (brands, products) are out of the way, and the header isn't wasted space.

#### 2. Common Layout

This story changes `src/components/layout/SellerSidebar.tsx` and `src/components/layout/SellerGlobalHeader.tsx`. No `PageWrap` changes.

```
SellerGlobalHeader (fixed top bar, right of sidebar)
  ├── Search input (⌘K) — unchanged
  └── Right slot: [Notifications bell] [Open buyer app ↗]

SellerSidebar (fixed left, 248px expanded / 88px collapsed)
  ├── Logo + tenant name — unchanged
  ├── OPERATIONS group
  │     Dashboard · Estimates · Sales Orders · Invoices
  ├── CUSTOMERS group
  │     Customers · Cohorts
  ├── CATALOG group
  │     Catalogs · Price Lists · Products · Brands
  ├── ADMIN group
  │     Exports · Settings (└ Users & Roles)
  ├── [flex spacer]
  ├── Log out
  └── User avatar · name · role
```

#### 3. Acceptance Criteria (Functional Boundaries)

- `navItems: []` flat array in `SellerSidebar.tsx` is replaced with `navGroups: NavGroup[]` where each group has `{ label, items: NavItem[] }`.
- Section header labels render as non-clickable text: `OPERATIONS`, `CUSTOMERS`, `CATALOG`, `ADMIN`. Labels are hidden when the sidebar is in collapsed (88px) mode.
- Notifications bell is **removed from the sidebar footer** and added to `SellerGlobalHeader` as an icon button, left of the "Open buyer app" button.
- Sidebar footer contains only: **Log out** button → **avatar / name / role** block (in that order, bottom of sidebar).
- Estimates, Sales Orders, and Invoices nav items are flag-aware: each renders only if its sub-flag is enabled (`df_estimates`, `df_sales_orders`, `df_invoices`). If a sub-flag is off, the nav item is absent — the group itself stays if at least one item is visible.
- `adminOnly` rules remain: Cohorts, Price Lists, Settings (+ children) — `seller_admin` only. All new Commerce items (`df_estimates`, `df_sales_orders`, `df_invoices`) — `adminOnly: false`.
- Idle prefetch hook (`useIdleRoutePrefetch`) updated to derive hrefs from `navGroups` instead of `navItems`.
- Collapsed mode: group labels hidden, items show icon-only with `title` tooltip — identical behaviour to current collapsed state.
- Active item highlight (`bg-teal-500 text-cream-50`) applies to the specific item only, not the group header.

#### 4. Design System & UI/UX Constraints

**`navGroups` data structure:**

```typescript
interface NavGroup {
  label: string;           // 'OPERATIONS' | 'CUSTOMERS' | 'CATALOG' | 'ADMIN'
  items: NavItem[];
}
interface NavItem {
  label: string;
  href: string;
  icon: React.FC<{ size?: number; className?: string }>;
  adminOnly: boolean;
  flagKey?: string;        // e.g. 'df_estimates' — item hidden if flag is off
  children?: NavItem[];   // one level deep only (Settings → Users & Roles)
}
```

**Group order and contents:**

| Group | Items | adminOnly gate |
|-------|-------|---------------|
| OPERATIONS | Dashboard · Estimates · Sales Orders · Invoices | Dashboard=false; others via flagKey |
| CUSTOMERS | Customers · Cohorts | Customers=false; Cohorts=true |
| CATALOG | Catalogs · Price Lists · Products · Brands | Price Lists=true; rest=false |
| ADMIN | Exports · Settings (└ Users & Roles) | Settings=true; Exports=false |

**Group header token spec:**
- `text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-500`
- `px-3 pt-5 pb-1` — top padding separates from the group above
- Not rendered in collapsed mode (`isCollapsed === true`)

**New nav icons needed** (add to `SellerSidebar.tsx` inline SVG set):

| Item | Lucide equivalent | Stroke path hint |
|------|------------------|-----------------|
| Estimates | `FileText` | Document with lines |
| Sales Orders | `ClipboardCheck` | Clipboard with tick |
| Invoices | `Receipt` | Receipt with ₹ |

**SellerGlobalHeader updates:**

```tsx
// Right slot — new order:
<NotificationsBell />          // new component, icon button, bell icon, badge if unread > 0
<Button asChild ...>Open buyer app ↗</Button>
```

`NotificationsBell`: `<Bell size={16}/>` icon button, `rounded-[10px] p-2 hover:bg-cream-200`. Badge: `bg-ember-500 text-white text-[9px] font-bold` absolute top-right of icon, shown only if `unreadCount > 0`. Clicking navigates to `/notifications`.

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=seller/layout/SellerSidebar
npm run test:unit -- --testPathPattern=seller/layout/SellerGlobalHeader
# - navGroups renders 4 section headers in expanded mode
# - Section headers absent in collapsed (isCollapsed=true) mode
# - Estimates nav item absent when df_estimates flag is off
# - Notifications bell present in header; absent from sidebar footer
# - Log out is the last interactive sidebar item before the avatar block
# - Idle prefetch derives hrefs from navGroups correctly
npx tsc --noEmit && npm run lint
```

---

---

# EPIC 14 — Cockpit Detail Pages (v2 Layout)

> **Design reference:** `design-system/Detail Pages v2.html`  
> **Layout pattern:** 1440 px-capped container → `DetailHeader` (breadcrumb · avatar · title · status · subtitle · actions) → `MetaStrip4` (4 tiles, fixed) → `DetailTabs` (varies per entity) → tab body  
> **Meta strip rule:** Exactly 4 tiles per entity. Each tile must answer "would you act differently if this number changed?" Anything that doesn't pass that test is moved to the header subtitle.

---

### EP-14-001 — Shared Detail Page Shell & Reusable Components

#### 1. Objective & User Value

- **As a** developer building any cockpit detail page, **I want** a shared, typed detail-page chrome (breadcrumb, header, meta strip, tabs, actions), **so that** all five entity detail pages (Brand · Product · Customer · Cohort · Catalog) are structurally identical and the 1440 px constraint is enforced once.

#### 2. Common Layout

This story **defines** the layout shell that every other EP-14 story **consumes**. The hierarchy is:

```
SellerShell (existing sidebar nav — do not modify)
  └── PageWrap                        ← max-w-[1440px] mx-auto w-full px-8 pt-7 pb-10
        ├── DetailHeader              ← breadcrumb · avatar · title · status · subtitle pills · right actions
        ├── MetaStrip4                ← always exactly 4 KPI tiles (fixed 4-column grid)
        ├── DetailTabs                ← tab strip (count varies per entity)
        └── tab-body                  ← tab content; entity-specific components render here
```

The **1440 px cap** is inherited from `PageWrap` (same component as EP-13-001 — do not create a second implementation). Reuse `PageWrap` from `src/components/seller/layout/PageWrap.tsx`.

#### 3. Acceptance Criteria (Functional Boundaries)

- `DetailHeader` accepts props: `crumbPath` (array of `{label, href?, current?}`), `avatar` (`{kind: 'brand'|'product'|'catalog', initials?, hue?}`), `title`, `status` (`{label, tone}`), `subtitle` (string array — each entry rendered as a pill or inline item), `actions` (React node).
- `MetaStrip4` accepts exactly 4 tile objects. Tile shape: `{ label, value, sub? }`. Value may be a React node (e.g., a span with a colored delta). Throws console warning if tile count ≠ 4.
- `DetailTabs` accepts `tabs` (array of `{id, label, badge?}`) and `active` (string id). Renders a horizontal tab strip; active tab is underlined with `border-b-2 border-teal-500`.
- `DetailActions` accepts a `mode` prop controlling which action buttons render. Default mode shows: `Edit`, `Archive`, `More` (kebab). Entity-specific modes may override.
- All four components are exported from `src/components/seller/detail/index.ts`.

**Breadcrumb spec:**

- Crumb items: `text-[12px] text-cream-600`, separated by `›` (`text-cream-400`).
- Current page crumb: `text-cream-900 font-medium`.
- Wraps to a new line at narrow widths.

**DetailHeader avatar variants:**

| `kind` | Visual |
|--------|--------|
| `brand` | `EntityAvatar` (initials + hue) — 48×48 px, border-radius 14 px |
| `product` | Bottle icon thumbnail — 48×48 px gradient `#EAF1EE → #C6DAD3` |
| `catalog` | Initials square — 48×48 px, `bg-ember-100 text-ember-800` |

**DetailHeader subtitle array — rendering rules:**

- Each subtitle string renders as an inline text item, separated by `·`.
- Items that are React nodes (e.g., a `<Tier pill>`) render inline in the same row.
- Max 4 subtitle items per entity (enforced by design, not code).

**MetaStrip4 — token spec:**

- Container: 4-column CSS grid, `gap-4 mt-5 mb-0`
- Tile: `bg-cream-50 border border-cream-200 rounded-[12px] px-5 py-4`
- Label: eyebrow class (`text-[10px] font-semibold tracking-[0.12em] uppercase text-cream-600`)
- Value: `text-[22px] font-semibold font-display text-cream-950 mt-1`
- Sub: `text-[11px] text-cream-600 mt-1`; `.up` delta = `text-teal-700`; `.down` delta = `text-danger-600`

**DetailTabs — token spec:**

- Tab strip: `flex border-b border-cream-200 mt-5 gap-0`
- Tab button: `px-5 py-3 text-[13px] font-medium text-cream-600 border-b-2 border-transparent hover:text-cream-900`
- Active tab: `text-cream-950 border-teal-500`
- Badge: `ml-1.5 bg-cream-200 text-cream-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full`

#### 4. Design System & UI/UX Constraints

**File locations:**

| Component | File |
|-----------|------|
| `DetailHeader` | `src/components/seller/detail/DetailHeader.tsx` |
| `MetaStrip4` | `src/components/seller/detail/MetaStrip4.tsx` |
| `DetailTabs` | `src/components/seller/detail/DetailTabs.tsx` |
| `DetailActions` | `src/components/seller/detail/DetailActions.tsx` |
| Barrel export | `src/components/seller/detail/index.ts` |

Reuses from EP-13-001: `PageWrap`, `StatusTag`, `EntityAvatar`, `GrowthPill`.

#### 5. Automated Verification Steps

```bash
npx tsc --noEmit
npm run lint
npm run test:unit -- --testPathPattern=seller/detail
# - MetaStrip4 warns on tile count ≠ 4
# - DetailTabs: active tab has correct border class
# - Breadcrumb: last crumb has font-medium class
# - PageWrap reuse: no second 1440px container implementation
```

---

### EP-14-002 — Brand Detail Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to open a brand's detail page and immediately see its GMV health, active buyer count, stock status, and catalog freshness — then drill into performance charts, buyers, catalogs, and activity log via tabs — **so that** I can manage the brand relationship in one place.

#### 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Brands › {name}" · brand avatar · 5 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     5 tabs — Details · Performance · Buyers · Catalogs · Activity
  └── tab-body       Performance tab active by default
```

Route: `app/(seller)/brands/[id]/page.tsx`  
Feature flag gate: `df_brand_product_master`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page loads brand data from `app.tenant_brands` by `id`; 404 if brand not found or belongs to another tenant.
- **Details tab:** Editable form — brand name, category, region, contact person, contact email, principal terms. "Save changes" persists to `app.tenant_brands`.
- **Performance tab (default):** Revenue trend chart (line, month-over-month), buyer cohort breakdown (bar), SKU-level contribution table (top 10 by GMV).
- **Buyers tab:** Table of all buyers who ordered this brand's products in the selected period. Columns: Buyer · Cohort · Spend · Orders · Last order · Status.
- **Catalogs tab:** List of published catalogs that include at least one product from this brand. Columns: Catalog name · Cohort · GMV · Orders · Status.
- **Activity tab:** Chronological log of all mutations — catalog publishes, price list changes, status changes, inventory updates. Newest first.
- Breadcrumb "Brands" link navigates back to `/brands`.
- `Edit` action (in `DetailActions`) enters inline edit mode on the Details tab. `Archive` action sets `tenant_brands.deleted_at = now()` with a confirmation dialog.

#### 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Brands', href: '/brands' }, { label: brand.name, current: true }]` |
| `avatar` | `{ kind: 'brand', initials: brand.initials, hue: brand.hue }` |
| `title` | `brand.name` |
| `status` | `{ label: brand.statusLabel, tone: brand.statusTone }` |
| `subtitle` | `[brand.category, brand.region, 'Carried since {carriedSince}', '{skus} SKUs · {share}% of portfolio']` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `GMV · this month` | INR formatted MTD GMV | `↑ +{growth}% vs last month` |
| 2 | `Active buyers` | `"{active}/{total}"` | `"bought this month"` |
| 3 | `Low-stock SKUs` | Count where `daysCover < 14` | `"reorder this week"` |
| 4 | `Catalog freshness` | `"{daysSinceCatalog}d ago"` | `"last sent {lastSentDate}"` |

> **Demoted to subtitle:** Share of portfolio (e.g. "35.5% of portfolio") — informational, not actionable enough for a KPI tile.

**DetailTabs — 5 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `details` | `Details` | — |
| `performance` | `Performance` | — |
| `buyers` | `Buyers` | `activeBuyers` count |
| `catalogs` | `Catalogs` | Total catalog count |
| `activity` | `Activity` | — |

Active tab on load: `performance`.

**Performance tab layout:**

- Top row: 2-column grid — Revenue trend (line chart, 6-month, `recharts`) + Buyer cohort breakdown (bar chart, spend by cohort)
- Bottom: "Top SKUs" table — columns: Product · Units · Revenue · Growth · Days cover · Status

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=brands/\[id\]
npm run test:integration -- --testPathPattern=brand-detail-page
# - Fetching /brands/{unknownId} → 404
# - Cross-tenant: brand belonging to another tenant → 403
# - MetaStrip4 shows 4 tiles (not 5 — share of portfolio must NOT be a tile)
# - Archive action: confirmation dialog visible; on confirm, deleted_at set
# - Breadcrumb "Brands" → navigates to /brands
npx tsc --noEmit && npm run lint
```

---

### EP-14-003 — Product Detail Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to see a product's stock position, sell-through rate, and revenue trend in one view, **so that** I can decide whether to replenish, reprice, or bundle the SKU without querying multiple screens.

#### 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Products › {name}" · product avatar · 4 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     4 tabs — Details · Performance · Pricing & cohorts · Activity
  └── tab-body       Performance tab active by default
```

Route: `app/(seller)/products/[id]/page.tsx`  
Feature flag gate: `df_brand_product_master`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `app.tenant_products` + `app.tenant_inventory` by `id`.
- **Details tab:** Product attributes — name, SKU, category, pack size, MRP, HSN code, GST rate. Editable by `seller_admin`.
- **Performance tab (default):** Units sold trend (line, 12-week), daily sell-through rate (area chart), stock level vs. cover days (dual-axis). "Stock folded into Performance" — no separate Stock tab.
- **Pricing & cohorts tab:** Table of price lists that include this product, with effective price per cohort and validity window. Allows override via inline edit (seller_admin only).
- **Activity tab:** Inventory adjustments, price changes, order events — chronological, newest first.
- `Edit` action opens the product edit form. `Archive` sets `deleted_at = now()` with confirmation.

#### 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Products', href: '/products' }, { label: product.name, current: true }]` |
| `avatar` | `{ kind: 'product' }` — bottle icon thumbnail |
| `title` | `product.name` |
| `status` | `{ label: product.statusLabel, tone: product.statusTone }` |
| `subtitle` | `[product.brand, product.sku, product.pack, 'MRP ₹{product.mrp}']` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `Units · MTD` | Unit count sold this month | `↑ +{growth}% vs last month` |
| 2 | `Days of cover` | `"{daysOfCover} d"` | `"at current pace"` |
| 3 | `On hand` | Unit count in inventory | `"bottles"` |
| 4 | `Sell-through` | `"{sellThrough}%"` | `"last 30 days"` |

> **Demoted:** Revenue (redundant — implied by Units × ASP). Not a tile.

**DetailTabs — 4 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `details` | `Details` | — |
| `performance` | `Performance` | — |
| `pricing` | `Pricing & cohorts` | — |
| `activity` | `Activity` | — |

> **Removed:** `Stock` tab — stock data (days cover, on hand) lives in the Performance tab's dual-axis chart.

Active tab on load: `performance`.

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=products/\[id\]
npm run test:integration -- --testPathPattern=product-detail-page
# - MetaStrip4: exactly 4 tiles; Revenue tile must NOT appear
# - Days cover coloring matches landing page rules (0d danger, <7d warning)
# - Stock tab: must not exist in tab list
# - Cross-tenant isolation: product from another tenant → 403
npx tsc --noEmit && npm run lint
```

---

### EP-14-004 — Customer Detail Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** a buyer's detail page showing spend trend, credit position, recent orders, and activity log, **so that** I can manage the relationship, chase overdue invoices, and understand buying patterns without opening a spreadsheet.

#### 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Customers › {name}" · buyer avatar · 4 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     4 tabs — Details · Performance · Orders · Activity
  └── tab-body       Performance tab active by default
```

Route: `app/(seller)/customers/[id]/page.tsx`  
Feature flag gate: `df_customer_master`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `app.buyers` + `app.buyer_users` + `app.orders` by `id`.
- **Details tab:** Buyer info — business name, GSTIN, city, contact, credit terms, cohort assignment. Editable by `seller_admin`.
- **Performance tab (default):** Spend trend (line, 6-month MoM), brand affinity breakdown (pie/bar — spend by brand), order frequency chart.
- **Orders tab (default badge = order count this month):** All orders placed by this buyer. Columns: Order ID · Date · Items · GMV · Status. Clicking an order navigates to `/orders/{id}`.
- **Activity tab:** Invoices, payments, credit adjustments, catalog views, order events — all events in one chronological log. "Invoices folded into Activity" — no separate Invoices tab.
- `Edit` action opens buyer edit form. Credit limit is editable only by `seller_admin`.

#### 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Customers', href: '/customers' }, { label: buyer.name, current: true }]` |
| `avatar` | `{ kind: 'brand', initials: buyer.initials, hue: buyer.hue }` |
| `title` | `buyer.name` |
| `status` | `{ label: buyer.statusLabel, tone: buyer.statusTone }` |
| `subtitle` | `[<TierPill tier={buyer.tier}/>, buyer.city, 'Buyer since {buyerSince} · {yearsLabel}', 'Net {terms} terms']` |

**Tier pill inline component:** `bg-ember-50 text-ember-700 text-[11px] font-medium px-2 py-0.5 rounded-full`

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `Spend · MTD` | INR formatted spend this month | `↑ +{growth}% vs last month` |
| 2 | `Orders · MTD` | Order count this month | `"AOV {inrShort(aov)}"` |
| 3 | `Last order` | Relative date (e.g. `"Jun 24"`) | Last order's primary product + quantity |
| 4 | `Credit used` | INR credit used | `"of {creditLimit} · {pct}%"` |

> **Demoted:** "Buyer since" (sentiment, not metric) — moved to header subtitle as `"Buyer since {year} · N yrs loyal"`.  
> **Removed:** `Invoices` tab — all invoice events appear in the Activity log.

**DetailTabs — 4 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `details` | `Details` | — |
| `performance` | `Performance` | — |
| `orders` | `Orders` | Order count this month |
| `activity` | `Activity` | — |

Active tab on load: `performance`.

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=customers/\[id\]
npm run test:integration -- --testPathPattern=customer-detail-page
# - Invoices tab: must NOT exist in tab list
# - "Buyer since" must appear in subtitle string, NOT as a MetaStrip4 tile
# - Credit used tile: percentage matches (creditUsed / creditLimit * 100)
# - Cross-tenant isolation: buyer from another tenant → 403
# - Orders tab badge = orders placed by this buyer this month
npx tsc --noEmit && npm run lint
```

---

### EP-14-005 — Cohort Detail Page

#### 1. Objective & User Value

- **As a** `seller_admin`, **I want** to see a cohort's membership rules, GMV performance, AOV, and conversion rate in one place, **so that** I can assess whether the segment is healthy and decide whether to update its rules or push a new catalog.

#### 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Cohorts › {name}" · initials avatar · 3 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     3 tabs — Details & rules · Performance · Activity
  └── tab-body       Performance tab active by default
```

Route: `app/(seller)/cohorts/[id]/page.tsx`  
Feature flag gate: `df_cohorts`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `app.cohorts` + `app.cohort_members` + `app.orders` by `id`.
- **Details & rules tab:** Cohort definition — name, description, type (Geo/Tier/Brand affinity), rule conditions (editable by `seller_admin`), member list preview (top 10 buyers with name, city, tier). "Rules and Members merged" — no separate Members tab.
- **Performance tab (default):** GMV trend (line, 6-month), AOV trend (line), conversion funnel (views → orders), per-member spend heatmap.
- **Activity tab:** Catalog publishes, price list assignments, member additions/removals, rule changes — chronological, newest first. "Catalog events appear here" — no separate Catalogs tab.
- `Edit` action opens the cohort rule builder.

#### 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Cohorts', href: '/cohorts' }, { label: cohort.name, current: true }]` |
| `avatar` | `{ kind: 'brand', initials: derived from first 2 words of name, hue: cohort.hue }` |
| `title` | `cohort.name` |
| `status` | `{ label: cohort.statusLabel, tone: cohort.statusTone }` |
| `subtitle` | `['{members} of {totalBuyers} buyers', cohort.description (truncated to 56 chars + "…"), cohort.createdBy]` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `GMV · MTD` | INR formatted cohort GMV this month | `↑ +{growth}% vs last month` |
| 2 | `Active members` | `"{activeMembers}/{totalMembers}"` | `"ordered this month"` |
| 3 | `AOV` | INR average order value | `"across this cohort"` |
| 4 | `Conversion` | `"{conversionRate}%"` | `"catalog → order"` |

> **Demoted:** Members count — moved to header subtitle. No separate Members or Catalogs tab.

**DetailTabs — 3 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `details` | `Details & rules` | — |
| `performance` | `Performance` | — |
| `activity` | `Activity` | — |

Active tab on load: `performance`.

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=cohorts/\[id\]
npm run test:integration -- --testPathPattern=cohort-detail-page
# - Separate Members tab: must NOT exist
# - Separate Catalogs tab: must NOT exist
# - MetaStrip4: exactly 4 tiles; members count NOT a tile
# - Conversion % = (catalog orders / unique catalog views) × 100
# - Cross-tenant isolation: cohort from another tenant → 403
npx tsc --noEmit && npm run lint
```

---

### EP-14-006 — Catalog Detail Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** a catalog's detail page showing its product composition, engagement funnel (views → orders → GMV), and per-buyer breakdown, **so that** I can evaluate the catalog's performance and decide whether to extend its validity or publish a follow-up.

#### 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Catalogs › {name}" · catalog avatar · 4 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     3 tabs — Composition · Performance · Buyers
  └── tab-body       Performance tab active by default
```

Route: `app/(seller)/catalogs/[id]/page.tsx`  
Feature flag gate: `df_catalog_publishing`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `app.published_catalogs` + `app.published_catalog_items` + `app.orders` by `id`.
- **Composition tab:** All products in this catalog — table with columns: Product · Brand · MRP · Catalog price · Override price (if any) · Stock status. Allows `seller_admin` to add/remove products (if catalog is still in `draft` status).
- **Performance tab (default):** Funnel chart (unique views → cart additions → orders → GMV), revenue trend per day of validity, conversion rate trend line.
- **Buyers tab (badge = cohort member count):** Table of all cohort members — who viewed, who ordered, who hasn't opened. Columns: Buyer · Status (Ordered / Viewed / Not opened) · Spend · Orders.
- **No Activity tab** — for catalogs the funnel IS the activity. The engagement funnel (Composition → Performance → Buyers) tells the full story.
- Validity extension: "Extend validity" action sets a new `valid_until` date (seller_admin only, with confirmation).
- Share link: "Copy share link" action copies the `share_token` URL to clipboard.

#### 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Catalogs', href: '/catalogs' }, { label: catalog.name, current: true }]` |
| `avatar` | `{ kind: 'catalog', initials: first 2 initials of name }` (bg-ember-100) |
| `title` | `catalog.name` |
| `status` | `{ label: catalog.statusLabel, tone: catalog.statusTone }` |
| `subtitle` | `['{products} products · {brandsCovered} brands', 'Cohort: {cohortName}', 'Valid {validFrom} → {validUntil}', 'Published by {publishedBy}']` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `GMV` | INR formatted total catalog GMV | `↑ +{growth}% vs previous catalog` |
| 2 | `Orders` | Total orders attributed | `"{conversionRate}% conversion"` |
| 3 | `Unique viewers` | `"{uniqueViewers}/{cohortMembers}"` | `"opened in app"` |
| 4 | `Days left` | `"{daysLeft} d"` | `"valid until {validUntil}"` |

> **Demoted:** Products count — moved to header subtitle. No Activity tab — funnel covers it.

**DetailTabs — 3 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `details` | `Composition` | — |
| `performance` | `Performance` | — |
| `buyers` | `Buyers` | `cohortMembers` count |

Active tab on load: `performance`.

**Catalog status in header:**

| `status.label` | `status.tone` |
|---------------|--------------|
| `Live` | `success` |
| `Draft` | `warning` |
| `Ended` | `neutral` |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=catalogs/\[id\]
npm run test:integration -- --testPathPattern=catalog-detail-page
# - Activity tab: must NOT exist in tab list
# - MetaStrip4: exactly 4 tiles; products count NOT a tile
# - Buyers tab badge = cohort member count (not just buyers who ordered)
# - "Extend validity" visible only to seller_admin
# - Cross-tenant isolation: catalog from another tenant → 403
# - Draft catalog: Composition tab allows add/remove products
npx tsc --noEmit && npm run lint
```

---

### EP-14-007 — Price List Detail Page

#### 1. Objective & User Value

- **As a** `seller_admin`, **I want** to open a price list and see every product's custom price, which cohorts are using it, and how long it's valid, **so that** I can edit prices, extend validity, or add cohort assignments without leaving the page.

#### 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Price Lists › {name}" · list avatar · 4 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     3 tabs — Pricing · Assignments · Activity
  └── tab-body       Pricing tab active by default
```

Route: `app/(seller)/price-lists/[id]/page.tsx`  
Feature flag gate: `df_pricing_engine`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `app.price_lists` + `app.price_list_items` + `app.price_list_assignments` by `id`; 404 if not found or belongs to another tenant.
- **Pricing tab (default):** Full table of all `price_list_items` for this list. Columns: Product · Brand · Base price · List price · Discount % · Stock status. `seller_admin` can inline-edit the `list_price` cell; changes persist immediately via RPC.
- **Assignments tab (badge = assignment count):** Table of cohorts (and/or individual buyers) this list is assigned to via `price_list_assignments`. Columns: Cohort/Buyer · Members · Assigned since · Priority. `seller_admin` can add or remove assignments.
- **Activity tab:** Chronological log — price edits, assignment changes, validity extensions, status changes. Newest first.
- "Extend validity" action (in `DetailActions`) opens a date-picker dialog to set a new `valid_until`; persists via RPC; available only when `status = 'active'` or `status = 'draft'`.
- "Duplicate list" action in `DetailActions` clones the list with `status = 'draft'` and a new name suffix `"(copy)"`.
- `Edit` action enters edit mode on the Pricing tab (inline cells become editable). `Archive` sets `deleted_at = now()` with a confirmation dialog.
- Breadcrumb "Price Lists" navigates back to `/price-lists`.

#### 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Price Lists', href: '/price-lists' }, { label: priceList.name, current: true }]` |
| `avatar` | `{ kind: 'catalog', initials: derived from first 2 words of name, hue: 'teal' }` |
| `title` | `priceList.name` |
| `status` | `{ label: priceList.statusLabel, tone: priceList.statusTone }` |
| `subtitle` | `['{productCount} products', 'Cohorts: {cohortNames joined by ", "}', 'Valid {validFrom} → {validUntil}', 'Created by {createdBy}']` |

**Price list status in header:**

| `status.label` | `status.tone` |
|---------------|--------------|
| `Active` | `success` |
| `Draft` | `warning` |
| `Expired` | `neutral` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `Products covered` | Count of `price_list_items` | `"across {brandCount} brands"` |
| 2 | `Cohorts assigned` | Count of active `price_list_assignments` | `"receiving this price list"` |
| 3 | `Avg discount` | Average `(base_selling_price - list_price) / base_selling_price * 100`% | `"vs base selling price"` |
| 4 | `Days left` | `"{daysLeft} d"` — `0` if expired | `"valid until {validUntil}"` |

> **Demoted to subtitle:** Validity window dates, created-by — already in the header subtitle. Not KPI tiles.

**DetailTabs — 3 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `pricing` | `Pricing` | Product count |
| `assignments` | `Assignments` | Assignment count |
| `activity` | `Activity` | — |

Active tab on load: `pricing`.

**Pricing tab — table spec:**

| Column | Content |
|--------|---------|
| Product | Bottle icon (32 px) + name (`.ent-name`) + sub: `{sku} · {brand}` |
| Brand | `EntityAvatar` (22 px) + brand name |
| Base price | INR, `font-mono text-[12.5px] text-cream-600` |
| List price | INR, `font-mono font-semibold text-cream-950`; inline-editable in edit mode (`<input type="number">` styled to match) |
| Discount | `"-{pct}%"`, `text-teal-700 font-mono text-[12px]`; if list price > base: `text-danger-700` (mark-up, not discount) |
| Stock status | `StatusTag` |

**Assignments tab — table spec:**

| Column | Content |
|--------|---------|
| Cohort / Buyer | Initials avatar + name |
| Members | Buyer count in cohort |
| Assigned since | Date, `font-mono text-[12px]` |
| Priority | Numeric rank (lower = higher priority in `resolve_price()`), `font-mono` |
| — | Remove button (trash icon, `seller_admin` only) |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=price-lists/\[id\]
npm run test:integration -- --testPathPattern=price-list-detail-page
# - MetaStrip4: exactly 4 tiles; validity dates NOT a tile
# - Inline price edit: persists to price_list_items.list_price via RPC
# - Discount % = (base - list) / base * 100; mark-up renders in danger color
# - "Extend validity": only visible when status is active or draft
# - "Duplicate list": new list has status = 'draft' and name suffix "(copy)"
# - Cross-tenant isolation: price list from another tenant → 403
# - Assignments tab badge = count of price_list_assignments rows
npx tsc --noEmit && npm run lint
```

---

### EP-14-008 — Sales Order Detail Page *(DEPRECATED)*

> ⚠️ **DEPRECATED — Superseded by EP-17-005 (Sales Order Detail: Read-only Composer View).** This story is retained for historical reference only. Do not implement this story; implement EP-17-005 instead. The transactional single-scroll layout was replaced by the read-only composer-view layout for UI consistency with the create/edit experience.

> **Layout:** Direction B — Transactional Single-Scroll. Design reference: `dealflow-design-system/project/v2/Orders.jsx` · `orders-data.jsx`. The tabbed layout (Direction A) was evaluated in the design file and rejected — an order is one transaction, not a hub of relationships; tabs hide the timeline and leave each tab thin. **Requires EP-14-009 (Transactional Shell) to be implemented first.**

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to open a sales order and see items, invoice, payment, delivery, and activity in one scroll — with one clear contextual action at the top — **so that** I can confirm, dispatch, or track the order without hunting through tabs.

#### 2. Layout

Does **not** use the EP-14-001 tabbed shell. Uses the shared transactional components from **EP-14-009**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  Crumb                      "Sales Orders / {order.order_number}"
  TransactionalPageHead      doc-type label · buyer name + status pill
                             subtitle · secondary buttons · danger button
  TransactionalStatusBand    4-step stepper · "WHAT'S NEXT" · primary CTA
  [FulfilmentAlert?]         amber banner — only when stock lines are short
  TransactionalGrid (2-col)
    LEFT column
      SectionCard "Items"    line items (qty × price) + taxable value + IGST + total
      SectionCard "Invoice"  empty placeholder (received) → inline tax invoice (confirmed+)
    RIGHT column
      SectionCard "Payment"  status badge · amount · due/paid date · credit gauge
      SectionCard "Delivery" address · window · mode · contact
      SectionCard "Activity" event log newest-first
```

Route: `app/(seller)/sales-orders/[id]/page.tsx`  
Redirect: `301 /orders/[id] → /sales-orders/[id]`  
Feature flag gate: `df_order_management` AND `df_sales_orders`

#### 3. Acceptance Criteria

- Loads from `app.orders` + `app.order_items`; 404 or 403 if not found / cross-tenant.
- No `draft` status exists on sales orders.
- Stepper, "What's next" text, primary CTA, secondary buttons, and danger button all derive from the per-state table below.
- Fulfilment alert renders when `showFulfilment = true` AND any `order_item.qty > on_hand`.
- Invoice section renders an empty placeholder for `received`; renders inline tax invoice for `confirmed` and later.
- Payment badge, amount, and credit gauge update per state.
- "Cancel order" requires a confirmation modal with a reason text field.
- If `estimate_id` is set, subtitle includes `"From: EST-YYYY-NNNN"` as a linked chip.
- Breadcrumb "Sales Orders" links back to `/sales-orders`.

#### 4. Per-State Configuration

| Status | Stepper step | What's Next | Primary CTA | Secondary | Danger | Invoice panel | Fulfilment | Payment badge |
|--------|-------------|-------------|-------------|-----------|--------|--------------|------------|---------------|
| `received` | 0 — Received (active) | "Confirm to reserve stock and generate the invoice. {n} line(s) short — resolve first or confirm a partial." | **Confirm order** | Edit order · Message buyer | Cancel order | Empty placeholder | ✓ | Not invoiced · neutral |
| `confirmed` | 1 — Confirmed (active) | "Stock is reserved and the invoice is raised. Dispatch when the fleet is loaded." | **Mark dispatched** | Download invoice · Edit order | Cancel order | Tax invoice shown | ✓ | Payment due · warning |
| `dispatched` | 2 — Dispatched (active) | "On the road with the distributor fleet. Mark delivered once the buyer signs." | **Mark delivered** | Track shipment · Download invoice | — | Tax invoice shown | — | Payment due · warning |
| `delivered` | 3 — Delivered (active) | "Delivered and paid in full. Nothing pending — reorder for this buyer in a tap." | **Reorder for buyer** (secondary style) | Download invoice · Export to Tally | — | Tax invoice shown | — | Paid in full · success |
| `cancelled` | Step 0 ✓ → Cancelled ✗ | "Cancelled before dispatch. Reserved stock was released back to inventory." | **Reorder for buyer** (secondary style) | View reason | — | Empty placeholder | — | No charge · neutral |

**Status → status pill tone:**

| `status` | Display label | Tone |
|----------|--------------|------|
| `received` | Received | `neutral` |
| `confirmed` | Confirmed | `accent` |
| `dispatched` | Dispatched | `warning` |
| `delivered` | Delivered | `success` |
| `cancelled` | Cancelled | `danger` |

#### 5. Design System & UI/UX Constraints

**`TransactionalPageHead` — field mapping:**

| Field | Value |
|-------|-------|
| Doc-type label (top-right) | `"ORDER · {STATUS_UPPER}"` — `text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-600` |
| Order number (above title) | `order.order_number` — `font-mono text-[12px] text-cream-600` |
| Title (buyer name) | `order.buyer.name` — `font-display text-[28px] font-semibold` inline with status pill |
| Subtitle dots | `"Placed {placedAt} · via {catalog} · {channel} · {n} lines · {m} units"` + if `estimate_id`: `· "From EST-YYYY-NNNN"` chip |
| Secondary buttons | Ghost, small — icon (13px) + label; see per-state table |
| Danger button | Ghost, small, `text-danger-700`; shown for `received` and `confirmed` only |

**`TransactionalStatusBand` — stepper steps:**

| Step | Label | State variants |
|------|-------|---------------|
| 0 | Received | `is-done` (teal ✓) or `is-current` (amber ring) |
| 1 | Confirmed | `is-done` · `is-current` · future (cream-300 dashed) |
| 2 | Dispatched | same |
| 3 | Delivered | same |
| Cancelled variant | Steps 0 ✓, step 1 shows ✗ "Cancelled" label in danger tone, steps 2–3 grey/skipped |

"WHAT'S NEXT" eyebrow: `text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-600`. Guidance text: `text-[13px] text-cream-800 max-w-[480px]`. Primary CTA: right-aligned in the band footer.

**`FulfilmentAlert` — amber inline banner:**

`bg-amber-50 border border-amber-200 rounded-[10px] p-4 flex items-start gap-3 mt-3`  
Left: `<AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5"/>` · Centre: bold title (`"One line can't be fully fulfilled"`) + detail (product name, on-hand count, short count, options). · Right: "Resolve stock" ghost button.

**Invoice section — two states:**

Empty placeholder: `p-5 flex items-center gap-3 text-[13px] text-cream-600`  
Icon: `<Package size={22} className="text-cream-400"/>` · Text: `"No invoice yet. Confirm the order to reserve stock and raise INV-{year}-… automatically."`

Tax invoice (confirmed+):
```
ord-inv-head (px-5 pt-4 pb-3):
  Left: invoice number (font-mono font-semibold) + "Raised {invoiceDate} · {terms} · IGST (inter-state)"
  Right: StatusTag "Tax invoice" tone=accent

ord-inv-parties (px-5 pb-4 grid 2-col):
  "Billed to": buyer name · city · GSTIN
  "Ship to": buyer name · delivery address · fleet mode

ord-tot (px-5 pb-5):
  Taxable value · IGST @ 18% · Invoice total (bold, large)
```

**Payment section:**

```
Status badge row: StatusTag (Not invoiced / Payment due / Paid in full / No charge)
Amount: font-display text-[26px] font-semibold — INR formatted or "—"
Detail line: text-[12.5px] text-cream-700 — "Net 21 · due {dueDate}" or "Paid {date} · {method}"
Credit gauge:
  Head: "Credit used · {pct}% of ₹{limit}" (11px)
  Bar: teal if pct < 80%, amber-500 if 80–89%, danger-500 if ≥ 90%
  Foot: "₹{used} used · ₹{available} available" (11px)
```

**Activity section — event types and icons:**

| Event | Icon |
|-------|------|
| Order placed | `<ShoppingCart size={12}/>` |
| Line edited | `<Pencil size={12}/>` |
| Order confirmed (accent) | `<Check size={12}/>` teal |
| Short-stock flagged (warn) | `<AlertTriangle size={12}/>` amber |
| Dispatched | `<Truck size={12}/>` |
| Delivered (success) | `<Home size={12}/>` teal |
| Payment received (success) | `<Check size={12}/>` teal |
| Cancelled (danger) | `<X size={12}/>` red |

Each row: icon node (16px circle bg-cream-100) · title (13px semibold) · detail (12px cream-700) · `"who · timestamp"` (11px cream-500).

#### 6. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=sales-orders/\[id\]
npm run test:integration -- --testPathPattern=sales-order-detail-page
# - NO MetaStrip4, NO DetailTabs rendered
# - received: Invoice panel shows empty placeholder text
# - confirmed: Invoice panel shows invoice number, parties, totals
# - dispatched: "Mark delivered" CTA; "Cancel order" NOT visible
# - delivered: "Paid in full" badge; "Reorder for buyer" secondary-style CTA
# - FulfilmentAlert: visible only when received/confirmed AND short lines > 0
# - estimate_id set → "From: EST-YYYY-NNNN" chip in subtitle
# - Cross-tenant → 403; 301 redirect /orders/{id} → /sales-orders/{id}
npx tsc --noEmit && npm run lint
```

---

---

# EPIC 15 — Estimates

> **Feature flags:** `df_order_management` (umbrella) AND `df_estimates` (sub-flag).  
> **Schema:** `app.estimates` (exists — buyer-side API live) + seller-facing columns added via migration. `app.estimate_items` exists.  
> **Status set:** `draft → sent → accepted → declined → expired` · terminal: `converted` (→ Sales Order) · `invoiced` (→ Invoice directly).  
> **Inventory hold:** Estimates never touch inventory — speculative documents only.

---

### EP-15-001 — Estimates Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to see all estimates — buyer-submitted enquiries and seller-created quotes — in one place with their status and value, **so that** I can respond to buyer enquiries, convert accepted estimates, and spot quotes about to expire before the opportunity lapses.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Enquiries" · title="Estimates"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     8 columns — see §4
```

Route: `app/(seller)/estimates/page.tsx`  
Feature flag gate: `df_order_management` AND `df_estimates`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_order_management` + `df_estimates`.
- Data from `app.estimates` (all estimates for this tenant, both buyer-submitted and seller-created).
- "Open" = status IN (`draft`, `sent`, `accepted`).
- "Awaiting response" = status = `sent` (seller sent the estimate, waiting for buyer).
- "Ready to convert" = status = `accepted` (accepted but not yet converted).
- "Expiring soon" = status IN (`draft`, `sent`, `accepted`) AND `expires_at ≤ now() + 7 days`.
- "Needs action" callout: estimates with status=`sent` that have had no buyer response for >3 days (sorted oldest first), max 3.
- "Ready to convert" callout: estimates with status=`accepted`, sorted by value desc, max 3.
- "Expiring soon" callout: expiring in ≤7 days, sorted by `expires_at` asc, max 3.
- Filter chips work client-side.
- Clicking a row navigates to `/estimates/{id}`.
- "New estimate" CTA opens the estimate creation form.

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Enquiries"` |
| `title` | `"Estimates"` |
| `subtitle` | `"{n} open estimates this month. {m} accepted and ready to convert. {p} from the buyer app."` (live counts) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Import estimates", icon: <Upload size={13}/> }` |
| `primary` | `"New estimate"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Open estimates` | Count where status IN (`draft`,`sent`,`accepted`) | `"{sent} sent · {accepted} accepted"` | default |
| 2 | `Ready to convert` | Count where status = `accepted` | `"accepted, awaiting conversion"` | `accent` |
| 3 | `Expiring soon` | Count where open AND `expires_at ≤ now() + 7d` | `"act before they lapse"` | `warn` |
| 4 | `Converted this month` | Count where status IN (`converted`,`invoiced`) AND `accepted_at` in period | `"to SO or Invoice"` | default |

**Status → `StatusTag` tone mapping:**

| DB status | Display label | Tone |
|-----------|--------------|------|
| `draft` | Draft | `neutral` |
| `sent` | Sent | `warning` |
| `accepted` | Accepted | `success` |
| `declined` | Declined | `neutral` |
| `expired` | Expired | `neutral` |
| `converted` | Converted to SO | `success` |
| `invoiced` | Invoiced | `success` |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Needs a follow-up"` | count of sent with no response >3d | Buyer `EntityAvatar` (32 px) + buyer name + `"{estimateNumber} · Sent {sentAt} · no response"` + INR value trailing |
| 2 | `info` | `"Ready to convert"` | count of accepted | Buyer avatar + buyer name + `"{estimateNumber} · {itemCount} items"` + INR value trailing |
| 3 | `opportunity` | `"Expiring soon"` | count expiring ≤7d | Buyer avatar + buyer name + `"{estimateNumber} · expires in {daysLeft}d"` + `StatusTag` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"Showing {n} of {total}"` |
| `searchPlaceholder` | `"Search estimate number, buyer, product…"` |
| `chips` | `['All', 'Draft', 'Sent', 'Accepted', 'Converted', 'Declined', 'Expired']` |
| `activeChip` | `'All'` |
| `sortBy` | `"Newest first"` |
| `hideViewToggle` | `true` |

**Table — 8 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Estimate | 260 px | Buyer `EntityAvatar` (32 px) + estimate number (`font-mono text-[12px]`) + sub: buyer name |
| Source | — | `"Buyer app"` or `"Seller-created"` — `text-[11px] text-cream-600` |
| Items | — | Count, `.num` |
| Value | — | `.num-display` INR |
| Expires | — | Date `font-mono text-[12px]`; red `text-danger-700` if `< 7 days` and still open |
| Status | — | `StatusTag` |
| Created | — | `font-mono text-[12px] text-cream-700` |
| › | — | Chevron |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=estimates/landing
npm run test:integration -- --testPathPattern=estimates-landing-page
# - "Ready to convert" tile = count where status = 'accepted'
# - "Expiring soon" tile = open estimates with expires_at ≤ now() + 7 days
# - 'Converted' chip filters to status IN ('converted','invoiced')
# - Buyer-submitted estimates appear alongside seller-created ones
# - Estimate row click → /estimates/{id}
# - df_estimates OFF → flag-off empty state
npx tsc --noEmit && npm run lint
```

---

### EP-15-002 — Estimate Detail Page *(DEPRECATED)*

> ⚠️ **DEPRECATED — Superseded by EP-17-004 (Estimate Detail: Read-only Composer View).** This story is retained for historical reference only. Do not implement this story; implement EP-17-004 instead. The transactional single-scroll layout was replaced by the read-only composer-view layout for UI consistency with the create/edit experience.

> **Layout:** Direction B — Transactional Single-Scroll, adapted for estimates. Requires **EP-14-009** (Transactional Shell). No tabs, no MetaStrip4. The estimate is a quote document — show items, quote terms, buyer credit headroom, and activity all at once.

#### 1. Objective & User Value

- **As a** `seller_admin`, **I want** to open an estimate, see its items and expiry in one view, and convert it to a Sales Order or Invoice with a single CTA — **so that** the quote-to-order workflow happens inside DealFlow without switching to Zoho or a spreadsheet.

#### 2. Layout

Uses transactional components from **EP-14-009**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  Crumb                      "Estimates / {estimate.estimate_number}"
  TransactionalPageHead      doc-type label · buyer name + status pill
                             subtitle · secondary buttons · danger button
  TransactionalStatusBand    3-step stepper · "WHAT'S NEXT" · primary CTA
  TransactionalGrid (2-col)
    LEFT column
      SectionCard "Items"    estimate line items (qty × unit price, discount%, total)
                             + subtotal + GST estimate + quote total
    RIGHT column
      SectionCard "Quote"    expires_at · buyer notes · seller note
      SectionCard "Buyer credit"  credit gauge vs. estimate value
      SectionCard "Activity" event log newest-first
```

Route: `app/(seller)/estimates/[id]/page.tsx`  
Feature flag gate: `df_order_management` AND `df_estimates`

#### 3. Acceptance Criteria

- Loads from `app.estimates` + `app.estimate_items`; 404/403 if not found / cross-tenant.
- Stepper, "What's next", primary CTA, secondary and danger buttons all derive from the per-state table below.
- Convert to Sales Order: copies `estimate_items → order_items`, sets `orders.estimate_id`, updates `estimates.status → 'converted'` and `estimates.converted_to_order_id`. Navigates to new SO.
- Convert to Invoice: copies `estimate_items → invoice_items`, sets `invoices.estimate_id`, updates `estimates.status → 'invoiced'` and `estimates.converted_to_invoice_id`. Navigates to new Invoice.
- Inventory: no `tenant_inventory` row touched — estimates are proposals only.
- Buyer credit card warns when `(credit_limit - credit_used) < total_amount`.
- Breadcrumb "Estimates" links back to `/estimates`.

#### 4. Per-State Configuration

Stepper: **Draft (0) → Sent (1) → Accepted (2)**. Terminal states (declined, expired, converted, invoiced) replace step 2 with their label.

| Status | Stepper | What's Next | Primary CTA | Secondary | Danger |
|--------|---------|-------------|-------------|-----------|--------|
| `draft` | Step 0 active | "Fill in the items and send to the buyer to get their decision." | **Send to buyer** | Edit items | — |
| `sent` | Step 1 active | "Waiting for buyer response. Follow up if no reply in 3 days." | **Mark accepted** | Send reminder · Edit | Mark declined |
| `accepted` | Step 2 active | "Buyer accepted. Convert to a Sales Order or directly to an Invoice." | **Convert to Sales Order** | Convert to Invoice | — |
| `declined` | Step 1 ✓ → Declined ✗ | "Buyer declined. Duplicate with revised pricing if needed." | **Duplicate as draft** | — | — |
| `expired` | Step 1 ✓ → Expired | "Estimate expired. Duplicate with a fresh validity window." | **Duplicate as draft** | — | — |
| `converted` | All steps ✓ → Converted | "Converted to Sales Order {ORD-NNNN}. Track it from there." | **View Sales Order →** | — | — |
| `invoiced` | All steps ✓ → Invoiced | "Converted directly to Invoice {INV-NNNN}." | **View Invoice →** | — | — |

**Status → pill tone:**

| Status | Display label | Tone |
|--------|--------------|------|
| `draft` | Draft | `neutral` |
| `sent` | Sent | `warning` |
| `accepted` | Accepted | `success` |
| `declined` | Declined | `danger` |
| `expired` | Expired | `neutral` |
| `converted` | Converted | `success` |
| `invoiced` | Invoiced | `success` |

#### 5. Design System & UI/UX Constraints

**`TransactionalPageHead` field mapping:**

| Field | Value |
|-------|-------|
| Doc-type label | `"ESTIMATE · {STATUS_UPPER}"` |
| Id line | `estimate.estimate_number` — `font-mono text-[12px] text-cream-600` |
| Title | `estimate.buyer.name` — `font-display text-[28px]` + status pill |
| Subtitle | `"Created {createdAt} · {itemCount} items · Expires {expiresAt}"` · if `converted_to_order_id`: `"→ SO {orderNumber}"` chip · if `converted_to_invoice_id`: `"→ INV {invoiceNumber}"` chip |

**Items section (SectionCard, left column):**

| Column | Content |
|--------|---------|
| Product | Bottle icon (32 px) + name + sub: `{sku} · {brand}` |
| Qty | Integer, `.num` |
| Unit price | INR `font-mono text-[12.5px]` |
| Discount | `"-{pct}%"` `text-teal-700 font-mono text-[12px]`; `"—"` if none |
| Line total | `.num-display` INR |

Totals block at bottom of items card:
```
Subtotal (estimated): ₹X
GST estimate @ 18%: ₹X  (greyed, labelled "estimated")
Quote total: ₹X (bold)
```
Note: GST is estimated on the quote — the confirmed figure appears on the Invoice.

**Quote section (SectionCard, right column):**

```
Row: Expires        → "{expiresAt}" (danger-700 font-semibold if ≤7 days away and still open)
Row: Buyer notes    → "{estimate.notes}" or "—"
Row: Seller note    → "{estimate.seller_note}" (editable inline for seller_admin)
Row: Payment terms  → "{buyer.payment_terms}" (e.g. "Net 21")
```

Each row: label `text-[11px] text-cream-500 uppercase tracking-[0.06em]` · value `text-[13px] text-cream-900`

**Buyer credit section (SectionCard, right column):**

```
Head: "Credit headroom" label · "{available_credit} available" right
Credit gauge (same component as Sales Order payment gauge):
  fill = (credit_used / credit_limit) × 100%
  teal < 80%, amber 80–89%, danger ≥ 90%
Warn banner (if available_credit < estimate.total_amount):
  amber text-[12px]: "Credit headroom (₹{available}) is less than this estimate (₹{total}). 
   Confirm with buyer before converting."
Foot: "₹{used} used · ₹{limit} limit"
```

**Convert dialogs (Modal, Tier 1 from dialog system):**

- *Convert to Sales Order*: title "Convert to Sales Order", body: estimate summary (number · items · value), footer: "Cancel" + "Convert" (primary).
- *Convert to Invoice*: same body + "Due date" date-picker field.

#### 6. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=estimates/\[id\]
npm run test:integration -- --testPathPattern=estimate-detail-page
# - NO MetaStrip4, NO DetailTabs rendered
# - draft: "Send to buyer" primary; "Mark accepted" NOT present
# - accepted: "Convert to Sales Order" primary; "Convert to Invoice" secondary
# - "Convert to SO": app.orders row created with estimate_id; estimate.status → 'converted'
# - "Convert to Invoice": app.invoices row created; estimate.status → 'invoiced'
# - No inventory touched at any estimate state
# - Buyer credit warn banner: visible when available_credit < total_amount
# - Expires date: danger colour when ≤7 days and status is open
# - Cross-tenant → 403
npx tsc --noEmit && npm run lint
```

---

---

# EPIC 16 — Invoices

> **Feature flags:** `df_order_management` (umbrella) AND `df_invoices` (sub-flag).  
> **Schema:** `app.invoices` (new) + `app.invoice_items` (new). Both created via migration.  
> **Status set:** `draft → sent → paid → overdue` · terminal: `void`.  
> **Inventory:** Invoices do not touch inventory directly. If `tenant.inventory_hold_point = 'invoice'`, the invoice creation triggers a hold via RPC.  
> **Numbering:** `INV-YYYY-NNNN`, sequential per tenant.

---

### EP-16-001 — Invoices Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to see all invoices — amounts billed, what's paid, and what's overdue — so that I can chase outstanding payments, send reminders, and know my actual revenue picture beyond just GMV.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Billing" · title="Invoices"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     8 columns — see §4
```

Route: `app/(seller)/invoices/page.tsx`  
Feature flag gate: `df_order_management` AND `df_invoices`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_order_management` + `df_invoices`.
- Data from `app.invoices` for this tenant.
- "Total billed" = sum of `total_amount` where `status IN ('sent','paid','overdue')` this month.
- "Paid" = count where `status = 'paid'` this month.
- "Overdue" = count where `status = 'overdue'` (system auto-sets `overdue` when `due_date < today` and status is `sent`).
- "Outstanding" = sum of `total_amount` where `status IN ('sent','overdue')`.
- "Overdue" callout: status=`overdue`, sorted by `due_date` asc (oldest first), max 3.
- "Paid this month" callout: status=`paid` this month, sorted by `total_amount` desc, max 2.
- "Due soon" callout: status=`sent` AND `due_date ≤ now() + 7d`, sorted by `due_date` asc, max 3.
- Filter chips work client-side.
- Clicking a row navigates to `/invoices/{id}`.
- "New invoice" CTA opens the invoice creation form (direct invoice — no linked SO/estimate required).

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Billing"` |
| `title` | `"Invoices"` |
| `subtitle` | `"{n} invoices this month. {m} paid, {p} outstanding, {q} overdue."` (live counts) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Download all (PDF)", icon: <Download size={13}/> }` |
| `primary` | `"New invoice"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Billed · MTD` | Sum `total_amount` where status IN (`sent`,`paid`,`overdue`) | `"across {n} invoices"` | `accent` |
| 2 | `Paid` | Count where status=`paid` this month | `"collected this month"` | default |
| 3 | `Overdue` | Count where status=`overdue` | `"past due date"` | `warn` |
| 4 | `Outstanding` | Sum `total_amount` where status IN (`sent`,`overdue`) | `"not yet collected"` | default |

**Status → `StatusTag` tone mapping:**

| DB status | Display label | Tone |
|-----------|--------------|------|
| `draft` | Draft | `neutral` |
| `sent` | Sent | `warning` |
| `paid` | Paid | `success` |
| `overdue` | Overdue | `danger` |
| `void` | Void | `neutral` |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Overdue"` | count | Buyer `EntityAvatar` (32 px) + buyer name + `"{invoiceNumber} · overdue by {n}d"` + INR amount trailing |
| 2 | `info` | `"Paid this month"` | `"top payments"` | Buyer avatar + buyer name + `"{invoiceNumber} · paid {paidAt}"` + INR amount trailing |
| 3 | `opportunity` | `"Due soon"` | `"next 7 days"` | Buyer avatar + buyer name + `"{invoiceNumber} · due {dueDate}"` + INR amount trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"Showing {n} of {total}"` |
| `searchPlaceholder` | `"Search invoice number, buyer, order…"` |
| `chips` | `['All', 'Draft', 'Sent', 'Paid', 'Overdue', 'Void']` |
| `activeChip` | `'All'` |
| `sortBy` | `"Newest first"` |
| `hideViewToggle` | `true` |

**Table — 8 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Invoice | 240 px | Buyer `EntityAvatar` (32 px) + invoice number (`font-mono text-[12px]`) + sub: buyer name |
| Linked to | — | `"ORD-YYYY-NNNN"` or `"EST-YYYY-NNNN"` or `"—"` (direct) — `font-mono text-[11px]` — clickable link |
| Amount | — | `.num-display` INR |
| Due date | — | `font-mono text-[12px]`; overdue → `text-danger-700 font-semibold` |
| Status | — | `StatusTag` |
| Paid on | — | `paid_at` date or `"—"` — `font-mono text-[12px] text-cream-700` |
| Created | — | `font-mono text-[12px] text-cream-600` |
| › | — | Chevron |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=invoices/landing
npm run test:integration -- --testPathPattern=invoices-landing-page
# - "Overdue" tile = count where status = 'overdue'
# - "Outstanding" tile = sum of sent + overdue total_amount
# - "Overdue" filter chip hides non-overdue invoices
# - Linked SO number in table is clickable → /sales-orders/{order_id}
# - Invoice row click → /invoices/{id}
# - df_invoices OFF → flag-off empty state
npx tsc --noEmit && npm run lint
```

---

### EP-16-002 — Invoice Detail Page *(DEPRECATED)*

> ⚠️ **DEPRECATED — Superseded by EP-17-006 (Invoice Detail: Read-only Composer View).** This story is retained for historical reference only. Do not implement this story; implement EP-17-006 instead. The transactional single-scroll layout was replaced by the read-only composer-view layout for UI consistency with the create/edit experience.

> **Layout:** Direction B — Transactional Single-Scroll, adapted for invoices. Requires **EP-14-009** (Transactional Shell). No tabs, no MetaStrip4. The full GST-compliant invoice document is the primary content — it lives in the left column, not behind a tab. Payment tracking and activity are in the right column.

#### 1. Objective & User Value

- **As a** `seller_admin`, **I want** to open an invoice and see the full tax document, payment status, and activity in one scroll — with one contextual action (send, record payment, or download) at the top — **so that** the billing cycle closes inside DealFlow without switching to Zoho Books.

#### 2. Layout

Uses transactional components from **EP-14-009**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  Crumb                      "Invoices / {invoice.invoice_number}"
  TransactionalPageHead      doc-type label · buyer name + status pill
                             subtitle · secondary buttons · danger button
  TransactionalStatusBand    3-step stepper · "WHAT'S NEXT" · primary CTA
  TransactionalGrid (2-col)
    LEFT column
      SectionCard "Invoice"  full GST tax invoice document (the primary content)
                             + Download button in card header right-slot
    RIGHT column
      SectionCard "Payment"  status badge · amount · due/paid date · credit gauge
      SectionCard "Linked to" source document link (SO / Estimate / Direct)
      SectionCard "Activity" event log newest-first
```

Route: `app/(seller)/invoices/[id]/page.tsx`  
Feature flag gate: `df_order_management` AND `df_invoices`

#### 3. Acceptance Criteria

- Loads from `app.invoices` + `app.invoice_items`; 404/403 if not found / cross-tenant.
- Stepper, "What's next", primary CTA, secondary and danger buttons all derive from per-state table.
- `overdue` is a sub-state rendered at step 1 (Sent) with danger tone on the stepper node and band.
- "Send to buyer": `status → sent`; calls Resend with PDF link; if `tenant.inventory_hold_point = 'invoice'`, calls `app.reserve_inventory_for_invoice(invoice_id)` server-side.
- "Record payment" opens a Modal (Tier 1). On submit: `status → paid`, `paid_at` set.
- "Download PDF": calls Edge Function `generate-invoice-pdf`; triggers browser download. Available at all non-void statuses.
- "Void invoice": Modal confirmation required; `status → void`; no further actions.
- If `order_id` set: "Linked to" card shows linked SO with link to `/sales-orders/{order_id}`.
- If `estimate_id` set: "Linked to" card shows linked Estimate with link to `/estimates/{estimate_id}`.
- If neither: "Linked to" card shows "Direct invoice — no linked document."

#### 4. Per-State Configuration

Stepper: **Draft (0) → Sent (1) → Paid (2)**. Overdue = step 1 with danger styling.

| Status | Stepper | What's Next | Primary CTA | Secondary | Danger |
|--------|---------|-------------|-------------|-----------|--------|
| `draft` | Step 0 active | "Send to the buyer to start the payment clock." | **Send to buyer** | Download PDF | Void invoice |
| `sent` | Step 1 active | "Sent. Due {dueDate}. Record payment when received." | **Record payment** | Send reminder · Download PDF | Void invoice |
| `overdue` | Step 1 active — danger ring | "Overdue by {n} days. Send a reminder or record payment to clear the balance." | **Record payment** | Send reminder · Download PDF | Void invoice |
| `paid` | Step 2 active | "Paid in full on {paidAt}. Nothing pending." | **Download PDF** | Export to Tally | — |
| `void` | Terminal — all grey | "Voided. No charge has been raised against this buyer." | — | Download PDF | — |

**Status → pill tone:**

| Status | Display label | Tone |
|--------|--------------|------|
| `draft` | Draft | `neutral` |
| `sent` | Sent | `warning` |
| `overdue` | Overdue | `danger` |
| `paid` | Paid | `success` |
| `void` | Void | `neutral` |

#### 5. Design System & UI/UX Constraints

**`TransactionalPageHead` field mapping:**

| Field | Value |
|-------|-------|
| Doc-type label | `"INVOICE · {STATUS_UPPER}"` — overdue shows `"INVOICE · OVERDUE"` in `text-danger-600` |
| Id line | `invoice.invoice_number` — `font-mono text-[12px] text-cream-600` |
| Title | `invoice.buyer.name` — `font-display text-[28px]` + status pill |
| Subtitle | `"Raised {createdAt} · Due {dueDate} · {terms}"` + linked doc chip if applicable |

**Invoice document (SectionCard "Invoice", left column):**

The invoice IS the primary content — not a tab, not a preview. Rendered in-card:

```
Card header (right-slot): "Download" ghost button — <Download size={12}/> + "Download"

Card body (flush=true, px-6 py-5):

  ── Parties row ───────────────────────────────────────────────
  Left "Billed to":    buyer business name · city, state · GSTIN
  Right "Ship to":     buyer name · delivery address · fleet mode

  ── Invoice meta row ──────────────────────────────────────────
  Invoice number (font-mono font-semibold) · "Raised {invoiceDate}"
  Terms: {terms} · "TAX INVOICE" accent pill (right)

  ── Line items table ──────────────────────────────────────────
  Columns: Product · HSN · Qty · Rate · GST% · Amount
  (styled like v2-table, no outer border, cream-100 header)

  ── Totals block (right-aligned) ─────────────────────────────
  Taxable value: ₹X
  CGST (9%): ₹X       ← intra-state splits; if inter-state: single IGST row
  SGST (9%): ₹X
  ─────────────────
  Invoice total: ₹X   (font-semibold, text-[18px])

  ── Footer ───────────────────────────────────────────────────
  "Terms: Net {terms} days · {payment_instructions}"
  text-[11px] text-cream-500
```

**Payment section (SectionCard, right column):**

Same component as Sales Order payment section (reuse from EP-14-009 transactional context):

```
Status badge: StatusTag (Draft—neutral / Sent—warning / Overdue—danger / Paid—success / Void—neutral)
Amount: font-display text-[26px] font-semibold INR — "—" if draft
Detail: "Due {dueDate}" or "Overdue by {n} days" (danger-700) or "Paid {paidAt} · {method}"
Credit gauge:
  Head: "Credit used · {pct}% of ₹{limit}"
  fill: teal <80% / amber 80–89% / danger ≥90%
  Foot: "₹{used} used · ₹{available} available"
  Note: credit is recalculated including this invoice's amount until paid
```

**Linked to section (SectionCard, right column):**

```
If order_id:
  Icon <ClipboardCheck/> + "Sales Order {order.order_number}" link → /sales-orders/{order_id}
  Sub: "Converted from SO · Placed {order.placed_at}"

If estimate_id:
  Icon <FileText/> + "Estimate {estimate.estimate_number}" link → /estimates/{estimate_id}
  Sub: "Converted directly from estimate"

If neither:
  Icon <PlusCircle/> + "Direct invoice"
  Sub: "Created directly — no linked SO or estimate"
```

**Record payment Modal (Tier 1 — Modal, follows `DialogHeader / DialogBody / DialogFooter`):**

- Header: "Record payment"
- Body: Amount paid (number input, pre-filled with `total_amount`, editable for partial), Date paid (date picker, default today), Payment reference (text input, optional — e.g. "UPI · Ref 123").
- Footer: "Cancel" (ghost) + "Mark as paid" (primary, teal).
- On submit: `PATCH /api/tenant/invoices/{id}` with `{ status: 'paid', paid_at, payment_reference }`.

**Activity section — event types and icons:**

| Event | Icon |
|-------|------|
| Invoice created | `<FileText size={12}/>` |
| Sent to buyer | `<Send size={12}/>` |
| Reminder sent | `<Bell size={12}/>` |
| Payment recorded (success) | `<Check size={12}/>` teal |
| Overdue flag raised (danger) | `<AlertTriangle size={12}/>` amber |
| PDF downloaded | `<Download size={12}/>` |
| Voided (danger) | `<X size={12}/>` red |

#### 6. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=invoices/\[id\]
npm run test:integration -- --testPathPattern=invoice-detail-page
# - NO MetaStrip4, NO DetailTabs rendered
# - Invoice document renders in left SectionCard (not behind a tab)
# - draft: "Send to buyer" primary; "Record payment" NOT visible
# - sent: "Record payment" primary; "Send to buyer" NOT visible
# - overdue: stepper step 1 has danger-ring class; "Record payment" primary
# - paid: "Download PDF" only; no danger button
# - void: no primary action; stepper all grey
# - Record payment modal: paid_at set to input date; status → paid
# - inventory_hold_point='invoice': reserve_inventory_for_invoice called on sent transition
# - order_id set → Linked to card shows SO link; estimate_id → Estimate link
# - Download PDF: Edge Function called; blob returned
# - Cross-tenant → 403
npx tsc --noEmit && npm run lint
```

---

### EP-14-009 — Shared Transactional Page Shell

> **Foundation story** for EP-14-008 (Sales Orders), EP-15-002 (Estimates), EP-16-002 (Invoices). Implement this before any of those three. Design reference: `dealflow-design-system/project/v2/Orders.jsx`.

#### 1. Objective & User Value

- **As a** developer building any transactional detail page (Sales Order, Estimate, Invoice), **I want** a shared set of typed React components that enforce the Direction B single-scroll layout — **so that** all three pages are structurally consistent and the pattern is implemented once.

#### 2. Why a Separate Shell from EP-14-001

EP-14-001 defines the tabbed entity detail shell (`DetailHeader → MetaStrip4 → DetailTabs → tab body`). That pattern works for relational entities (Brands, Products, Customers, Cohorts, Catalogs, Price Lists) which have multiple relationships to explore.

Transactional documents (orders, estimates, invoices) are **one event with one state**. They benefit from a single scroll that shows everything simultaneously — items, payment, delivery, activity — with a clear contextual action at the top. Tabs hide the activity log behind a click and fragment context that belongs together.

#### 3. Acceptance Criteria

- `TransactionalPageHead` accepts: `docTypeLabel` (e.g. `"ORDER · RECEIVED"`), `idLine` (mono document number above title), `title` (buyer/entity name), `statusPill` (`{ label, tone }`), `subtitle` (dot-separated string with optional chip nodes), `secondaryActions` (array), `dangerAction` (optional).
- `TransactionalStatusBand` accepts: `steps` (array of `{ label, state: 'done'|'current'|'future'|'skipped'|'cancelled', timestamp? }`), `whatsnext` (guidance string), `primaryAction` (`{ label, onClick, variant: 'primary'|'secondary' }`).
- `FulfilmentAlert` accepts: `lines` (array of `{ name, onHand, qty }`); renders nothing if `lines` is empty.
- `SectionCard` accepts: `title`, `sub?`, `rightSlot?` (React node — e.g. Download button), `flush` (boolean — removes inner body padding), `children`.
- `TransactionalGrid` renders a CSS grid with a wide left column (`1fr`) and a fixed right column (`380px`), `gap-5`, each column is a flex column with `gap-3`.
- All components exported from `src/components/seller/transactional/index.ts`.

#### 4. Design System & UI/UX Constraints

**File locations:**

| Component | File |
|-----------|------|
| `TransactionalPageHead` | `src/components/seller/transactional/TransactionalPageHead.tsx` |
| `TransactionalStatusBand` | `src/components/seller/transactional/TransactionalStatusBand.tsx` |
| `FulfilmentAlert` | `src/components/seller/transactional/FulfilmentAlert.tsx` |
| `SectionCard` | `src/components/seller/transactional/SectionCard.tsx` |
| `TransactionalGrid` | `src/components/seller/transactional/TransactionalGrid.tsx` |
| Barrel | `src/components/seller/transactional/index.ts` |

**`SectionCard` token spec:**
- Outer: `bg-white border border-cream-200 rounded-[14px] overflow-hidden`
- Header: `px-5 py-3.5 border-b border-cream-100 flex items-center justify-between`
- Title: `text-[13.5px] font-semibold text-cream-900`; Sub: `text-[11.5px] text-cream-600 ml-2`
- Body (flush=false): `px-5 py-4`; Body (flush=true): no padding — content fills to edges

**`TransactionalStatusBand` stepper token spec:**
- Container: `bg-white border border-cream-200 rounded-[14px] p-5 mt-4`
- Step node: 24px circle. `is-done`: `bg-teal-500 text-white` + checkmark SVG. `is-current`: `bg-amber-400` ring pulse animation. `future`: `bg-cream-100 border-2 border-cream-300`. `cancelled` variant: `bg-danger-100 text-danger-600` with X icon.
- Connector line: `height: 2px` between nodes. Done: `bg-teal-300`. Future: `bg-cream-300 border-dashed`.
- Step label: `text-[12px] font-medium text-cream-900` below node. Timestamp: `text-[10.5px] text-cream-500 mt-0.5`.
- Footer row: `mt-4 pt-4 border-t border-cream-100 flex items-start justify-between gap-4`
- "WHAT'S NEXT" eyebrow: `text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1`
- Guidance text: `text-[13px] leading-[1.5] text-cream-800 max-w-[480px]`

**`TransactionalGrid` spec:**
- `display: grid; grid-template-columns: 1fr 380px; gap: 20px; margin-top: 16px; align-items: start`
- Each column: `display: flex; flex-direction: column; gap: 12px`

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=seller/transactional
# - SectionCard: flush=true → no padding class on body
# - FulfilmentAlert: empty lines array → renders null
# - TransactionalStatusBand: 'done' step → teal fill; 'current' → amber ring class
# - TransactionalGrid: grid-template-columns has two values
# - All components exported from barrel
npx tsc --noEmit && npm run lint
```

---

## Cross-Cutting Constraints (Both Epics)

These rules apply to every story in EP-13 and EP-14 and are not repeated per story.

**1. 1440 px cap — enforced once, inherited everywhere.**  
`PageWrap` (`src/components/seller/layout/PageWrap.tsx`) is the single source of the `max-w-[1440px] mx-auto` constraint. No landing page or detail page component adds its own width constraint. The sidebar is outside `PageWrap` and is not counted in the 1440 px budget.

**2. No list/grid toggle in v3 landing pages.**  
`FilterBar` always receives `hideViewToggle={true}` in EP-13. The `view` prop exists on `FilterBar` for future use but is not rendered.

**3. Shared components must be imported from the barrel, not imported directly.**  
All pages import from `src/components/seller/layout` and `src/components/seller/detail` — not from individual files. This ensures a single import point for future token renames.

**4. Feature flag gate is applied at the route level — not at the component level.**  
Each page server component calls `getFlag(flagName, tenantId)` before rendering. A disabled flag returns the standard empty state from `src/components/seller/layout/FlagOffState.tsx` (created in EP-01-004 and reused here).

**5. Tenant isolation.**  
Every Supabase query in EP-13 and EP-14 uses `.schema('app').from(...)` and does NOT accept a client-supplied `tenant_id`. The `tenant_id` is always derived from the JWT claim inside the server component. RLS enforces the boundary.

**6. All CTAs follow the icon-left convention.**  
Primary CTA: `<Plus size={13}/>` (or entity-appropriate Lucide icon) left of label text. Secondary CTA: entity-appropriate Lucide icon left of label text. No icon-only CTAs for primary/secondary actions.

**7. Design token source.**  
Colors, spacing, radii, and font stacks come exclusively from `src/styles/tokens.ts` (Ember & Cream design system). No inline hex values. No Tailwind `arbitrary values` for colors — use semantic token classes.

---

---

# EPIC 17 — Document Composers (Create & Edit) + Detail Views

> **Design reference:** `design-system/project/Dialogs and Overlays.html` → Section "Documents — Estimate · Sales order · Invoice"  
> **Source files:** `dialogs/documents.jsx` · `dialogs/documents-states.jsx` · `dialogs/documents-modals.jsx`  
> **Layout pattern:** Composer (Tier 3) — full content-area route, three-column body (Buyer · Lines · Totals+Insights), horizontal `DocStrip`, auto-saves draft, back-button safe. Same chrome for Create, Edit, **and View** — `mode` prop switches behaviour. Create/Edit = interactive; View = read-only with `DocStatusBand` pinned below `DocTop`.  
> **Prerequisite:** EP-14-009 (Shared Transactional Shell) must be in place. EP-17-001 defines the shared `DocComposerFrame` shell; all subsequent stories reuse it.  
> **Six stories:** EP-17-001/002/003 = composers (Create & Edit). EP-17-004/005/006 = detail views (View mode) — supersede EP-15-002, EP-14-008, EP-16-002 respectively.  
>  
> **Shared new component: `DocStatusBand`** — defined in EP-17-004; reused by EP-17-005 and EP-17-006. A 40 px sticky horizontal strip rendered directly below `DocTop` (above the 3-column body) in `mode="view"` only. Shows status chip, key timestamps, urgency signals, and Tally export status. Token class: `doc-status-band`.

---

### EP-17-001 — Estimate Composer (Create & Edit)

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** a full-page composer to create or edit an estimate for a buyer, **so that** I can quote prices, review credit headroom, apply pricelist discounts, and send the estimate via WhatsApp or email — all without leaving the context of the buyer's data.
- **Feature flag:** `df_order_management` (parent) · `df_estimates` (sub-flag). Both must be `true` to render the route.
- **Routes:**
  - Create: `GET /estimates/new` → renders `DocComposerEstimate` in `create` mode
  - Edit: `GET /estimates/[id]/edit` → renders `DocComposerEstimate` in `edit` mode (loads existing draft or sent estimate)
  - Read-only view: `GET /estimates/[id]` → renders `DocComposerEstimate` in `sent` mode (inputs locked)

#### 2. Shared Document Composer Shell

> EP-17-001 is the **foundation story** for all three document composers. EP-17-002 and EP-17-003 inherit this shell — they do not re-implement it.

**New component tree:** `src/components/seller/document-composer/`

```
src/components/seller/document-composer/
├── index.ts                  ← barrel export
├── DocComposerFrame.tsx      ← outer chrome: DocTop + DocTitleRow + DocStrip + 3-col body + DocComposerFoot
├── DocTop.tsx                ← breadcrumb · doc-type chip · status/mode chip · autosave indicator · Close button
├── DocTitleRow.tsx           ← h1 (mode-aware title) + subtitle + right-actions slot
├── DocStrip.tsx              ← 5-field horizontal strip (doc#, date, second-date, buyer PO ref, place of supply)
├── BuyerCard.tsx             ← BuyerCardEmpty + BuyerCardFilled + CreditBar
├── LinesTable.tsx            ← LinesAddRow (search popover) + LineRow (qty stepper, price, disc%, tax%, amount)
├── TotalsCard.tsx            ← subtotal + document discount + GST + freight + round-off + grand total
├── InsightsCard.tsx          ← pricelist chip (with Swap) + scheme savings + credit status
└── DocComposerFoot.tsx       ← autosave status · secondary actions · primary CTA
```

**Kind config** (prop `kind: 'estimate' | 'so' | 'invoice'`) controls:

| Field | Estimate | Sales Order | Invoice |
|---|---|---|---|
| Doc# prefix | `EST` | `SO` | `INV` |
| Date label | Date issued | Order date | Invoice date |
| Second date label | Valid until | Expected delivery | Due date |
| Crumb list name | Estimates | Sales orders | Invoices |
| Create CTA | Send estimate | Confirm order | Send invoice |
| Edit CTA | Save & resend | Save changes | Save & resend |

**DocTop** props: `kind`, `docNumber` (null when unsaved draft), `statusChip?` (sent/paid/etc.), `modeChip?` (`{ tone: 'draft'|'edit', label }`) , `autoSave?` (`{ label, dot: CSSProperties }`). Close button always present.

**DocTitleRow** props: `kind`, `mode: 'create'|'edit'|'sent'`, `subtitle: ReactNode`, `rightActions: ReactNode`.

**DocStrip** fields: doc number (editable input in `create` mode, monospace span otherwise), date (datepicker trigger), second date (datepicker trigger), buyer PO ref (optional free text), place of supply (auto-populated from buyer GSTIN state, overridable dropdown). All 5 fields are editable in `create` and `edit` mode.

**BuyerCardEmpty**: Search input (`⌘K` shortcut) + hint text + list of 3 recent buyers (avatar, name, sub, outstanding balance). Focused by default when composer opens. Picking a buyer fires `GET /api/tenant/buyers/[id]/context` → returns pricelist, terms, credit, GSTIN, bill address; populates DocStrip place-of-supply automatically.

**BuyerCardFilled**: Avatar + name + GSTIN (mono) + bill-to address + `CreditBar` + sales agent + payment terms dropdown + "Swap" button. `CreditBar` shows `used / limit` with a `preview` segment for this document's current subtotal. Colors: green ≤80%, amber 80–100%, red over limit.

**LinesAddRow**: Search input with inline product-search popover (debounced 200 ms, calls `GET /api/tenant/products/search?q=&buyerId=`). Popover shows: brand avatar, product name, SKU, stock on-hand (red if <20), pricelist price. Keyboard: `↑↓` navigate, `↵` add, `esc` close. Adding a product appends a `LineRow`.

**LineRow** columns: `#` · Product (brand avatar + name + SKU + HSN · `stockWarn` badge if qty > on-hand) · Qty (stepper − / input / +) · Price (pricelist default; click-to-override shows override indicator) · Disc% (editable) · Tax% (auto from HSN, editable) · Amount (computed). `delete` icon at end. In `edit` mode: row class `is-changed` | `is-added` | `is-removed` applies diff styling.

**LinesTable footer** (only in `create` / `edit` mode): unit+SKU count summary · "Add notes for buyer" · "Add freight & packing" · "Add internal note" — all inline-expand text areas below the table.

**TotalsCard**: Subtotal (N lines), Document discount (flat ₹, entered via "Add freight & packing" footer action), GST (avg rate, individual line rates applied), Freight & packing, Round-off (±), Grand total. In `edit` mode shows `was` strikethrough values when changed.

**InsightsCard** (right rail, below TotalsCard): "Pricelist applied" chip + Swap button + saving note. "Scheme savings" if any active scheme matched. "Credit status" chip (Healthy / Tight / Over limit) + days-to-pay insight.

**DocComposerFoot**: Sticky bottom bar. Left: autosave dot + label (`'Draft created'` / `'Draft saved · N sec ago'` / `'N unsaved changes'` with amber dot). Right: Discard draft · Save & close (secondary) · Primary CTA. Primary CTA is `disabled` until a buyer is selected AND at least 1 line exists.

**Auto-save behavior**: `useAutoSave` hook — debounce 2 s, PATCH `/api/tenant/estimates/[id]`. Draft created immediately on route open (POST `/api/tenant/estimates` with `status: 'draft'`), so refreshing the page resumes the draft.

---

#### 3. Estimate-Specific Acceptance Criteria

**Composer states:**

| State | Trigger | UI change | Footer CTA |
|---|---|---|---|
| **Empty** | Route first opens | `BuyerCardEmpty` focused; lines panel shows "Waiting on buyer"; `TotalsCard` shows `₹0`; mode chip `Draft` | Send estimate — `disabled` |
| **Buyer picked** | Buyer selected from search | `BuyerCardFilled` with credit bar; `LinesAddRow` ready; InsightsCard shows pricelist; place-of-supply auto-filled | Send estimate — `disabled` |
| **Lines in progress** | ≥1 line added | Totals live; CreditBar shows preview; InsightsCard shows scheme savings if applicable | Send estimate — **enabled** |
| **Credit warning** | Subtotal + GST > buyer's available credit | `callout--danger` in TotalsStack: "Over limit by ₹X K. Estimate can still be sent — converting to SO needs approval." CreditBar `preview` segment red | Send estimate — **enabled** (estimates do not block on credit) |
| **Edit mode** | Route `/estimates/[id]/edit` | `modeChip` "Editing · was sent" (amber); changed/added/removed rows get diff classes; `TotalsCard` shows `was` values; amber autosave dot | Save & resend — enabled when ≥1 change |
| **Sent / read-only** | Route `/estimates/[id]` (view) | `doc-readonly` class applied; inputs non-editable; `doc-trail` strip shows "Sent · 2h ago · Seen by buyer · 24 min ago"; lifecycle actions in `DocTitleRow` `rightActions` | Void / Edit estimate / Convert to SO |

**Send flow** (primary CTA "Send estimate"):
1. Opens Tier-1 `ModalSendEstimate` (width 580 px) — channel tabs: WhatsApp · Email · Download only; recipient (buyer admin contact pre-populated, editable); message (editable default); preview pane shows what buyer will see.
2. On "Send now" → PATCH `status: 'sent'`, `sent_at`, `sent_channel` → redirect to `/estimates/[id]` (read-only mode).
3. Sets status chip to `doc-status--sent`.

**Convert to SO** (available from read-only `sent` view):
1. Opens `ModalConvertEstimateToSO` (width 600 px) — line picker (checkboxes, all pre-checked); expected delivery datepicker; auto-generated SO number (editable); "Keep estimate open for remaining lines" checkbox.
2. On confirm → `POST /api/tenant/orders` with `estimate_id` FK, selected lines; PATCH estimate `status: 'converted'` (terminal). Redirect to new SO's edit page.
3. Deselected lines remain on the estimate, estimate stays `converted` status.

**Estimate statuses** (UI labels):

| `status` DB value | Label | StatusTag tone |
|---|---|---|
| `draft` | Draft | `neutral` |
| `sent` | Sent | `accent` |
| `accepted` | Accepted | `success` |
| `declined` | Declined | `danger` |
| `expired` | Expired | `warning` |
| `converted` | Converted to SO | `neutral` (secondary text) |
| `invoiced` | Invoiced direct | `neutral` (secondary text) |

**Doc number:** Auto-generated on draft creation — `EST-{YYYY}-{NNNNN}` (zero-padded 5-digit sequence per tenant per year). Editable in the DocStrip (free-text override).

**Valid-until date:** Defaults to today + 14 days. Editable via datepicker in DocStrip. Shown with amber tint in InsightsCard when within 3 days of expiry.

**Notes for buyer:** Appended below line items in the PDF. Internal note is NOT included in PDF — stored as `seller_note` on `app.estimates`.

#### 4. Common Layout

```
Route: /estimates/new  OR  /estimates/[id]/edit
Shell: DocComposerFrame (src/components/seller/document-composer/DocComposerFrame.tsx)

DocTop
  crumb: Sales / Estimates / {docNumber or "New estimate"}
  doc-type chip: "Estimate" (teal dot)
  modeChip: "Draft" (create) | "Editing · was sent" (edit)
  autoSave: dot + label
  Close button

DocTitleRow
  h1: "New estimate" (create) | "Edit estimate" (edit) | "Estimate" (sent)
  subtitle: contextual (buyer name once picked)
  rightActions: "Preview PDF" button (once ≥1 line)

DocStrip  ← 5-field horizontal strip
  [Estimate #] [Date issued] [Valid until] [Buyer PO ref] [Place of supply]

3-col composer body  (grid: 260px · 1fr · 320px, gap 18px)
  LEFT:  BuyerCard (empty → filled with CreditBar)
  CENTER: LinesTable (LinesAddRow + LineRows + footer links)
  RIGHT: TotalsStack
           ↳ [callout--danger] (credit warning, if over)
           ↳ TotalsCard
           ↳ InsightsCard

DocComposerFoot
  left: autosave indicator
  right: Discard draft · Save & close · Send estimate
```

#### 5. Design System Rules

- `DocComposerFrame` uses `max-w-[1440px] mx-auto` — inherited from `PageWrap`. Do not add another width constraint inside the composer.
- Doc-type chip classes: `doc-type-chip--estimate` (teal dot), `doc-type-chip--so` (amber dot), `doc-type-chip--invoice` (ember dot).
- Mode chip classes: `mode-chip--draft` (neutral), `mode-chip--edit` (amber/warning tone).
- Line diff row classes: `is-changed` (amber left border), `is-added` (success tint), `is-removed` (danger strikethrough, opacity 0.5).
- CreditBar progress colors: ≤80% → `--success-500`; 80–100% → `--warning-500`; over → `--danger-500`.
- Indian number formatting: `inr()` function (12,40,000 grouping). Tax rows in TotalsCard: `CGST {rate/2}% + SGST {rate/2}%` for intra-state; `IGST {rate}%` for inter-state (derived from buyer GSTIN state vs. seller GSTIN state).
- All CTAs: Lucide icon (16 px, left) + label text. Never icon-only.
- Footer primary CTA `disabled` state: `btn-disabled` class, `disabled` attribute. Do not use `opacity-50` directly.

#### 6. DB & API Integration

**Tables:** `app.estimates` · `app.estimate_items`

**Seller-visible columns added** (migration required before implementing):
```sql
ALTER TABLE app.estimates ADD COLUMN IF NOT EXISTS
  seller_note         text,              -- internal note, excluded from PDF
  valid_until         date,              -- defaults today + 14 days
  buyer_po_ref        text,              -- buyer's PO number (optional)
  discount_flat       numeric(12,2) DEFAULT 0,  -- document-level flat discount
  freight             numeric(12,2) DEFAULT 0,
  converted_order_id  uuid REFERENCES app.orders(id),  -- FK set on Convert to SO
  sent_at             timestamptz,
  sent_channel        text;             -- 'whatsapp' | 'email' | 'download'

-- estimate_items seller columns
ALTER TABLE app.estimate_items ADD COLUMN IF NOT EXISTS
  disc_pct    numeric(5,2) DEFAULT 0,
  tax_pct     numeric(5,2),             -- auto from HSN, overridable
  scheme_tag  text;                     -- e.g. "Buy 12, get 1 free"
```

**Key API routes:**
```
POST   /api/tenant/estimates              ← create draft (returns { id, est_number })
PATCH  /api/tenant/estimates/[id]         ← auto-save lines + header fields
PATCH  /api/tenant/estimates/[id]/send    ← finalise & send (sets sent_at, sent_channel, status:'sent')
POST   /api/tenant/estimates/[id]/convert ← convert to SO (body: { lines: string[], delivery_date })
GET    /api/tenant/buyers/[id]/context    ← pricelist, credit, GSTIN, bill address
GET    /api/tenant/products/search        ← ?q=&buyerId= (pricelist-aware results + stock)
```

**Price resolution:** call `app.resolve_price(tenant_product_id, buyer_id, qty)` per line when adding or changing quantity. If buyer's pricelist changes after draft creation, flag InsightsCard: "Pricelist updated since draft — recalculate?"

**Credit check:** `SELECT credit_limit, credit_used FROM app.buyers WHERE id = $1 AND tenant_id = $2`. `credit_used` = sum of unpaid invoices. Show CreditBar with `addToCart = current estimate total`.

#### 7. Automated Verification Steps

- [ ] `/estimates/new` renders `DocComposerEstimate` with `BuyerCardEmpty` focused and "Send estimate" CTA disabled.
- [ ] Selecting a buyer from the search popover populates `BuyerCardFilled`, fills DocStrip place-of-supply, and renders `InsightsCard` with pricelist name.
- [ ] Adding a product line shows it in the LinesTable with pricelist price pre-filled, and updates TotalsCard in real time.
- [ ] Auto-save fires within 2 s of any change; dot turns green; reloading the route restores draft state.
- [ ] With buyer credit used + estimate total > credit limit, `callout--danger` appears; "Send estimate" CTA remains enabled.
- [ ] "Send estimate" opens `ModalSendEstimate` with buyer's WhatsApp contact pre-populated; clicking "Send now" sets `status: 'sent'` and redirects to read-only view.
- [ ] Read-only view (`/estimates/[id]`): all inputs non-editable; `doc-trail` strip visible; "Convert to SO" available.
- [ ] `ModalConvertEstimateToSO`: checking/unchecking lines updates the "N of M lines rolling over" summary; clicking confirm creates SO and marks estimate `status: 'converted'`.
- [ ] `/estimates/[id]/edit` shows `modeChip` "Editing · was sent"; changed rows show amber left border; TotalsCard shows `was` values; CTA reads "Save & resend".
- [ ] Feature flag `df_estimates: false` → route returns `FlagOffState` component; nav item hidden.

---

### EP-17-002 — Sales Order Composer (Create & Edit)

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** a full-page composer to create or edit a sales order, **so that** I can lock in line quantities, see live stock availability per SKU, flag short-stock situations before confirming, and reserve inventory against the buyer.
- **Feature flag:** `df_order_management` (parent) · `df_sales_orders` (sub-flag).
- **Routes:**
  - Create: `GET /sales-orders/new`
  - Edit: `GET /sales-orders/[id]/edit` (only allowed on `status: 'received'` or `'confirmed'`; dispatched or later → read-only)
  - Shortcut: `GET /estimates/[id]/convert` → redirects to `/sales-orders/new?fromEstimate=[id]` with lines pre-filled

#### 2. Common Layout

```
Route: /sales-orders/new  OR  /sales-orders/[id]/edit
Shell: DocComposerFrame (reused from EP-17-001)

DocTop
  crumb: Sales / Sales orders / {SO number or "New sales order"}
  doc-type chip: "Sales order" (amber dot, doc-type-chip--so)
  modeChip: "Draft" | "Editing · received" | "Editing · confirmed"
  autoSave: dot + label
  Close button

DocTitleRow
  h1: "New sales order" | "Edit sales order" | "Sales order"
  subtitle: "For {buyer}" or stock-warning hint
  rightActions: "Stock report" button (create mode, always visible)

DocStrip
  [SO #] [Order date] [Expected delivery] [Buyer PO ref] [Place of supply]

3-col composer body
  LEFT:  BuyerCard (empty → filled with CreditBar)
  CENTER: LinesTable (with stock-on-hand column visible in SO mode)
  RIGHT: TotalsStack
           ↳ [callout--warning] (stock warning, if any line over stock)
           ↳ TotalsCard
           ↳ InsightsCard

DocComposerFoot
  left: autosave indicator (or stock-warning hint)
  right: Discard · Save & close · [Confirm with backorder (warning-tone)] | Confirm order (primary)
```

#### 3. SO-Specific Acceptance Criteria

**Stock column:** LinesTable in SO mode adds a visible stock badge on each `LineRow`: `{onHand} in stock` — green if `qty ≤ onHand`, amber if `qty > onHand * 0.9`, red (`stockWarn` class) if `qty > onHand`. Badge text: "Only {onHand} in stock" with `<AlertTriangle>` icon when warn.

**Stock warning state** (≥1 line has `qty > onHand`):
- `callout--warning` in TotalsStack: "N line(s) over stock. {Product name} — ordered {qty}, only {onHand} on hand. Options: backorder the {shortfall}, split into two SOs, or cut to {onHand}."
- Footer switches primary CTA to `btn-secondary` with `border-color: --warning-500; color: --warning-700` and label "Confirm with backorder".
- Normal "Confirm order" primary moves to appear only when ALL lines are within stock.
- Autosave footer hint changes to "Resolve the stock warning before confirming" (warning tone).

**Confirm order flow** (primary CTA):
1. If no stock issues → PATCH `status: 'received'` + `confirmed_at` (or POST for new). No modal required.
2. If backorder → opens `ModalConfirmWithBackorder` (Tier 1, width 480 px): summarises short lines with "Backorder {shortfall}" chips; checkbox "Notify buyer of backorder"; "Confirm anyway" primary. On confirm → same PATCH with `has_backorder: true`.
3. On success → redirect to `/sales-orders/[id]` (transactional detail view, EP-14-008).

**Convert from estimate:** When route includes `?fromEstimate=[id]`, on mount: fetch estimate lines, pre-fill LinesTable, pre-fill buyer, set DocStrip with today's date and +7d delivery. DocTitleRow subtitle: "Pre-filled from EST-{n} — verify stock before confirming."

**Edit mode constraints:**
- `status: 'received'` → all fields editable.
- `status: 'confirmed'` → buyer locked (no Swap); lines editable (qty/price/disc), product add/remove allowed; delivery date editable. Warning: "Editing a confirmed order. Stock reservation adjusts on save."
- `status: 'dispatched'` or later → `/[id]/edit` redirects to `/[id]` with toast "This order can't be edited after dispatch."

**SO statuses** (reflected in modeChip when editing):

| DB `status` | modeChip label | modeChip tone |
|---|---|---|
| `received` | Editing · received | `draft` (neutral) |
| `confirmed` | Editing · confirmed | `edit` (amber) |

**Doc number:** `SO-{YYYY}-{NNNNN}`. Auto-generated; editable in DocStrip.

**Expected delivery date:** Defaults to today + 7 days. Editable. Used to populate `delivery.window` on the detail view (EP-14-008).

#### 4. Design System Rules

- Inherits all rules from EP-17-001.
- `doc-type-chip--so`: amber/warning dot color.
- Stock warning badge: `stock-warn` class (amber background, `--warning-700` text) when `qty > onHand`.
- "Confirm with backorder" CTA: `btn-secondary` base + `border-color: var(--warning-500); color: var(--warning-700)`. Do NOT use `btn-primary` — the warning action must be visually secondary to a normal confirm.
- Stock popover in `LinesAddRow`: show `{onHand} in stock` with `is-low` class when `stock < 20`.

#### 5. DB & API Integration

**Tables:** `app.orders` · `app.order_items` (existing schema, no rename)

**Additional columns** (migration if not present):
```sql
ALTER TABLE app.orders ADD COLUMN IF NOT EXISTS
  estimate_id    uuid REFERENCES app.estimates(id),  -- FK when created from estimate
  buyer_po_ref   text,
  discount_flat  numeric(12,2) DEFAULT 0,
  freight        numeric(12,2) DEFAULT 0,
  has_backorder  boolean DEFAULT false,
  seller_note    text;

ALTER TABLE app.order_items ADD COLUMN IF NOT EXISTS
  disc_pct    numeric(5,2) DEFAULT 0,
  tax_pct     numeric(5,2),
  scheme_tag  text,
  on_hand_at_confirm  integer;  -- snapshot of stock at confirm time
```

**Key API routes:**
```
POST   /api/tenant/orders                  ← create draft SO
PATCH  /api/tenant/orders/[id]             ← auto-save lines + header
PATCH  /api/tenant/orders/[id]/confirm     ← sets status:'received', reserves stock via RPC
GET    /api/tenant/orders/[id]/stock-check ← returns per-line stock status { sku, onHand, qty, isShort }
GET    /api/tenant/buyers/[id]/context     ← shared with EP-17-001
GET    /api/tenant/products/search         ← shared with EP-17-001
```

**Stock reservation RPC:** `app.confirm_order(order_id)` — decrements `app.tenant_inventory.quantity_available` per line, writes `on_hand_at_confirm` snapshot, returns short lines for backorder callout.

#### 6. Automated Verification Steps

- [ ] `/sales-orders/new` renders `DocComposerFrame` with `kind="so"`, DocStrip shows "Expected delivery" label, CTA reads "Confirm order".
- [ ] Adding a line with `qty > onHand` shows `stockWarn` badge on that row and `callout--warning` in TotalsStack.
- [ ] When stock warning exists, footer CTA switches to amber-bordered "Confirm with backorder"; normal "Confirm order" primary disappears.
- [ ] When all lines are within stock, footer shows normal "Confirm order" primary CTA (no warning button).
- [ ] "Confirm order" (no stock issues) → PATCH `status: 'received'` → redirect to `/sales-orders/[id]` (EP-14-008 transactional detail).
- [ ] `/sales-orders/new?fromEstimate=[id]` → lines + buyer pre-filled from estimate; subtitle shows EST number.
- [ ] `/sales-orders/[id]/edit` on a `dispatched` order → redirects to `/sales-orders/[id]` with toast "Can't edit after dispatch."
- [ ] Auto-save within 2 s; stock check refreshes on qty change (debounced 500 ms).
- [ ] Feature flag `df_sales_orders: false` → route returns `FlagOffState`; nav item hidden; `df_estimates` flag unaffected.

---

### EP-17-003 — Invoice Composer (Create & Edit)

#### 1. Objective & User Value

- **As a** `seller_admin`, **I want** a full-page composer to create or edit an invoice, **so that** I can raise a GST-compliant tax invoice, send it to the buyer via WhatsApp or email, track payment, and export the entry to Tally — either linked to a sales order or raised directly without one.
- **Feature flag:** `df_order_management` (parent) · `df_invoices` (sub-flag). `seller_assistant` role can create invoices but cannot void them.
- **Routes:**
  - Create (direct): `GET /invoices/new`
  - Create from SO: `GET /invoices/new?fromOrder=[id]` → lines pre-filled from SO
  - Edit: `GET /invoices/[id]/edit`
  - View (read-only): `GET /invoices/[id]`

#### 2. Common Layout

```
Route: /invoices/new  OR  /invoices/[id]/edit  OR  /invoices/[id]
Shell: DocComposerFrame (reused from EP-17-001)

DocTop
  crumb: Sales / Invoices / {INV number or "New invoice"}
  doc-type chip: "Invoice" (ember dot, doc-type-chip--invoice)
  modeChip: "Draft" | "Editing · was sent" (amber) | absent in sent/view mode
  autoSave: dot + label (absent in read-only mode)
  Close button

DocTitleRow
  h1: "New invoice" | "Edit invoice" | "Invoice"
  subtitle: "For {buyer} · ₹{total} due in {N} days" (sent view)
  rightActions:
    — create/edit: "Preview PDF" (once ≥1 line)
    — sent view: Download PDF · Send again · Mark as paid · ⋮ menu

doc-trail strip  ← only in sent/view mode
  "Sent via WhatsApp · 2h ago by {user} · Seen by buyer · 24 min ago · Tally export: pending"

DocStrip
  [Invoice #] [Invoice date] [Due date] [Buyer PO ref] [Place of supply]

3-col composer body
  LEFT:  BuyerCard (empty → filled with CreditBar)
  CENTER: LinesTable
  RIGHT: TotalsStack
           ↳ [callout--warning] (edit-after-send notice, in edit mode)
           ↳ [callout--info] (guidance note in read-only view)
           ↳ TotalsCard (with CGST/SGST or IGST split)
           ↳ InsightsCard

DocComposerFoot
  — create: Discard draft · Save & close · Send invoice
  — edit:   Discard changes · Save as draft · Save & resend
  — sent:   Void invoice (danger-ghost) · Edit invoice · Mark as paid
```

#### 3. Invoice-Specific Acceptance Criteria

**GST tax split in TotalsCard:**
- Intra-state (buyer and seller in same state) → show `CGST {rate/2}% + SGST {rate/2}%` on two rows.
- Inter-state → show single `IGST {rate}%` row.
- Determined from buyer's GSTIN state code (first 2 digits) vs. `app.tenants.gstin` state code. Auto-resolved when buyer is selected; shown in DocStrip "Place of supply" field.

**Doc number:** `INV-{YYYY}-{NNNNN}`. Auto-generated on draft creation. Editable in DocStrip until `status: 'sent'`; locked after send.

**Due date:** Defaults to invoice date + tenant's default payment terms (from `app.tenants.payment_terms_days`, default 21). Editable via datepicker until sent; locked after send.

**Create from SO (`?fromOrder=[id]`):** On mount, fetch SO lines + buyer, pre-fill LinesTable (including HSN codes and GST rates), pre-fill buyer card, set `order_id` FK. DocTitleRow subtitle: "Billing for SO-{n} — verify and send." Delivery address auto-filled in DocStrip notes.

**Send flow** (primary CTA "Send invoice"):
1. Opens `ModalSendInvoice` (width 580 px, Tier 1): channel tabs (WhatsApp · Email · Download only); recipient (buyer admin contact pre-filled, editable); message (editable default with invoice #, amount, due date); PDF preview tile.
2. On "Send now" → PATCH `status: 'sent'`, `sent_at`, `sent_channel`. **Locks GSTIN and HSN** at send time (`gstin_locked: true`, `hsn_locked: true`). Cannot change buyer, GSTIN, or product HSN codes after send.
3. Redirect to `/invoices/[id]` (read-only view with `doc-trail` strip).

**Edit after send** (route `/invoices/[id]/edit` on sent invoice):
- `modeChip` "Editing · was sent" (amber).
- `callout--warning` in TotalsStack: "Saving will bump to v{N} and notify the buyer. v{N-1} was viewed {X} days ago."
- Changed rows: `is-changed` class. Added rows: `is-added`. Removed rows: `is-removed` (crossed out).
- TotalsCard shows `was` values from v{N-1}.
- Autosave dot: amber. Footer draft-meta: "{N} unsaved changes · last edit {t} ago by {user}" in amber text.
- CTA: "Save & resend" → PATCH with `version: N+1`, `sent_at`, `sent_channel`. Notifies buyer (same channel as original send) with "Updated invoice" message.

**Mark as paid** (from read-only view, `rightActions`):
- Opens `ModalMarkInvoicePaid` (Tier 1): Amount received (pre-filled with outstanding balance; "Full amount" shortcut button); Payment date; Method (UPI / Bank transfer / Cheque / Cash); Reference (mono input); "Send receipt to buyer" checkbox.
- Partial payment allowed: invoice stays `status: 'sent'` with `amount_paid` updated; `amount_outstanding` reduced. Full payment → `status: 'paid'`.

**Void invoice** (from read-only view footer, `seller_admin` only):
- Opens `ModalVoidInvoice` (Tier 1, typed-confirm): `callout--danger` listing consequences; reason dropdown (Raised in error / Duplicate / Buyer cancelled / Other); typed input requiring exact `INV-{n}` to enable the Void button.
- On confirm → PATCH `status: 'void'`, `voided_at`, `void_reason`. GST reversal flag set for next Tally export. Invoice stays in ledger (soft-delete rules apply — no hard delete).

**Invoice statuses:**

| DB `status` | Label | Doc status chip tone | Editable? |
|---|---|---|---|
| `draft` | Draft | neutral (modeChip) | Yes |
| `sent` | Sent · awaiting payment | `doc-status--sent` (accent) | Edit allowed (bumps version) |
| `paid` | Paid | `doc-status--paid` (success) | No |
| `overdue` | Overdue | `doc-status--overdue` (danger) | Edit allowed (bumps version) |
| `void` | Void | `doc-status--void` (neutral muted) | No |

**Overdue auto-flag:** pg_cron job `0 9 * * *` → `UPDATE app.invoices SET status='overdue' WHERE status='sent' AND due_date < CURRENT_DATE`. UI: `doc-status--overdue` chip replaces `doc-status--sent`; `callout--danger` in TotalsStack: "Payment overdue by {N} days. ₹{amount} still outstanding."

**Tally export linkage:** Each invoice row in `app.invoices` has `tally_export_id` (FK to `app.tally_exports`). Status shows in `doc-trail` strip: "Tally export · pending" | "Tally export · synced {date}".

#### 4. Design System Rules

- Inherits all rules from EP-17-001.
- `doc-type-chip--invoice`: ember dot color.
- Tax rows in TotalsCard: intra-state renders two rows (`CGST {r/2}%` + `SGST {r/2}%`); inter-state renders one (`IGST {r}%`). Never show both patterns simultaneously.
- Doc status chips (on sent/paid/overdue/void view): `doc-status--{tone}` classes. Distinct from `StatusTag` used on landing pages — these are inline in the `DocTop` bar.
- `doc-trail` strip: single-line horizontal strip below `DocTitleRow`, light `cream-200` background, `cream-700` text, `·` separators. Visible only in sent/paid/overdue/void view modes.
- "Void invoice" footer CTA: `btn-ghost` + `color: var(--danger-700)`. Do NOT use `btn-danger` — destructive actions in the footer use ghost styling per design.
- `ModalVoidInvoice` Void button: `btn-disabled` until typed input matches doc number exactly. Enable with `btn-danger` class only after match.
- Edit-after-send banner: `callout--warning` (not `callout--danger`) — editing is allowed, just consequential.

#### 5. DB & API Integration

**Tables:** `app.invoices` · `app.invoice_items`

**Assumed schema** (verify against latest migration; add columns if missing):
```sql
-- app.invoices
CREATE TABLE IF NOT EXISTS app.invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  buyer_id          uuid NOT NULL REFERENCES app.buyers(id),
  order_id          uuid REFERENCES app.orders(id),    -- nullable, set from SO
  estimate_id       uuid REFERENCES app.estimates(id), -- nullable, set from direct estimate→invoice
  inv_number        text NOT NULL,                     -- INV-YYYY-NNNNN
  version           integer NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'draft',     -- draft|sent|paid|overdue|void
  invoice_date      date NOT NULL,
  due_date          date NOT NULL,
  buyer_po_ref      text,
  place_of_supply   text NOT NULL,
  gstin_locked      boolean DEFAULT false,
  hsn_locked        boolean DEFAULT false,
  discount_flat     numeric(12,2) DEFAULT 0,
  freight           numeric(12,2) DEFAULT 0,
  seller_note       text,
  amount_total      numeric(12,2),
  amount_paid       numeric(12,2) DEFAULT 0,
  amount_outstanding numeric(12,2),
  sent_at           timestamptz,
  sent_channel      text,
  voided_at         timestamptz,
  void_reason       text,
  tally_export_id   uuid,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  deleted_at        timestamptz
);

-- app.invoice_items
CREATE TABLE IF NOT EXISTS app.invoice_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES app.invoices(id),
  tenant_product_id uuid NOT NULL,
  sku             text NOT NULL,
  hsn_code        text NOT NULL,
  qty             integer NOT NULL,
  unit_price      numeric(12,2) NOT NULL,
  disc_pct        numeric(5,2) DEFAULT 0,
  tax_pct         numeric(5,2) NOT NULL,
  line_total      numeric(12,2) NOT NULL,
  created_at      timestamptz DEFAULT now()
);
```

**Key API routes:**
```
POST   /api/tenant/invoices                    ← create draft
PATCH  /api/tenant/invoices/[id]               ← auto-save
PATCH  /api/tenant/invoices/[id]/send          ← lock + send (sets gstin_locked, hsn_locked, status:'sent')
PATCH  /api/tenant/invoices/[id]/pay           ← record payment (body: { amount, date, method, reference })
PATCH  /api/tenant/invoices/[id]/void          ← void (body: { reason }; seller_admin only)
GET    /api/tenant/buyers/[id]/context         ← shared
GET    /api/tenant/products/search             ← shared
```

**RBAC:** `seller_admin` only on `PATCH /void`. `seller_assistant` can create, edit (pre-send), and record payments. Route `/invoices/[id]/edit` checks role from JWT; assistant attempting void → 403 + toast "Only admins can void invoices."

**Tally export:** Invoice fields map to Tally Sales Voucher CSV columns. `tally_export_id` written after export job completes (pg_cron or manual trigger from Exports cockpit page).

#### 6. Automated Verification Steps

- [ ] `/invoices/new` renders `DocComposerFrame` with `kind="invoice"`, DocStrip shows "Invoice date" + "Due date" labels, CTA reads "Send invoice".
- [ ] Selecting an intra-state buyer → TotalsCard shows `CGST {r/2}% + SGST {r/2}%` rows; switching to inter-state buyer → shows single `IGST {r}%` row.
- [ ] `/invoices/new?fromOrder=[id]` → lines, buyer, and place-of-supply pre-filled from SO; DocTitleRow subtitle references SO number.
- [ ] "Send invoice" opens `ModalSendInvoice` with channel tabs; "Send now" sets `status: 'sent'`, `gstin_locked: true`, `hsn_locked: true`, redirects to read-only view.
- [ ] Read-only view shows `doc-trail` strip; "Mark as paid", "Edit invoice", "Void invoice" actions available.
- [ ] `ModalMarkInvoicePaid`: partial payment leaves `status: 'sent'` with `amount_outstanding` reduced; full payment sets `status: 'paid'`.
- [ ] `/invoices/[id]/edit` on a sent invoice: `modeChip` "Editing · was sent" visible; `callout--warning` in TotalsStack; changed rows flagged; "Save & resend" CTA active.
- [ ] `ModalVoidInvoice`: Void button disabled until typed input matches `INV-{n}` exactly; only `seller_admin` role can open the modal (assistant sees "Only admins can void" toast).
- [ ] Overdue invoice (due_date < today, status='sent'): `doc-status--overdue` chip shown in DocTop; `callout--danger` in TotalsStack.
- [ ] Feature flag `df_invoices: false` → route returns `FlagOffState`; `df_sales_orders` flag unaffected.
- [ ] Cross-tenant test: fetching `/invoices/[id]` for an invoice belonging to a different tenant returns 403 (RLS + JWT check).

---

## Global Rules (continued from EP-13/EP-14)

**8. Document composer routes own a full content-area route.**  
`DocComposerFrame` is a sibling to `PageWrap` — it does NOT nest inside it. The 1440 px cap is applied inside `DocComposerFrame` using `max-w-[1440px] mx-auto` on the inner wrapper. The sidebar is always visible (document creation is a cockpit action).

**9. Auto-save is non-blocking.**  
The auto-save PATCH fires in the background. It must never block user input or show a loading spinner mid-typing. On network failure: show amber dot + "Couldn't save — retrying" for 5 s, then retry once. On second failure: show inline error toast, keep draft in memory.

**10. Draft lifecycle.**  
Drafts older than 30 days with no lines are auto-purged by pg_cron (`DELETE FROM app.estimates WHERE status='draft' AND lines_count=0 AND created_at < now() - interval '30 days'`). Drafts with lines are retained indefinitely until discarded by the user.

**11. GST compliance on send.**  
At `send` time, the API validates: buyer GSTIN non-null, all lines have HSN codes, place of supply is set. Any failure → 422 with field-level errors surfaced inline (red border on the DocStrip field + `field-hint` error text). The CTA does not close the modal on validation failure.

**12. Edit-after-send version bump.**  
When `status: 'sent'` invoice or estimate is edited and saved, `version` increments by 1. The old PDF is marked superseded (not deleted). Buyer notification is always sent (same channel as original send). Audit log records `{ prev_version, new_version, changed_by, changed_at }`.

---

### EP-17-004 — Estimate Detail: Read-only Composer View

> **Supersedes:** EP-15-002 (deprecated). **Requires:** EP-17-001 (DocComposerFrame + shared shell). **New shared component:** `DocStatusBand` (defined here; reused by EP-17-005 and EP-17-006).  
> **Mode:** `DocComposerFrame mode="view" kind="estimate"` — all form fields disabled; no auto-save; `DocStatusBand` pinned at top.

#### 1. Objective & User Value

- **As a** seller viewing a sent or draft estimate, **I want** the same 3-column layout I used to create it — now in read-only mode — **so that** I can review lines, totals, and buyer credit headroom without re-learning a different page format, and take lifecycle actions (convert, void, duplicate) from the same surface.

#### 2. Common Layout

```
DocComposerFrame (mode="view", kind="estimate")
  DocTop
    breadcrumb: Estimates / EST-{n}
    DocTitleRow: doc-type-chip--estimate · doc number · buyer name
    rightActions (left→right):
      "Edit estimate"   variant="default" (accent/filled) · lucide/Edit2 16px
                        → router.push('/estimates/[id]/edit')
                        hidden when status ∈ { converted, expired, void }
      "Convert to SO"   variant="outline" · lucide/ArrowRightCircle 16px
                        → ModalConvertEstimateToSO (EP-17-001)
                        visible only when status="sent"
      "Duplicate"       variant="ghost" · lucide/Copy 16px
      "Void estimate"   variant="ghost" className="text-destructive"
                        seller_admin only · visible when status ∈ { draft, sent }

  DocStatusBand  ← sticky, top=[DocTop height], 40px, doc-status-band token class
    [status chip]  [primary timestamp]  [viewed indicator]  [validity]  [spacer→]  [tally]
    ─────────────────────────────────────────────────────────────────────────────────────────
    draft:      grey  "Draft"      · "Not yet sent"                    · validity n/a
    sent:       green "Sent"       · sent_at formatted                  · "Viewed by {name}" or "Not yet viewed"  · "Valid until {date}" neutral/amber(≤3d)/red(expired)
    converted:  purple "Converted" · "→ SO-{n}" (link to that SO)
    expired:    red    "Expired"   · expiry date · "0 days remaining"
    void:       dark   "Void"      · voided_at

  [3-column body — read-only]
    col-1  BuyerCard
             read-only: no "Swap buyer" button, no search input
             CreditBar: renders with previewPct=0 (document already committed)
    col-2  LinesTable
             read-only: no LineAddRow · no drag handles · no delete icon per row
             all qty/rate/discount inputs → static text (field-value class)
             stock column absent
    col-3  TotalsCard (static — no editable discount input)
           InsightsCard (read-only — no Swap pricelist action)
```

#### 3. Acceptance Criteria

**AC1 — Route and data fetch**
- `GET /estimates/[id]` fetches `app.estimates JOIN app.estimate_items JOIN app.buyers` scoped to `tenant_id` from JWT.
- `DocComposerFrame` receives `mode="view"` + `kind="estimate"`. No `useAutoSave` hook mounted. No save CTA in footer.
- All `<input>`, `<select>`, `<textarea>` inside the frame have `disabled` or `readOnly`; pointer-events on DocStrip date fields set to `none`.

**AC2 — DocStatusBand rendering**
- Band is `position: sticky; top: {DocTop height}px; z-index: 10` — scrolls with page header pinned, body scrolls beneath.
- Status chip classes: `doc-status--draft` (grey) · `doc-status--sent` (green) · `doc-status--converted` (purple) · `doc-status--expired` (red) · `doc-status--void` (dark grey).
- "Viewed by {name}" shown only when `viewed_at` is non-null. Source: delivery receipt from WhatsApp/email channel.
- Validity countdown: neutral text when > 3 days remaining; `text-amber-600` when 1–3 days; `text-destructive` when expired.

**AC3 — Edit button behaviour**
- Button uses `<Button variant="default">` (filled, accent background per design tokens — not outline, not ghost).
- `router.push('/estimates/[id]/edit')` → composer opens per EP-17-001 edit-mode rules.
- When `status="sent"`: clicking navigates to edit; the composer (EP-17-001 AC for edit-after-send) shows `callout--warning` ("Saving will bump to v{n+1}").
- Button is **not rendered** (removed from DOM, not just disabled) when `status ∈ { converted, expired, void }`.

**AC4 — Read-only field rendering**
- DocStrip date fields rendered as `<span className="field-value">` (same font/size as input text, no border, no cursor).
- LinesTable rows: product name, HSN code, qty, unit, rate, discount %, line total — all `<td>` static text. No inline edit on click.
- TotalsCard: subtotal, discount, taxable amount, GST rows, grand total — static `<p>` / `<span>`. No discount `<input>`.
- InsightsCard: "Pricelist applied" chip (read-only — no Swap link). Scheme savings. Credit status.

**AC5 — Convert to SO action**
- "Convert to SO" visible only when `status="sent"`.
- Opens `ModalConvertEstimateToSO` (EP-17-001). On confirm → `PATCH /estimates/[id]/convert` body `{ lines, delivery_date }` → creates `app.orders` record, sets `estimates.status='converted'`, `estimates.converted_to_order_id`. Redirect to `/sales-orders/[new_id]`.
- DocStatusBand updates immediately (optimistic): purple "Converted → SO-{n}" chip.

**AC6 — Void action**
- "Void estimate" visible to `seller_admin` when `status ∈ { draft, sent }`.
- Opens a Tier-1 confirmation dialog (300 px, single "Confirm void" primary). On confirm → `PATCH /estimates/[id]/void`.
- `seller_assistant` role: button not rendered. Direct API call by assistant → 403.

**AC7 — Duplicate action**
- "Duplicate" → `POST /estimates/[id]/duplicate` → returns `{ id: new_id }`. Redirect to `/estimates/[new_id]/edit` (new draft in composer).

**AC8 — Feature flags & cross-tenant**
- `df_order_management` AND `df_estimates` both truthy required. Either false → `FlagOffState`.
- Fetching another tenant's estimate → 403 (RLS + JWT check).

#### 4. Design System Rules

- `DocStatusBand` token class `doc-status-band`: `background: var(--surface-subtle); border-bottom: 1px solid var(--border-default); height: 40px; display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-6)`. Status chip font: `text-xs font-medium`. Timestamps: `text-sm text-secondary`. Tally item: right-aligned via `ml-auto`.
- Edit button: `<Button variant="default" size="sm">` + icon `lucide/Edit2` 16px left of label. Label "Edit estimate".
- Convert button: `<Button variant="outline" size="sm">` + icon `lucide/ArrowRightCircle` 16px left. Label "Convert to SO".
- Duplicate button: `<Button variant="ghost" size="sm">` + icon `lucide/Copy` 16px. Label "Duplicate".
- Void button: `<Button variant="ghost" size="sm" className="text-destructive">`. No icon. Label "Void estimate".
- Zero-lines view: LinesTable body shows `<tr className="empty-table-row"><td colSpan={n}>No lines added.</td></tr>`.

#### 5. DB / API Contracts

```
GET  /api/tenant/estimates/[id]
     → app.estimates JOIN app.estimate_items JOIN app.buyers
     → { id, doc_number, status, version, sent_at, viewed_at, valid_until,
          voided_at, converted_to_order_id,
          buyer: { id, name, gstin, city, credit_limit, credit_used },
          items: [{ product_name, hsn, qty, unit, rate, discount_pct, line_total }],
          totals: { subtotal, discount_amt, taxable, gst_rows: [...], grand_total } }

PATCH /api/tenant/estimates/[id]/convert
     body: { lines: [{ item_id, qty }], delivery_date: ISO-date }
     → creates app.orders, sets estimates.status='converted'
     → returns { order_id }

PATCH /api/tenant/estimates/[id]/void
     body: { confirmed: true }
     → estimates.status='void', voided_at=now()

POST  /api/tenant/estimates/[id]/duplicate
     → clones estimate + all items into new draft
     → returns { id: new_id }
```

#### 6. Automated Verification Steps

- [ ] `GET /estimates/[id]` for `draft` status → DocStatusBand shows grey "Draft" chip + "Not yet sent"; no validity date shown.
- [ ] `GET /estimates/[id]` for `sent` status → green "Sent" chip + `sent_at` timestamp + "Viewed by {name}" if `viewed_at` non-null.
- [ ] No `<input>` or `<textarea>` inside `DocComposerFrame mode="view"` lacks `disabled` or `readOnly` attribute (snapshot assertion).
- [ ] "Edit estimate" button: rendered when `status='sent'`; **not** rendered when `status='converted'`.
- [ ] Clicking "Edit estimate" on `sent` estimate → navigates to `/estimates/[id]/edit`; composer shows `callout--warning`.
- [ ] "Convert to SO" button only rendered when `status='sent'`; triggers `ModalConvertEstimateToSO` on click.
- [ ] "Void estimate" button not rendered for `seller_assistant` role; direct `PATCH /void` by assistant → 403.
- [ ] `df_estimates: false` → route returns `FlagOffState` component.
- [ ] Cross-tenant: fetching another tenant's estimate ID → 403.

---

### EP-17-005 — Sales Order Detail: Read-only Composer View

> **Supersedes:** EP-14-008 (deprecated). **Requires:** EP-17-001 (DocComposerFrame). **Reuses:** `DocStatusBand` (EP-17-004).  
> **Mode:** `DocComposerFrame mode="view" kind="so"` — all form fields disabled; no auto-save; `DocStatusBand` pinned at top with SO-specific status chips and lifecycle CTAs.

#### 1. Objective & User Value

- **As a** seller viewing an existing sales order, **I want** the same 3-column composer layout I used to create it — now in read-only mode — **so that** I can review lines, delivery details, and buyer info and take lifecycle actions (dispatch, deliver, cancel) from a familiar surface rather than a different-format detail page.

#### 2. Common Layout

```
DocComposerFrame (mode="view", kind="so")
  DocTop
    breadcrumb: Sales Orders / SO-{n}
    DocTitleRow: doc-type-chip--so · SO number · buyer name
    rightActions (left→right):
      "Edit order"      variant="default" (accent/filled) · lucide/Edit2 16px
                        → router.push('/sales-orders/[id]/edit')
                        visible when status ∈ { draft, received, confirmed }
                        hidden when status ∈ { dispatched, delivered, cancelled }
      "Dispatch"        variant="outline" · lucide/Truck 16px
                        → ModalDispatch
                        visible only when status="confirmed"
      "Mark delivered"  variant="outline" · lucide/CheckCircle2 16px
                        → inline confirm (no modal)
                        visible only when status="dispatched"
      "Cancel order"    variant="ghost" className="text-destructive"
                        seller_admin only
                        visible when status ∈ { draft, received, confirmed }

  DocStatusBand  ← sticky, same doc-status-band token class (EP-17-004)
    [status chip]  [timestamp]  [delivery info]  [spacer→]  [tally export]
    ────────────────────────────────────────────────────────────────────────
    draft:      grey    "Draft"      · "Not yet confirmed"
    received:   blue    "Received"   · received_at
    confirmed:  green   "Confirmed"  · confirmed_at · "Delivery expected {delivery_date}"
    dispatched: amber   "Dispatched" · dispatched_at · carrier/notes if set
    delivered:  green   "Delivered"  · delivered_at
    cancelled:  red     "Cancelled"  · cancelled_at · reason

    trailing: "Tally: Exported {date}" (green dot) or "Tally: Not exported" (grey)

  [3-column body — read-only]
    col-1  BuyerCard (read-only — no Swap)
    col-2  LinesTable (read-only — no add/edit/delete; stock column hidden)
    col-3  TotalsCard (read-only) + InsightsCard (read-only)
```

#### 3. Acceptance Criteria

**AC1 — Route and data fetch**
- `GET /sales-orders/[id]` fetches `app.orders JOIN app.order_items JOIN app.buyers` scoped to tenant.
- `DocComposerFrame` receives `mode="view"` + `kind="so"`. No auto-save. All fields disabled.

**AC2 — DocStatusBand status progression**
- Chips: `doc-status--draft` (grey) · `doc-status--received` (blue) · `doc-status--confirmed` (green) · `doc-status--dispatched` (amber) · `doc-status--delivered` (green-dark) · `doc-status--cancelled` (red).
- For `confirmed`: trailing text "Delivery expected {delivery_date}" in neutral colour; no urgency colour applied (delivery is not a payment deadline).
- For `dispatched`: if `carrier` field is set → append " via {carrier}".
- Tally export item: right-aligned via `ml-auto`. If `tally_export_id` is set → "Tally: Exported {export_date}" with green dot; otherwise "Tally: Not exported" with grey dot.

**AC3 — Edit button and edit-mode constraints**
- Button uses `<Button variant="default">` (accent, filled). Icon `lucide/Edit2` 16px. Label "Edit order".
- Hidden (not disabled) when `status ∈ { dispatched, delivered, cancelled }`.
- `router.push('/sales-orders/[id]/edit')` → composer opens per EP-17-002 edit-mode rules:
  - `status='received'` → full edit allowed (buyer swap + lines).
  - `status='confirmed'` → buyer card locked ("Swap buyer" absent); lines editable.

**AC4 — Dispatch action**
- "Dispatch" button visible only when `status='confirmed'`.
- Opens `ModalDispatch` (Tier-1, 480 px): delivery notes textarea (optional), carrier input (optional), "Send dispatch notification to buyer" checkbox (default: on). Primary CTA: "Dispatch order".
- On confirm → `PATCH /orders/[id]/dispatch` body `{ notes, carrier, notify_buyer }` → sets `status='dispatched'`, `dispatched_at=now()`.
- DocStatusBand updates optimistically: amber "Dispatched" chip replaces green "Confirmed".

**AC5 — Mark Delivered action**
- "Mark delivered" button visible only when `status='dispatched'`.
- No modal — inline `data-confirm` pattern: a `<AlertDialog>` with title "Mark SO-{n} as delivered?" and primary "Mark delivered". On confirm → `PATCH /orders/[id]/deliver` → sets `status='delivered'`, `delivered_at=now()`.

**AC6 — Cancel Order action**
- "Cancel order" visible to `seller_admin` when `status ∈ { draft, received, confirmed }`.
- Opens `ModalCancelOrder` (Tier-1, 400 px): reason dropdown (Buyer request / Out of stock / Duplicate order / Other) + optional notes textarea. Primary (destructive): "Cancel order".
- On confirm → `PATCH /orders/[id]/cancel` body `{ reason, notes }` → sets `status='cancelled'`, releases stock reservation via `app.release_order_reservation(order_id)` RPC.
- `seller_assistant` → button not rendered; direct API call → 403.

**AC7 — Backorder indicator**
- If `has_backorder=true`, DocStatusBand (for `confirmed`/`dispatched` states) shows a `callout--warning` inline note: "Contains backorder lines — buyer notified."

**AC8 — Feature flags & cross-tenant**
- `df_order_management` AND `df_sales_orders` both truthy required.
- Cross-tenant fetch → 403.

#### 4. Design System Rules

- SO status chip token classes: `doc-status--draft` · `doc-status--received` · `doc-status--confirmed` · `doc-status--dispatched` · `doc-status--delivered` · `doc-status--cancelled`. All follow same `doc-status-band` strip layout as EP-17-004.
- "Edit order": `<Button variant="default" size="sm">` + `lucide/Edit2` 16px.
- "Dispatch": `<Button variant="outline" size="sm">` + `lucide/Truck` 16px. Label "Dispatch".
- "Mark delivered": `<Button variant="outline" size="sm">` + `lucide/CheckCircle2` 16px. Label "Mark delivered".
- "Cancel order": `<Button variant="ghost" size="sm" className="text-destructive">`. No icon. Label "Cancel order".
- `ModalDispatch`: standard `DialogHeader` / `DialogBody` / `DialogFooter` spacing per spacing standard in root `CLAUDE.md`. Width 480 px.
- `ModalCancelOrder`: same dialog primitives. Width 400 px.

#### 5. DB / API Contracts

```
GET  /api/tenant/orders/[id]
     → app.orders JOIN app.order_items JOIN app.buyers
     → { id, doc_number, status, received_at, confirmed_at, dispatched_at,
          delivered_at, cancelled_at, delivery_date, carrier, has_backorder,
          tally_export_id,
          buyer: { id, name, gstin, city },
          items: [{ product_name, hsn, qty, unit, rate, discount_pct, line_total,
                    on_hand_at_confirm }],
          totals: { subtotal, discount_amt, taxable, gst_rows, grand_total } }

PATCH /api/tenant/orders/[id]/dispatch
     body: { notes?: string, carrier?: string, notify_buyer: boolean }
     → orders.status='dispatched', dispatched_at=now()

PATCH /api/tenant/orders/[id]/deliver
     → orders.status='delivered', delivered_at=now()

PATCH /api/tenant/orders/[id]/cancel
     body: { reason: string, notes?: string }
     → orders.status='cancelled', cancelled_at=now()
     → calls app.release_order_reservation(order_id)
     → returns { released_qty_by_product: [...] }
```

#### 6. Automated Verification Steps

- [ ] `GET /sales-orders/[id]` for `confirmed` SO → DocStatusBand shows green "Confirmed" + `confirmed_at` + "Delivery expected {date}".
- [ ] `GET /sales-orders/[id]` for `dispatched` SO with `carrier='BlueDart'` → DocStatusBand shows amber "Dispatched · {date} via BlueDart".
- [ ] "Edit order" rendered for `status='received'` and `status='confirmed'`; **not** rendered for `status='dispatched'`.
- [ ] `/sales-orders/[id]/edit` for `confirmed` SO → BuyerCard "Swap buyer" button absent; LinesTable editable.
- [ ] "Dispatch" button rendered only for `status='confirmed'`; opens `ModalDispatch`.
- [ ] "Mark delivered" rendered only for `status='dispatched'`; PATCH sets `delivered_at`.
- [ ] "Cancel order" not rendered for `seller_assistant` role; PATCH `/cancel` by assistant → 403.
- [ ] PATCH cancel → `app.release_order_reservation` called; `tenant_inventory.quantity_available` increases for cancelled lines (integration test).
- [ ] `has_backorder=true` → `callout--warning` note visible in DocStatusBand.
- [ ] All fields inside `DocComposerFrame mode="view"` have `disabled` attribute (snapshot test).
- [ ] Cross-tenant fetch → 403.

---

### EP-17-006 — Invoice Detail: Read-only Composer View

> **Supersedes:** EP-16-002 (deprecated). **Requires:** EP-17-001 (DocComposerFrame). **Reuses:** `DocStatusBand` (EP-17-004), `ModalSendInvoice` + `ModalMarkInvoicePaid` + `ModalVoidInvoice` (EP-17-003).  
> **Mode:** `DocComposerFrame mode="view" kind="invoice"` — all form fields disabled; no auto-save; `DocStatusBand` with due-date urgency signals pinned at top.

#### 1. Objective & User Value

- **As a** seller viewing an existing invoice, **I want** the same 3-column composer layout I used to create it — in read-only mode — **so that** I can verify GST split, line items, and totals, take payment actions, and send reminders from the same familiar surface without re-learning a different page format.

#### 2. Common Layout

```
DocComposerFrame (mode="view", kind="invoice")
  DocTop
    breadcrumb: Invoices / INV-{n}
    DocTitleRow: doc-type-chip--invoice · invoice number · buyer name
                 if version > 1: amber Badge "v{n}" inline after doc number
    rightActions (left→right):
      "Edit invoice"    variant="default" (accent/filled) · lucide/Edit2 16px
                        → router.push('/invoices/[id]/edit')
                        visible when status ∈ { draft, sent, overdue }
                        hidden when status ∈ { paid, void }
      "Mark as paid"    variant="outline" · lucide/BadgeCheck 16px
                        → ModalMarkInvoicePaid
                        visible when status ∈ { sent, overdue }
      "Send reminder"   variant="ghost" · lucide/Bell 16px
                        → ModalSendInvoice (reminder pre-fill)
                        visible when status ∈ { sent, overdue }
      "Void invoice"    variant="ghost" className="text-destructive"
                        seller_admin only
                        visible when status ∈ { draft, sent, overdue }

  DocStatusBand  ← sticky, doc-status-band token class
    [status chip]  [sent timestamp]  [viewed]  [due-date countdown]  [outstanding]  [spacer→]  [tally]
    ───────────────────────────────────────────────────────────────────────────────────────────────────
    draft:    grey   "Draft"    · "Not yet sent"
    sent:     green  "Sent"     · sent_at  · "Viewed by {name}" or "Not yet viewed"
                                · "Due {date}" neutral | "Due in {n} days" amber(≤7d)
                                · "₹{n} outstanding" if partial payments exist
    overdue:  red    "Overdue"  · "Overdue by {n} days" text-destructive
                                · "₹{n} outstanding"
    paid:     green  "Paid"     · paid_at  · method (UPI / Bank / Cheque / Cash)
    void:     dark   "Void"     · voided_at

    trailing: "Tally: Exported {date}" (green dot) or "Tally: Not exported" (grey)

  [3-column body — read-only]
    col-1  BuyerCard (read-only — no Swap; GSTIN locked after send)
    col-2  LinesTable (read-only — HSN codes locked after send)
    col-3  TotalsCard
             intra-state buyer → CGST {r/2}% + SGST {r/2}% rows (static)
             inter-state buyer → IGST {r}% row (static)
           InsightsCard (read-only)
```

#### 3. Acceptance Criteria

**AC1 — Route and data fetch**
- `GET /invoices/[id]` fetches `app.invoices JOIN app.invoice_items JOIN app.buyers` scoped to tenant.
- `DocComposerFrame` receives `mode="view"` + `kind="invoice"`. No auto-save. All fields disabled.

**AC2 — DocStatusBand with due-date urgency**
- **Draft:** grey "Draft" chip + "Not yet sent".
- **Sent:** green "Sent" chip + `sent_at` + viewed status. Due-date countdown:
  - > 7 days remaining → neutral text "Due {date}".
  - 1–7 days remaining → `text-amber-600` "Due in {n} days".
  - Due today → `text-amber-600` "Due today".
- **Overdue:** red `doc-status--overdue` chip + `text-destructive` "Overdue by {n} days". Amount outstanding shown.
- **Paid:** green "Paid" chip + `paid_at` + payment method (e.g., "UPI – Ref: {ref}").
- **Void:** dark "Void" chip + `voided_at`.
- Partial payment indicator: "₹{amount_outstanding} outstanding" rendered between viewed and tally items.

**AC3 — Edit button**
- Visible when `status ∈ { draft, sent, overdue }`. Hidden for `paid`, `void`.
- `router.push('/invoices/[id]/edit')` → composer opens per EP-17-003 edit-mode rules.
- Navigating to edit on a `sent` or `overdue` invoice → composer shows `callout--warning` ("Saving will bump to v{n+1} — buyer will be notified.").

**AC4 — Version badge**
- If `version > 1`, `DocTitleRow` subtitle area shows `<Badge className="bg-amber-100 text-amber-700 border border-amber-300">v{version}</Badge>` immediately after the doc number chip.

**AC5 — Mark as paid**
- "Mark as paid" visible when `status ∈ { sent, overdue }`.
- Opens `ModalMarkInvoicePaid` (EP-17-003): pre-fills `amount` = current `amount_outstanding`, date = today.
- Full payment (amount = total): `PATCH /invoices/[id]/pay` → `status='paid'`, `paid_at=now()`, `amount_outstanding=0`. DocStatusBand → green "Paid" chip.
- Partial payment (amount < total): same PATCH → `amount_outstanding` decremented, `status` unchanged (still `sent`/`overdue`). DocStatusBand shows updated "₹{remaining} outstanding".

**AC6 — Send reminder**
- "Send reminder" visible when `status ∈ { sent, overdue }`.
- Opens `ModalSendInvoice` (EP-17-003) with pre-populated message: "Reminder: Invoice INV-{n} for ₹{grand_total} is due on {due_date}. Please arrange payment at your earliest convenience."
- On send → `PATCH /invoices/[id]/remind` → logs to `app.audit_log`, sets `last_reminder_at=now()`.

**AC7 — Void invoice**
- "Void invoice" visible to `seller_admin` when `status ∈ { draft, sent, overdue }`.
- Opens `ModalVoidInvoice` (EP-17-003) — typed-confirm (type "INV-{n}" exactly to enable "Void invoice" primary).
- On confirm → `PATCH /invoices/[id]/void` → `status='void'`, `voided_at=now()`.
- `seller_assistant` → button not rendered; direct API call → 403.

**AC8 — GST rows are static**
- After `gstin_locked=true` (set at first send), buyer GSTIN state code is frozen. TotalsCard reads the locked intra/inter-state determination — does not recompute from live buyer data. This ensures the sent invoice view always matches the PDF.

**AC9 — Feature flags & cross-tenant**
- `df_order_management` AND `df_invoices` both truthy required.
- Cross-tenant fetch → 403.

#### 4. Design System Rules

- Invoice status chip tokens: `doc-status--draft` · `doc-status--sent` · `doc-status--overdue` · `doc-status--paid` · `doc-status--void`.
- Due-date urgency: amber `text-amber-600` for 1–7 days; `text-destructive` for overdue. Both are `text-sm` in DocStatusBand.
- "Edit invoice": `<Button variant="default" size="sm">` + `lucide/Edit2` 16px. Label "Edit invoice".
- "Mark as paid": `<Button variant="outline" size="sm">` + `lucide/BadgeCheck` 16px. Label "Mark as paid".
- "Send reminder": `<Button variant="ghost" size="sm">` + `lucide/Bell` 16px. Label "Send reminder".
- "Void invoice": `<Button variant="ghost" size="sm" className="text-destructive">`. No icon. Label "Void invoice".
- Version badge: `<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 font-medium">v{n}</Badge>`. Renders only when `version > 1`.
- GST rows in TotalsCard (read-only): same token classes `tax-row--cgst`, `tax-row--sgst`, `tax-row--igst` as in composer; rendered as `<tr>` with static `<td>` text.

#### 5. DB / API Contracts

```
GET  /api/tenant/invoices/[id]
     → app.invoices JOIN app.invoice_items JOIN app.buyers
     → { id, doc_number, status, version, sent_at, viewed_at, due_date,
          paid_at, payment_method, payment_reference, amount_outstanding,
          voided_at, last_reminder_at, tally_export_id,
          gstin_locked, hsn_locked, place_of_supply,
          buyer: { id, name, gstin, city, gstin_state_code },
          items: [{ product_name, hsn, qty, unit, rate, discount_pct, line_total }],
          totals: { subtotal, discount_amt, taxable,
                    gst_rows: [{ label, rate_pct, amount }],
                    grand_total } }

PATCH /api/tenant/invoices/[id]/pay
     body: { amount: number, date: ISO-date, method: string,
             reference?: string, send_receipt: boolean }
     → updates paid_at, amount_outstanding, status (paid if amount_outstanding=0)

PATCH /api/tenant/invoices/[id]/remind
     body: { channel: 'whatsapp'|'email', message: string, recipient: string }
     → appends to app.audit_log, sets last_reminder_at=now()

PATCH /api/tenant/invoices/[id]/void
     body: { confirmed: true }
     → status='void', voided_at=now()
```

#### 6. Automated Verification Steps

- [ ] `GET /invoices/[id]` for `sent` invoice due in 5 days → DocStatusBand shows amber "Due in 5 days" text.
- [ ] `GET /invoices/[id]` for `overdue` invoice → red "Overdue" chip + `text-destructive` "Overdue by {n} days"; "Edit invoice" button still rendered.
- [ ] "Edit invoice" button not rendered when `status='paid'` or `status='void'`.
- [ ] `version=2` invoice → amber `Badge "v2"` visible in DocTitleRow.
- [ ] Intra-state buyer → TotalsCard shows CGST + SGST rows (static); inter-state → IGST row (static). Values match `totals.gst_rows` from API.
- [ ] `ModalMarkInvoicePaid` pre-fills amount field from `amount_outstanding`.
- [ ] Partial payment → `amount_outstanding` decremented; `status` unchanged; DocStatusBand shows "₹{remaining} outstanding".
- [ ] Full payment → `status='paid'`; DocStatusBand switches to green "Paid" + `paid_at`.
- [ ] "Send reminder" opens `ModalSendInvoice` with pre-populated reminder message.
- [ ] "Void invoice" not rendered for `seller_assistant`; typed-confirm requires exact match of "INV-{n}" before primary CTA is enabled.
- [ ] `df_invoices: false` → route renders `FlagOffState`.
- [ ] Cross-tenant fetch → 403.

---

## Global Rules (continued)

**13. `DocComposerFrame` `mode` prop governs interactivity.**  
The frame accepts three modes: `"create"` (new document, auto-save active, footer CTA = primary send/confirm), `"edit"` (existing document, auto-save active, diff markers visible, version bump warning), `"view"` (read-only, no auto-save, no footer CTA, `DocStatusBand` rendered). All three modes use the same three-column layout. No per-mode duplication of columns or component trees.

**14. `DocStatusBand` is view-mode only.**  
`DocStatusBand` renders only when `mode="view"`. In create/edit mode, date fields live in `DocStrip` and the status is implicit from the composer state. Do not render `DocStatusBand` in create or edit mode. The band is `position: sticky` at `top: {DocTop height}` so it remains visible during vertical scroll of the three-column body.

---

*End of DealFlow_User-Stories_v2.md*
