# Yukti — New Pages Spec (v1)

**Spec version:** 2026-06-23  
**Extends:** `DealFlow_User-Stories_v2.md` (EP-13, EP-14)  
**Depends on:** EP-13-001 (shared landing shell), EP-14-001 (shared detail shell)  
**Story format:** matches DealFlow_User-Stories_v2.md — 5-part BDD schema

---

## Stories in this file

| Story | Page | Type |
|-------|------|------|
| EP-13-010 | Categories Landing | Landing (v3) |
| EP-13-011 | Locations Landing | Landing (v3) |
| EP-13-012 | Campaigns Landing (renamed from Catalogs) | Landing (v3) — rename + delta spec |
| EP-13-013 | Buyer App | Landing (v3) — analytics-only, no table |
| EP-14-010 | Category Detail | Detail (v2) |
| EP-14-011 | Location Detail | Detail (v2) |
| — | Global rename: Catalogs → Campaigns, Cohorts → Customer Groups | Cross-cutting change |

---

---

## Global Rename — Catalogs → Campaigns · Cohorts → Customer Groups

This rename is **label-only**. DB table names (`app.published_catalogs`, `app.cohorts`) are unchanged. RPC names are unchanged. Only UI surface text, routes, and flag aliases change.

### Scope of rename

| From | To | Applies to |
|------|----|------------|
| "Catalog" / "Catalogs" | "Campaign" / "Campaigns" | Nav labels, page titles, eyebrows, breadcrumbs, empty states, toasts, share link copy |
| "Cohort" / "Cohorts" | "Customer Group" / "Customer Groups" | Nav labels, page titles, eyebrows, breadcrumbs, toasts, filter chips, callout copy |
| `/catalogs` | `/campaigns` | Route (Next.js folder rename: `app/(seller)/catalogs` → `app/(seller)/campaigns`) |
| `/catalogs/[id]` | `/campaigns/[id]` | Route |
| `/cohorts` | `/customer-groups` | Route |
| `/cohorts/[id]` | `/customer-groups/[id]` | Route |
| `"cohort"` in FilterBar searchPlaceholder | `"customer group"` | Landing pages referencing cohorts in search |
| Share link copy: `"Catalog link"` | `"Campaign link"` | Buyer share modal |
| Toast: `"Catalog published"` | `"Campaign published"` | Publish flow toast |
| Empty states: `"No catalogs yet"` | `"No campaigns yet"` | Empty state copy |

### What does NOT change

- DB table names: `app.published_catalogs`, `app.cohorts` — leave as-is
- RPC names: `app.resolve_price()`, `app.search_products()` — unchanged
- PostHog flag keys: `df_catalog_publishing`, `df_cohorts` — unchanged (changing flag keys requires a migration; defer)
- `share_token` column name — unchanged
- API route paths under `/api/` — unchanged (internal, not user-facing)

### Implementation approach

1. **Rename Next.js route folders** first (git mv): `catalogs → campaigns`, `cohorts → customer-groups`
2. Add 301 redirects in `next.config.js` for old routes: `/catalogs` → `/campaigns`, `/cohorts` → `/customer-groups`
3. Do a **string-replace pass** across `src/` for user-facing strings. Search targets: `"Catalog"`, `"catalog"`, `"Cohort"`, `"cohort"`. Only change strings in JSX/copy — not in SQL, type names, or Supabase client calls.
4. Update `navGroups` in `SellerSidebar.tsx`: label and href for both items
5. Verify with `grep -r '"Catalog\|"Cohort\|"catalog\|"cohort' src/ --include='*.tsx' --include='*.ts'` — should return zero UI-layer matches after rename pass

---

---

# EP-13-010 — Categories Landing Page

## 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to see my product catalog organised by category — with stock health, revenue concentration, and fast-moving lines surfaced at a glance — **so that** I can identify where to restock, which categories to push in the next campaign, and how concentrated my revenue is.

