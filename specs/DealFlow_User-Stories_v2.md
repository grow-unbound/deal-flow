# DealFlow — Cockpit Layout & Presentation Backlog (v2)

**Spec version:** DealFlow_Product-Spec_v1 · Layout revision 2026-05-28  
**Extends:** `DealFlow_User-Stories_v1.md` (EP-01 through EP-12 remain unchanged)  
**Story format:** 5-part BDD schema — Objective · Common Layout · Acceptance Criteria · Design System · Verification  
**Design source of truth:**
- Landing pages → `design-system/Brands Landing v3.html` + `design-system/v3/Modules.jsx` + `design-system/v2/Shared.jsx`
- Detail pages → `design-system/Detail Pages v2.html` + `design-system/v2/DetailsV2.jsx`

**Total stories:** 16 across 2 epics

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
| EP-13 | Cockpit Landing Pages (v3 layout) | `df_brand_product_master` · `df_customer_master` · `df_cohorts` · `df_catalog_publishing` · `df_order_management` · `df_pricing_engine` | 8 |
| EP-14 | Cockpit Detail Pages (v2 layout) | same as above, per entity | 8 |

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

### EP-13-005 — Orders Landing Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** a live order workboard showing every open order with status, GMV, and dispatch urgency, **so that** I can process pending dispatches and resolve holds without switching tools.

#### 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Transactions" · title="Orders"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     8 columns — see §4
```

Route: `app/(seller)/orders/page.tsx`  
Feature flag gate: `df_order_management`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_order_management`.
- KPIs from `app.orders` for the current month.
- "Pending dispatch" = orders with `status = 'confirmed'` (awaiting physical dispatch).
- "On hold" = orders with `status = 'on_hold'` (usually credit limit exceeded).
- "Needs attention" callout: orders with `status.tone === 'warning' || status.tone === 'danger'`, max 3.
- "Biggest tickets" callout: top 2 orders by GMV this month.
- "In motion" callout: orders with `status = 'dispatched'` (in transit), max 2.
- Status filter chips: `['All', 'Confirmed', 'In transit', 'Delivered', 'Hold', 'Cancelled']` — client-side filter.
- Default sort: "Recent first" (by `placed_at` desc).
- Clicking an order row navigates to `/orders/{id}`.
- "Record an order" CTA opens the new order dialog.
- "Sync to Tally" CTA triggers the Tally CSV export flow (EP-09).

#### 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Transactions"` |
| `title` | `"Orders"` |
| `subtitle` | `"28 orders this month from 22 buyers. 4 pending dispatch, 1 on hold, 18 already delivered. The list is your workboard."` (live counts) |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Sync to Tally", icon: <RefreshCw size={13}/> }` |
| `primary` | `"Record an order"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Orders · MTD` | Count of orders this month | `↑ +{growth}% vs last month` | default |
| 2 | `GMV` | Sum of `orders.total` MTD | `"AOV {aov}"` | `accent` |
| 3 | `Pending dispatch` | Count where `status = 'confirmed'` | `"awaiting confirmation"` | `warn` |
| 4 | `On hold` | Count where `status = 'on_hold'` | `"credit limit issue"` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Needs attention"` | count | Buyer `EntityAvatar` (32 px) + buyer name + `"{orderId} · {status.label} · {deliveryCity}"` + `StatusTag` trailing |
| 2 | `info` | `"Biggest tickets"` | `"this month"` | Buyer avatar + buyer name + `"{orderId} · {items} items · {city}"` + INR GMV trailing |
| 3 | `opportunity` | `"In motion"` | `"dispatching now"` | Buyer avatar + buyer name + `"{orderId} · {city} · {gmv}"` + `StatusTag` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"Showing {n} of {total}"` |
| `searchPlaceholder` | `"Search order ID, buyer, city…"` |
| `chips` | `['All', 'Confirmed', 'In transit', 'Delivered', 'Hold', 'Cancelled']` |
| `activeChip` | `'All'` |
| `sortBy` | `"Recent first"` |
| `hideViewToggle` | `true` |

**Table — 8 columns:**

| Column | Content |
|--------|---------|
| Order | Order ID, `font-mono text-[12px] text-cream-800` |
| Buyer | `EntityAvatar` (30 px) + buyer name (`text-[13px] font-medium`) |
| Delivery | Delivery address, `text-[12.5px]` |
| Items | Count, `.num` |
| GMV | `.num-display` INR, `.num` |
| Status | `StatusTag` |
| Placed | Date, `font-mono text-[12px] text-cream-700` |
| › | Chevron |

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=orders/landing
npm run test:integration -- --testPathPattern=orders-landing-page
# - Pending dispatch count = orders with status 'confirmed'
# - "Hold" chip filters to on_hold orders only
# - AOV = GMV / order count (no division by zero guard)
# - Order row click → /orders/{id}
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

### EP-14-008 — Order Detail Page

#### 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to open an order and see its full line-item breakdown, track it through the dispatch workflow, and pull the invoice — **so that** I can confirm, dispatch, or resolve a hold on a single order without touching the list page.

#### 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Orders › {orderId}" · order avatar · 4 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     3 tabs — Items · Timeline · Invoice
  └── tab-body       Items tab active by default
```

Route: `app/(seller)/orders/[id]/page.tsx`  
Feature flag gate: `df_order_management`