## 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Catalog" · title="Categories"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     6 columns — see §4
```

Route: `app/(seller)/categories/page.tsx`  
Feature flag gate: `df_brand_product_master`

> **Nav placement:** GROW YOUR BUSINESS group. Item label: "Categories". Icon: `Tag` (Lucide).

## 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_brand_product_master`.
- KPIs sourced from `catalog.categories` joined with `app.tenant_products` and `app.order_items`.
- "Active categories" = categories with ≥ 1 `app.tenant_product` where `status = 'active'` AND `deleted_at IS NULL`.
- "Low-stock categories" = active categories where the average `days_cover` across their products is < 14.
- "Top category share" = GMV% of the single highest-revenue category as a proportion of tenant total GMV MTD.
- "Products uncategorized" = count of `app.tenant_products` where `category_id IS NULL` AND `deleted_at IS NULL`.
- **Stockout risk callout:** Categories where ≥ 1 product has `on_hand = 0` AND `status = 'active'`. Sort by count of stocked-out products desc. Max 3 rows.
- **Top performers callout:** Top 2 categories by GMV MTD (min 1 order in period).
- **Fast movers callout:** Top 2 categories by units sold MTD (sort by `sum(order_items.quantity)` desc). May overlap with top performers — that is acceptable.
- Filter chips filter the table client-side. All/Active/Empty are the only meaningful states.
- Clicking a category row navigates to `/categories/{id}` (EP-14-010).
- "Add category" CTA opens an inline dialog — category name + optional description.

## 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Catalog"` |
| `title` | `"Categories"` |
| `subtitle` | `"How your catalog is structured. Categories drive filters in the buyer app and help you spot stock gaps and fast movers."` |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Import", icon: <Upload size={13}/> }` |
| `primary` | `"Add category"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Active categories` | Count of categories with ≥ 1 active product | `"{total} total · {empty} with no products"` | default |
| 2 | `Low-stock categories` | Count of categories where avg `days_cover < 14` across products | `"< 14d avg cover"` | `warn` |
| 3 | `Top category share` | `"{pct}%"` of total GMV from highest-revenue category | `"{categoryName} leads"` | default |
| 4 | `Products uncategorized` | Count of active products with no category | `"assign to filter in buyer app"` | `warn` if > 0, else default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Stockout risk"` | `"{n} categories"` | `EntityAvatar` (category initials, `hue='ember'`) + category name + `"{n} SKUs out of stock · {m} low stock"` + worst `StatusTag` trailing |
| 2 | `info` | `"Top performers"` | `"by GMV"` | `EntityAvatar` (hue=`'teal'`) + category name + `"{skus} SKUs · {buyers} buyers ordered"` + INR GMV formatted trailing |
| 3 | `opportunity` | `"Fast movers"` | `"by units sold"` | `EntityAvatar` (hue=`'cream'`) + category name + `"{units} units · {brands} brands"` + `GrowthPill` trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"{n} categories"` |
| `searchPlaceholder` | `"Search category…"` |
| `chips` | `['All', 'Active', 'Empty']` |
| `activeChip` | `'All'` |
| `sortBy` | `"GMV (high → low)"` |
| `hideViewToggle` | `true` |

**Table — 6 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Category | 280 px | `EntityAvatar` (38 px, initials, `hue='teal'`) + name (`.ent-name`) + sub: `"{skus} SKUs"` (`.ent-sub`) |
| GMV · MTD | — | INR formatted, `.num`; `"—"` if no orders |
| Growth | — | `GrowthPill` |
| SKUs | — | `"{active} active · {oos} out of stock"`, `.num` |
| Avg days cover | — | `"{n}d"` in `text-danger-600` if < 7; `text-amber-600` if < 14; else `text-cream-800`; `font-mono` |
| › | 32 px | Chevron |

## 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=categories/landing
npm run test:integration -- --testPathPattern=categories-landing-page
# - Active categories count matches categories with ≥1 active product
# - Tile #4 warns tone when uncategorized > 0
# - Stockout callout: only categories with on_hand = 0 appear
# - Category row click → /categories/{id}
# - Flag off → flag-off empty state
npx tsc --noEmit && npm run lint
```

---

---

# EP-14-010 — Category Detail Page