#### 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `app.orders` + `app.order_items` by `id`; 404 if not found or belongs to another tenant.
- **Items tab (default):** Full line-item table for the order. Columns: Product · Brand · Qty · Unit price · Line total · Stock status. Read-only; editing line items is not permitted once an order is past `draft` status.
- **Timeline tab:** Visual status progression bar (`draft → received → confirmed → dispatched → delivered`) with the current step highlighted. Below it: a chronological event log of every status change, note, or system event on this order — actor name, timestamp, optional note. `seller_admin` can add a manual note.
- **Invoice tab:** Invoice preview (read-only formatted view — buyer name, GSTIN, line items, taxes, total). "Download PDF" generates and downloads the invoice PDF via a Supabase Edge Function. "Send to buyer" emails the invoice via Resend. Both actions are `seller_admin` only.
- `DetailActions` renders status-appropriate primary actions:
  - `draft` → "Confirm order" (advances to `received`)
  - `received` → "Confirm & dispatch" (advances to `confirmed` then `dispatched`)
  - `confirmed` → "Mark dispatched"
  - `dispatched` → "Mark delivered"
  - `on_hold` → "Resolve hold" (opens a dialog explaining the hold reason with a credit override option for `seller_admin`)
  - `delivered` / `cancelled` → no primary action; "Export to Tally" secondary action only
- "Cancel order" (destructive) is available until `status = 'dispatched'`; requires confirmation dialog with a reason text field.
- Breadcrumb "Orders" navigates back to `/orders`.

#### 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Orders', href: '/orders' }, { label: order.id, current: true }]` |
| `avatar` | `{ kind: 'order' }` — receipt/clipboard icon, 48×48 px, `bg-cream-200 text-cream-700` |
| `title` | `order.id` (e.g., `"ORD-2024-0042"`) — `font-mono` |
| `status` | `{ label: order.statusLabel, tone: order.statusTone }` |
| `subtitle` | `[buyer.name (linked to /customers/{id}), order.deliveryAddress, 'Placed {placedAt}', '{itemCount} items · {brandCount} brands']` |

**Add `'order'` to `DetailHeader` avatar `kind` union** in `src/components/seller/detail/DetailHeader.tsx`.

**Order status → `StatusTag` tone mapping:**

| `status` | `tone` |
|----------|--------|
| `draft` | `neutral` |
| `received` | `neutral` |
| `confirmed` | `warning` |
| `dispatched` | `warning` |
| `delivered` | `success` |
| `on_hold` | `danger` |
| `cancelled` | `neutral` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `Order value` | INR total for this order | `"{itemCount} items · {brandCount} brands"` |
| 2 | `Items` | Count of `order_items` rows | `"line items in this order"` |
| 3 | `Dispatch ETA` | Estimated dispatch date string, or `"—"` if not yet set | Status-driven sub: `"awaiting confirmation"` / `"dispatching today"` / `"delivered {date}"` |
| 4 | `Credit impact` | INR amount this order draws against buyer's credit limit | `"of {limit} · {pct}% used"` — progress bar tint: teal if `< 75%`, warning if `≥ 75%` |

> **Demoted to subtitle:** Placed date, buyer name, delivery address — all in header subtitle. Order ID is the title, not a tile.

**DetailTabs — 3 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `items` | `Items` | `order_items` count |
| `timeline` | `Timeline` | — |
| `invoice` | `Invoice` | — |

Active tab on load: `items`.

**Items tab — table spec:**

| Column | Content |
|--------|---------|
| Product | Bottle icon (32 px) + name (`.ent-name`) + sub: `{sku}` (`.ent-sub`) |
| Brand | `EntityAvatar` (22 px) + brand name, `text-[12.5px]` |
| Qty | Integer, `.num` |
| Unit price | INR, `font-mono text-[12.5px]` |
| Line total | INR, `.num-display` |
| Stock status | `StatusTag` — reflects live inventory at time of page load |

**Timeline tab — layout:**

```
Status progress bar (top)
  Five steps: Draft · Received · Confirmed · Dispatched · Delivered
  Completed steps: filled teal circle + teal connecting line
  Current step: pulsing teal ring
  Future steps: cream-300 circle + dashed line
  Cancelled: all steps grey, "Cancelled" badge inline

Event log (below bar)
  Each event row: timestamp (font-mono, text-cream-500) · actor name · event description
  Manual note row: italic text-cream-700 + actor + timestamp
  "Add note" input (seller_admin only): text input + "Save note" button
```

**Invoice tab — layout:**

- Formatted invoice card: `bg-white border border-cream-200 rounded-[14px] p-8 max-w-[720px]`
- Header: DealFlow / distributor name + logo · buyer name + GSTIN · invoice number + date
- Line items table: Product · HSN · Qty · Rate · GST% · Amount
- Footer: Subtotal · CGST · SGST · Grand total (bold)
- Actions row (below card): "Download PDF" (`<Download size={13}/> bg-cream-900 text-white`) · "Send to buyer" (`<Send size={13}/> bg-teal-500 text-white`) — both `seller_admin` only

#### 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=orders/\[id\]
npm run test:integration -- --testPathPattern=order-detail-page
# - MetaStrip4: exactly 4 tiles; placed date NOT a tile
# - Status action buttons: correct CTA per status (confirmed → "Mark dispatched", etc.)
# - "Cancel order": hidden once status = 'dispatched' or later
# - "Resolve hold" dialog: visible only when status = 'on_hold'
# - Invoice download: calls Edge Function, returns PDF blob
# - Cross-tenant isolation: order from another tenant → 403
# - Timeline bar: delivered status renders all steps filled
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

*End of DealFlow_User-Stories_v2.md*