## 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to open a category and see its revenue performance, stock health, product list, and which brands contribute — **so that** I can act on restocking, campaign targeting, and category structure without switching screens.

## 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Categories › {name}" · category avatar · 3 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     4 tabs — Overview · Products · Brands · Activity
  └── tab-body       Overview tab active by default
```

Route: `app/(seller)/categories/[id]/page.tsx`  
Feature flag gate: `df_brand_product_master`

## 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `catalog.categories` joined with `app.tenant_products` and `app.order_items` by `id`.
- 404 if category not found or not used by this tenant.
- **Overview tab (default):** 2-column layout — (left) Revenue trend chart (bar, MTD by week) + (right) Stock health summary (pie or stat grid: active / low stock / out of stock counts). Below: Brand GMV contribution table for this category (top brands by spend).
- **Products tab:** All `app.tenant_products` where `category_id = this.id`. Columns: Product · Brand · On hand · Days cover · Units MTD · Revenue · Status. Sortable. Inline status update allowed (seller_admin).
- **Brands tab:** Brands with ≥ 1 product in this category. Columns: Brand · SKUs in category · GMV · Growth · Status.
- **Activity tab:** Chronological log — category renames, product assignments/removals, status changes. Newest first.
- `Edit` action allows renaming the category and updating description (seller_admin only).

## 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Categories', href: '/categories' }, { label: category.name, current: true }]` |
| `avatar` | `{ kind: 'brand', initials: category.initials, hue: 'teal' }` |
| `title` | `category.name` |
| `status` | `{ label: 'Active', tone: 'success' }` or `{ label: 'Empty', tone: 'neutral' }` |
| `subtitle` | `['{skuCount} SKUs', '{brandCount} brands', 'Created {createdAt}']` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `Revenue · MTD` | INR formatted GMV from order_items in this category | `↑ +{growth}% vs last month` |
| 2 | `Active SKUs` | Count of active tenant_products in this category | `"{total} total · {oos} out of stock"` |
| 3 | `Low-stock SKUs` | Count where `days_cover < 14` | `"reorder before they run out"` |
| 4 | `Active buyers` | Distinct buyer count who ordered from this category MTD | `"bought from this category"` |

**DetailTabs — 4 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `overview` | `Overview` | — |
| `products` | `Products` | Total SKU count |
| `brands` | `Brands` | Brand count |
| `activity` | `Activity` | — |

Active tab on load: `overview`.

**Overview tab — layout:**

```
2-column grid (gap-6)
  ├── Left card: Revenue trend
  │     recharts BarChart · 4-6 weeks · x-axis = week label · y-axis = INR
  │     title: "Revenue trend" · sub: "MTD by week"
  └── Right card: Stock health
        Stat grid (2×2):
          Active SKUs | Out of stock
          Low stock   | Uncovered (no inventory record)
        Below: mini table — top 5 brands by GMV in this category
              columns: Brand · Units · Revenue
```

## 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=categories/\[id\]
npm run test:integration -- --testPathPattern=category-detail-page
# - Empty category (no products): MetaStrip shows 0 values, not errors
# - Cross-tenant: category used by another tenant → 404
# - Products tab badge = count of active SKUs in category
# - Breadcrumb "Categories" → /categories
npx tsc --noEmit && npm run lint
```

---

---

# EP-13-011 — Locations Landing Page

## 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to see all my branches/godowns in one view — with stock health, outstanding dues, and top-revenue locations surfaced — **so that** I can direct restocking decisions, chase collections at the right branch, and identify which locations need more buyer coverage.

## 2. Common Layout

Uses the shared shell from **EP-13-001**.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Operations" · title="Locations"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  ├── FilterBar          chips, sort — see §4
  └── table.v2-table     7 columns — see §4
```

Route: `app/(seller)/locations/page.tsx`  
Feature flag gate: `df_brand_product_master`

> **Nav placement:** GROW YOUR BUSINESS group. Item label: "Locations". Icon: `MapPin` (Lucide).

## 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_brand_product_master`.
- Locations sourced from `app.locations` for the current tenant.
- "Active locations" = `status = 'active'` AND `deleted_at IS NULL`.
- "Outstanding dues" = sum of unpaid `app.invoices.balance_due` grouped by location; total across all locations shown in tile.
- "Low-stock locations" = count of locations where ≥ 1 key SKU has `days_cover < 7` in `app.tenant_inventory`.
- "Top location share" = GMV% of highest-revenue location as proportion of tenant total GMV MTD.
- **Stock critical callout:** Locations with ≥ 1 product at `on_hand = 0` or `days_cover < 7`. Sort by count of critical SKUs desc. Max 3.
- **Top locations callout:** Top 2 locations by GMV MTD (min 1 order in period).
- **Collections overdue callout:** Locations with `sum(balance_due) > 0` where oldest unpaid invoice is > 30 days. Sort by total dues desc. Max 3.
- Filter chips filter table rows client-side.
- Clicking a location row navigates to `/locations/{id}` (EP-14-011).
- "Add location" CTA opens an inline dialog — location name, type (godown/branch/office), address.

## 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Operations"` |
| `title` | `"Locations"` |
| `subtitle` | `"Your branches and godowns. Track stock health, outstanding dues, and GMV contribution per location."` |
| `horizon` | `"This month"` |
| `secondary` | `{ label: "Import", icon: <Upload size={13}/> }` |
| `primary` | `"Add location"` |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `Active locations` | Count of active `app.locations` | `"{total} branches / godowns"` | default |
| 2 | `Outstanding dues` | Sum of `balance_due` across all unpaid invoices | `"across {n} locations"` | `warn` if > 0, else default |
| 3 | `Low-stock locations` | Count of locations with ≥ 1 SKU at `days_cover < 7` | `"< 7d cover on key SKUs"` | `warn` |
| 4 | `Top location share` | GMV% of highest-revenue location | `"{locationName} leads"` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Stock critical"` | `"{n} locations"` | `EntityAvatar` (location initials, `hue='ember'`) + location name + `"{n} SKUs out of stock · {m} < 7d cover"` + worst `StatusTag` trailing |
| 2 | `info` | `"Top locations"` | `"by GMV"` | `EntityAvatar` (hue=`'teal'`) + location name + `"{orders} orders · {buyers} buyers"` + INR GMV trailing |
| 3 | `risk` | `"Collections overdue"` | `"{n} locations"` | `EntityAvatar` (hue=`'ember'`) + location name + `"₹{dues} outstanding · oldest {n}d unpaid"` + INR dues trailing |

**FilterBar:**

| Prop | Value |
|------|-------|
| `count` | `"{n} locations"` |
| `searchPlaceholder` | `"Search location…"` |
| `chips` | `['All', 'Active', 'Stock issues', 'Has dues']` |
| `activeChip` | `'All'` |
| `sortBy` | `"GMV (high → low)"` |
| `hideViewToggle` | `true` |

**Table — 7 columns:**

| Column | Width | Content |
|--------|-------|---------|
| Location | 260 px | `EntityAvatar` (38 px, initials, `hue='teal'`) + name (`.ent-name`) + sub: `"{type} · {city}"` (`.ent-sub`) |
| GMV · MTD | — | INR formatted; `"—"` if no orders |
| Growth | — | `GrowthPill` |
| Active buyers | — | Count, `.num` |
| Outstanding dues | — | `"₹{n}"` in `text-danger-600 font-mono font-semibold` if > 0; `"—"` in `text-cream-400` if clear |
| Stock status | — | `StatusTag` — `success` "Clear" / `warning` "Low stock" / `danger` "Out of stock" |
| › | 32 px | Chevron |

## 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=locations/landing
npm run test:integration -- --testPathPattern=locations-landing-page
# - Outstanding dues tile = sum of balance_due across all unpaid invoices for tenant
# - "Has dues" chip filters to locations with balance_due > 0
# - Collections overdue callout: only locations with invoice age > 30d appear
# - Location row click → /locations/{id}
# - Flag off → flag-off empty state
npx tsc --noEmit && npm run lint
```

---

---

# EP-14-011 — Location Detail Page

## 1. Objective & User Value

- **As a** `seller_admin` or `seller_assistant`, **I want** to open a location's detail page and see its GMV, buyer activity, dues position, and inventory health — then drill into customers, orders, and stock per location — **so that** I can manage collections, restocking, and buyer relationships from one screen.

## 2. Common Layout

Uses the shared shell from **EP-14-001**.

```
PageWrap (max-w-[1440px] mx-auto, pt-7)
  ├── DetailHeader   breadcrumb="Locations › {name}" · location avatar · 3 subtitle items
  ├── MetaStrip4     4 tiles — see §4
  ├── DetailTabs     5 tabs — Overview · Customers · Orders · Inventory · Activity
  └── tab-body       Overview tab active by default
```

Route: `app/(seller)/locations/[id]/page.tsx`  
Feature flag gate: `df_brand_product_master`

## 3. Acceptance Criteria (Functional Boundaries)

- Page loads from `app.locations` by `id`; 404 if not found or cross-tenant.
- **Overview tab (default):** 2-column layout — (left) GMV trend chart (bar, MTD by week) + (right) stock health summary (active / low / OOS counts). Below: top 5 customers at this location by spend MTD.
- **Customers tab:** All buyers whose primary or delivery location maps to this location. Columns: Customer · Spend MTD · Orders MTD · Outstanding dues · Last order. Clicking a row → `/customers/{id}`.
- **Orders tab:** All orders with delivery/pickup at this location. Columns: Order ID · Date · Customer · Items · GMV · Status. Clicking → `/orders/{id}`.
- **Inventory tab:** All `app.tenant_inventory` rows for this location. Columns: Product · Brand · On hand · Days cover · Last updated · Status. Sortable by days_cover asc (worst first default).
- **Activity tab:** All mutations tied to this location — inventory updates, address changes, order events, buyer assignments. Newest first.
- `Edit` action allows updating location name, type, address (seller_admin only).

## 4. Design System & UI/UX Constraints

**DetailHeader config:**

| Field | Value |
|-------|-------|
| `crumbPath` | `[{ label: 'Locations', href: '/locations' }, { label: location.name, current: true }]` |
| `avatar` | `{ kind: 'brand', initials: location.initials, hue: 'teal' }` |
| `title` | `location.name` |
| `status` | `{ label: location.type, tone: 'neutral' }` — e.g. "Godown" / "Branch" |
| `subtitle` | `[location.city, '{buyerCount} buyers', '{skuCount} SKUs tracked']` |

**MetaStrip4 — exact 4 tiles:**

| # | Label | Value | Sub |
|---|-------|-------|-----|
| 1 | `GMV · MTD` | INR formatted GMV from orders at this location | `↑ +{growth}% vs last month` |
| 2 | `Active buyers` | Distinct buyers with ≥1 order at this location MTD | `"of {totalBuyers} assigned"` |
| 3 | `Outstanding dues` | Sum of `balance_due` for buyers at this location | `"across {n} invoices"` in `text-danger-600` if > 0 |
| 4 | `Low-stock SKUs` | Count of inventory rows where `days_cover < 14` at this location | `"< 14d cover"` |

**DetailTabs — 5 tabs:**

| id | Label | Badge |
|----|-------|-------|
| `overview` | `Overview` | — |
| `customers` | `Customers` | Buyer count |
| `orders` | `Orders` | Order count MTD |
| `inventory` | `Inventory` | Count of SKUs with `days_cover < 14` (warn badge if > 0) |
| `activity` | `Activity` | — |

Active tab on load: `overview`.

**Overview tab — layout:**

```
2-column grid (gap-6)
  ├── Left card: GMV trend
  │     recharts BarChart · 4-6 weeks · x-axis = week · y-axis = INR
  │     title: "Revenue trend" · sub: "MTD by week"
  └── Right card: Inventory health
        Stat grid (2×2):
          Active SKUs | Out of stock (danger color)
          Low stock   | Days cover avg
        Below: "Top buyers at this location" — mini table:
              Customer · Spend MTD · Outstanding dues
```

**Inventory tab — key rule:** Default sort = `days_cover ASC` (most urgent first). Rows with `on_hand = 0` show `StatusTag` danger. Rows with `days_cover < 7` show warn. No filter chips needed — all inventory for this location is shown.

## 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=locations/\[id\]
npm run test:integration -- --testPathPattern=location-detail-page
# - Cross-tenant: location from another tenant → 404
# - Inventory tab: rows sorted by days_cover ASC on load
# - Outstanding dues tile color: danger if > 0, neutral if 0
# - Breadcrumb "Locations" → /locations
# - Inventory tab badge = count of SKUs with days_cover < 14
npx tsc --noEmit && npm run lint
```

---

---

# EP-13-012 — Campaigns Landing Page (renamed from Catalogs)

> **This is a delta spec on top of EP-13-007.**  
> All layout, component usage, DB queries, filter chips, grid body, and CTA logic from EP-13-007 remain unchanged. Only the items listed below change.

## Changes from EP-13-007

### 1. Route

| From | To |
|------|----|
| `app/(seller)/catalogs/page.tsx` | `app/(seller)/campaigns/page.tsx` |

Add a 301 redirect in `next.config.js`: `/catalogs → /campaigns`.

### 2. PageHeader

| Prop | Old value | New value |
|------|-----------|-----------|
| `eyebrow` | `"Distribution"` | `"Growth"` |
| `title` | `"Catalogs"` | `"Campaigns"` |
| `subtitle` | `"The mailers your retailers see in the buyer app…"` | `"Targeted offers for your customer groups. Each campaign picks a product set, a price, and a group — then shares via WhatsApp."` |
| `primary` | `"Publish a catalog"` | `"New campaign"` |
| `secondary` | `{ label: "New from template", … }` | `{ label: "New from template", … }` *(unchanged)* |

### 3. InsightStrip4 — KPI #1 sub-text only

| Tile | Old `sub` | New `sub` |
|------|-----------|-----------|
| `Live campaigns` (was `Live catalogs`) | `"{draft} in draft, {ended} ended"` | `"{draft} in draft · {expiring7d} ending in 7 days"` |

`expiring7d` = count of live campaigns with `valid_to BETWEEN now() AND now() + INTERVAL '7 days'`.

All other tiles unchanged.

### 4. KPI tile labels (rename only)

| Old | New |
|-----|-----|
| `"Live catalogs"` | `"Live campaigns"` |
| `"GMV from catalogs"` | `"Campaign GMV"` |
| `"Avg conversion"` | *(unchanged)* |
| `"Orders attributed"` | *(unchanged)* |

### 5. Callout copy — rename only

Replace all occurrences of "catalog" with "campaign" in callout row strings:
- `"Draft · not yet shipped to cohort"` → `"Draft · not yet sent to customer group"`
- `"Ended {validUntil} · {orders} orders"` → *(unchanged)*
- `"Expires in {daysLeft}d · {orders} orders"` → *(unchanged)*

### 6. FilterBar

| Prop | Old | New |
|------|-----|-----|
| `count` | `"{n} catalogs"` | `"{n} campaigns"` |
| `searchPlaceholder` | `"Search catalog or cohort…"` | `"Search campaign or customer group…"` |

### 7. Grid tile (`v2-cat-tile`)

| Field | Old | New |
|-------|-----|-----|
| Cohort row label | `"Cohort"` | `"Customer group"` |

### 8. Detail page navigation

Clicking a campaign tile navigates to `/campaigns/{id}` (was `/catalogs/{id}`).

### 9. Feature flag

Flag key `df_catalog_publishing` stays unchanged. The UI label "Catalogs feature" in Module Settings can be renamed to "Campaigns" separately (Settings spec scope).

## Verification (additions to EP-13-007 tests)

```bash
# - GET /catalogs → 301 redirect to /campaigns
# - KPI #1 sub shows "expiring7d" count, not "ended" count
# - Cohort row in tile shows "Customer group" label
# - Share button generates link with correct share_token (unchanged logic)
npx tsc --noEmit && npm run lint
```

---

---

# EP-13-013 — Buyer App Page

## 1. Objective & User Value

- **As a** `seller_admin`, **I want** a dedicated page showing buyer app adoption and GMV contribution — who's using it, how much business flows through it, and who's been enabled but never ordered — **so that** I can drive app adoption as a growth lever and show WineYard-style customers the ROI of the buyer portal.

## 2. Common Layout

> **This page has no table body.** The `FilterBar` is omitted. Body is a 2×2 card grid.

```
PageWrap (max-w-[1440px] mx-auto)
  ├── PageHeader         eyebrow="Engagement" · title="Buyer App"
  ├── InsightStrip4      4 tiles — see §4
  ├── V3CalloutPanel     3 callouts — see §4
  └── div.buyer-app-cards   2×2 grid of analytics cards — see §4
```

Route: `app/(seller)/buyer-app/page.tsx`  
Feature flag gate: `df_buyer_app`

> **Nav placement:** GROW YOUR BUSINESS group. Item label: "Buyer App". Icon: `Smartphone` (Lucide).

## 3. Acceptance Criteria (Functional Boundaries)

- Page gated behind `df_buyer_app`.
- KPIs sourced from `app.buyer_users` (enabled), `app.orders` filtered by `source = 'buyer_app'`, and `app.buyers`.
- "App-enabled buyers" = distinct buyers with ≥ 1 active `buyer_users` row for this tenant.
- "App GMV · MTD" = `sum(orders.total)` where `source = 'buyer_app'` for current month. `total_orders` = count of same.
- "Active this month" = distinct buyers who placed ≥ 1 order via buyer app in current month.
- "Avg orders per user" = `total_app_orders / app_enabled_buyers` for current month. Sub shows avg order value = `total_app_gmv / total_app_orders`.
- **Enabled, not ordering callout:** Buyers with `buyer_users` row but zero buyer_app orders in 30 days. Sort by days since last app order desc. Max 3.
- **Top app buyers callout:** Top 2 buyers by buyer_app GMV MTD.
- **Not yet on app callout:** Top 3 buyers by total offline GMV MTD who have no `buyer_users` row. These are the highest-value targets for app onboarding.
- Card 1 (App adoption funnel): Funnel from enabled → active → repeat.
- Card 2 (GMV contribution): Estimates / Converted to invoice / Invoices — value breakdown of app-sourced business.
- Card 3 (Top app buyers): List of top 5 buyers by buyer_app GMV.
- Card 4 (Location-based usage): Table/chart of buyer_app GMV and order count per location.
- "Enable buyers" CTA on the Not-yet-on-app callout rows links to the customer's detail page where app access can be toggled.

## 4. Design System & UI/UX Constraints

**PageHeader:**

| Prop | Value |
|------|-------|
| `eyebrow` | `"Engagement"` |
| `title` | `"Buyer App"` |
| `subtitle` | `"Track how much of your business flows through the buyer portal and who's driving it."` |
| `horizon` | `"This month"` |
| `primary` | `"Open buyer app ↗"` (opens buyer PWA in new tab) |

**InsightStrip4 — exact 4 tiles:**

| # | Label | Value source | Sub | Tone |
|---|-------|-------------|-----|------|
| 1 | `App-enabled buyers` | Count with active `buyer_users` row | `"{pct}% of your buyer base"` | default |
| 2 | `App GMV · MTD` | Sum of orders.total where `source = 'buyer_app'` | `"{totalOrders} orders · {pct}% of total GMV"` | `accent` |
| 3 | `Active this month` | Distinct buyers with ≥1 app order MTD | `"{repeat} placed 2+ orders"` | default |
| 4 | `Avg orders / user` | `total_app_orders / enabled_buyers` | `"avg ₹{aov} per order"` | default |

**V3CalloutPanel — 3 callout groups:**

| Group | `kind` | `eyebrow` | `hint` | Row content |
|-------|--------|-----------|--------|-------------|
| 1 | `risk` | `"Enabled, not ordering"` | `"{n} buyers"` | `EntityAvatar` (buyer initials, `hue='ember'`) + buyer name + `"Enabled {enabledDate} · {daysAgo}d since last app order"` + `StatusTag` trailing |
| 2 | `info` | `"Top app buyers"` | `"by GMV"` | `EntityAvatar` (hue=`'teal'`) + buyer name + `"{orders} orders via app"` + INR GMV trailing |
| 3 | `opportunity` | `"Not yet on app"` | `"highest offline spend"` | `EntityAvatar` (hue=`'cream'`) + buyer name + `"₹{spend} offline spend"` + "Enable →" action link trailing |

**Body — 2×2 card grid (`buyer-app-cards`):**

```
div.buyer-app-cards  (display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; mt-6)
  ├── Card 1: App adoption funnel
  │     title: "Adoption funnel" · sub: "This month"
  │     Vertical funnel stat list:
  │       Enabled   → {enabledCount}     (100% bar)
  │       Opened    → {openedCount}      (proportional bar)
  │       Ordered   → {orderedCount}     (proportional bar)
  │       Repeat    → {repeatCount}      (proportional bar, teal fill)
  │     Each row: label + count + % of enabled
  │
  ├── Card 2: GMV contribution
  │     title: "Business through app" · sub: "This month"
  │     3-row breakdown:
  │       Estimates (app-sourced)  → ₹{n}  · {count} estimates
  │       Converted to invoice     → ₹{n}  · {convRate}% of estimates
  │       Invoiced                 → ₹{n}  · {count} invoices
  │     Bottom stat: "App share of total GMV: {pct}%"
  │     Style: each row label text-[12px] text-cream-600; value text-[15px] font-semibold text-cream-950
  │
  ├── Card 3: Top app buyers
  │     title: "Top buyers on app" · sub: "by GMV this month"
  │     5-row mini-table:
  │       EntityAvatar (38px) + buyer name + city
  │       trailing: "{orders} orders · ₹{gmv}"
  │     "View all" link at bottom → /customers?filter=app_active
  │
  └── Card 4: App usage by location
        title: "Usage by location" · sub: "buyer app orders & GMV"
        Table (no border, tight rows):
          Location | App orders | App GMV | Share of app GMV
        Max 5 rows; "—" if no app orders at that location
        Sort: App GMV desc
```

**Card container token spec:**  
`bg-cream-50 border border-cream-200 rounded-[14px] p-5`  
Title: `text-[13px] font-semibold text-cream-950`  
Sub: `text-[11px] text-cream-500 mt-0.5 mb-4`

## 5. Automated Verification Steps

```bash
npm run test:unit -- --testPathPattern=buyer-app/landing
npm run test:integration -- --testPathPattern=buyer-app-page
# - App GMV tile: only orders with source = 'buyer_app' counted
# - "Not yet on app" callout: buyers with no buyer_users row only
# - Card 2: estimates + invoiced totals are source=buyer_app filtered
# - Card 4: location breakdown matches orders.location_id join
# - "Enable →" trailing link → /customers/{id}
# - Flag off → flag-off empty state
npx tsc --noEmit && npm run lint
```

---

## Summary of new routes

| Route | Page | Feature flag | Nav group |
|-------|------|-------------|-----------|
| `/categories` | Categories landing | `df_brand_product_master` | GROW |
| `/categories/[id]` | Category detail | `df_brand_product_master` | — |
| `/locations` | Locations landing | `df_brand_product_master` | GROW |
| `/locations/[id]` | Location detail | `df_brand_product_master` | — |
| `/campaigns` | Campaigns landing (was `/catalogs`) | `df_catalog_publishing` | GROW |
| `/campaigns/[id]` | Campaign detail (was `/catalogs/[id]`) | `df_catalog_publishing` | — |
| `/customer-groups` | Customer Groups landing (was `/cohorts`) | `df_cohorts` | SETUP |
| `/buyer-app` | Buyer App analytics | `df_buyer_app` | GROW |

## Redirects to add in `next.config.js`

```js
async redirects() {
  return [
    { source: '/catalogs', destination: '/campaigns', permanent: true },
    { source: '/catalogs/:id', destination: '/campaigns/:id', permanent: true },
    { source: '/cohorts', destination: '/customer-groups', permanent: true },
    { source: '/cohorts/:id', destination: '/customer-groups/:id', permanent: true },
  ]
}
```
