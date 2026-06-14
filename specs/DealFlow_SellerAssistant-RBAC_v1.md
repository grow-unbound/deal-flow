# DealFlow — Seller Assistant RBAC Spec

**Version:** 2.0  
**Status:** Draft  
**Owner:** Phani  
**Date:** 2026-06-14  
**Companion docs:** `DealFlow_Settings-Spec_v3.md` · `DealFlow_User-Stories_v2.md` · `DealFlow_Product-Spec_v1.md`

---

## 1. Role Philosophy

`seller_assistant` is a **pure operations role**. The distributor-owner (seller_admin) delegates day-to-day execution — order processing, customer interactions, invoice management — without exposing business strategy, financial performance, or pricing architecture.

**Mental model:** the assistant moves the needle forward without seeing the scoreboard.

Two dimensions control what an assistant sees and can do:

1. **Location scope** — data is always filtered to the assistant's assigned location(s).
2. **Module permissions** — a fixed capability matrix per module (see §4).

---

## 2. Location Assignment

### 2.1 Data model

Add `location_ids uuid[]` to `app.tenant_users`. This field is null for `seller_admin` (admin sees all locations). For `seller_assistant`, it must contain at least one location ID.

```sql
-- Migration: add location scope to tenant_users
ALTER TABLE app.tenant_users
  ADD COLUMN location_ids uuid[] DEFAULT NULL;

-- Constraint: seller_assistant must have at least one location
ALTER TABLE app.tenant_users
  ADD CONSTRAINT chk_assistant_has_location
  CHECK (
    role != 'seller_assistant'
    OR (location_ids IS NOT NULL AND cardinality(location_ids) > 0)
  );
```

### 2.2 Assignment flow (Settings → Team)

When creating or editing a `seller_assistant` user, after selecting the role the system **immediately prompts** for location assignment before the invite can be sent. This is a required step, not optional.

**Create flow:**
1. Admin enters email + selects `seller_assistant` role.
2. A location picker appears inline (multi-select from `app.locations`). Minimum 1 required.
3. Invite sends only after at least one location is selected.
4. Team list table gains a **Locations** column showing assigned location names (truncated after 2 with "+N more").

**Edit flow:**
- Admin can update location assignments at any time from the Team table row action "Edit access".
- No re-invite required — change takes effect on next page load (JWT refresh or session re-check).
- Removing all locations is blocked — must deactivate the user instead.

### 2.3 JWT propagation

The `location_ids` array must be embedded in the user's JWT claims (via Supabase `auth.users` `raw_app_meta_data`) so it is available server-side without an extra DB round-trip.

```ts
// Middleware reads:
const { role, tenant_id, location_ids } = jwt.app_metadata
```

### 2.4 Server-side enforcement

Every RPC that returns location-scoped data must accept a `p_location_ids uuid[]` parameter and filter accordingly. The application layer always passes the JWT's `location_ids` — never trusts a client-supplied value.

Example pattern:

```sql
CREATE OR REPLACE FUNCTION app.list_orders(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL  -- NULL = no filter (admin)
)
RETURNS SETOF app.orders AS $$
  SELECT * FROM app.orders
  WHERE tenant_id = p_tenant_id
    AND (p_location_ids IS NULL OR location_id = ANY(p_location_ids));
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

## 3. Location Field on Transactional Documents

Orders, Estimates, and Invoices must each carry a `location_id` to support filtering by the assistant's scope.

### 3.1 Schema additions

```sql
-- Orders
ALTER TABLE app.orders
  ADD COLUMN location_id uuid REFERENCES app.locations(id) ON DELETE RESTRICT;

-- Estimates
ALTER TABLE app.estimates
  ADD COLUMN location_id uuid REFERENCES app.locations(id) ON DELETE RESTRICT;

-- Invoices
ALTER TABLE app.invoices
  ADD COLUMN location_id uuid REFERENCES app.locations(id) ON DELETE RESTRICT;
```

### 3.2 UI changes — Document Composers

**Location field in Basic Details strip (header row):**
- Add a **Location** required field to the Basic Details strip in all three composers (Estimate / Sales Order / Invoice).
- For `seller_admin`: free pick from all locations.
- For `seller_assistant` with one location: field is shown but locked (read-only, displays assigned location name).
- For `seller_assistant` with multiple locations: shown as a select, options restricted to their assigned locations.
- Default: the assistant's first/primary assigned location; admin's default is the tenant's primary location.

**Place of Supply field — moved:**
- Remove **Place of Supply** from the Basic Details strip.
- Relocate it to the **left panel**, below customer details and above Notes/Freight Charges. It lives alongside document-level contextual fields, not header metadata.

**Landing page tables** (Estimates / Orders / Invoices):
- Add a **Location** column. Hidden by default for single-location tenants; visible otherwise.
- For `seller_assistant`: the RPC always pre-filters to their locations. The filter chip UI still shows a Location filter for assistants with multiple locations to narrow further.
- Admins always see all locations and can filter by any.

---

## 4. Module Permission Matrix

All CRU access for Estimates, Sales Orders, and Invoices is **implicitly scoped to accessible locations** — assistants can only create documents tagged to their assigned locations and can only read/update documents whose `location_id` is in their access list. This applies to both the landing page list and all detail page related-entity tabs.

| Module | seller_admin | seller_assistant | Notes |
|---|:---:|:---:|---|
| **Dashboard** | Full | Operational variant | See §5 |
| **Brands** | CRUD | — (hidden) | Strategy module |
| **Products** | CRUD + financials | Read only, no financials | See §6.1 |
| **Customers** | CRUD + spend data | CRU, no spend/growth | See §6.2; cohort/pricelist assignment admin-only |
| **Cohorts** | CRUD | — (hidden) | Strategy module |
| **Price Lists** | CRUD | Read only (lookup only) | See §6.3 |
| **Catalogs** | CRUD | — (hidden) | Strategy module |
| **Estimates** | CRU + Void/Delete | CRU, location-scoped | No void/delete; own-location only |
| **Sales Orders** | CRU + Void/Delete | CRU, location-scoped | No void/delete; own-location only |
| **Invoices** | CRU + Void/Delete | CRU, location-scoped | No void/delete; own-location only |
| **Exports** | Full | — (hidden) | Admin only |
| **Settings** | Full | — (hidden) | Admin only |

**Location scoping on landing pages:** every module landing page RPC passes the assistant's `location_ids` from JWT. This affects:
- **Estimates** — only estimates with `location_id = ANY(assistant.location_ids)` are returned.
- **Sales Orders** — same.
- **Invoices** — same.
- **Customers** — all customers visible (customers are not location-tagged), but related entity counts (orders, invoices) shown on customer cards are pre-filtered to accessible locations.
- **Products** — all products visible (products are tenant-wide); stock levels shown are from the integration and are location-specific where the integration provides location-level inventory.

**Hidden modules** do not appear in the sidebar for `seller_assistant`. The nav renders based on role.

---

## 5. Dashboard — Operational Variant

The `seller_assistant` dashboard is a **location-scoped action centre**, not a business summary. Everything below is filtered to the assistant's assigned locations.

### 5.1 InsightStrip4 — operational KPIs

The strip shows **up to 4 tiles, composed dynamically** based on which modules are enabled for the tenant (via feature flags). Tiles are drawn from a priority-ordered list — the first 4 available modules fill the strip. All values are filtered to the assistant's assigned locations.

**Priority order and tile definitions:**

| Priority | Module flag required | Tile | Metric | Deep-link |
|---|---|---|---|---|
| 1 | `df_estimates` | **Open Estimates** | Count of estimates in `draft` or `sent` status awaiting customer response | Estimates landing filtered to open status |
| 2 | `df_sales_orders` | **Orders to Confirm** | Count of sales orders in `received` status | Sales Orders landing filtered to `received` |
| 3 | `df_invoices` | **Overdue Invoices** | Count of invoices unpaid past due date | Invoices landing filtered to overdue |
| 4 | `df_zoho_integration` or `df_tally_export` | **Low Stock Alerts** | Count of products below reorder threshold (from integration sync) | Products landing filtered to low-stock |
| 5 | `df_customer_master` | **Inactive Customers** | Count of customers with no order in 30d | Customers landing filtered by last-order date |

If fewer than 3 document modules are enabled, Low Stock and Inactive Customers fill in earlier. The strip never renders fewer than 2 tiles; if only 1 module is enabled, expand that tile to full width.

### 5.2 V3CalloutPanel ("Today's read") — three action cards

Replace strategic callouts with operationally urgent items:

| Card | Kind | Content |
|---|---|---|
| **Needs action** | `risk` | Customers at or over credit limit + customers with invoices overdue > 15d. Each row: customer name, overdue amount or credit utilization %, last contact date. |
| **Recent activity** | `info` | Orders and estimates created or updated since the assistant's last login. Each row: document number, customer name, status, amount. Prompts them to follow up or confirm. |
| **Re-engage** | `opportunity` | Customers in their locations with no order in 30+ days who had active orders before. Each row: customer name, last order date, last order value. Call list for the day. |

### 5.3 Recent transactions — three independent feeds

Below the callout panel, render **up to three side-by-side feed columns** — one per enabled document module (`df_estimates`, `df_sales_orders`, `df_invoices`). If a module is disabled via feature flag, its column is omitted entirely. Each feed is independently scoped to the assistant's assigned locations.

**Feed spec (applies to all three):**

| Property | Value |
|---|---|
| Items shown | Latest 5 by `updated_at` desc |
| Columns | Document number, Customer name, Status (`StatusTag`), Amount, Time ago |
| Footer | "View all →" deep-link to the module landing page |
| Empty state | "No [estimates/orders/invoices] yet" — no column hidden, just empty state shown |

**Status tags that signal required action** (rendered with `warn` or `danger` tone):

| Feed | Action statuses |
|---|---|
| Estimates | `draft` (unsent), `sent` (awaiting response) |
| Sales Orders | `received` (needs confirmation), `confirmed` (needs dispatch) |
| Invoices | `overdue` (needs collection follow-up) |

This section replaces the admin's revenue trend chart area. The three-column layout collapses to a stacked list on narrower viewports.

### 5.4 Remove entirely from assistant dashboard

- Revenue trend charts
- Growth percentages and `GrowthPill` components
- Top-brand-by-revenue panels
- Period-over-period comparisons
- MTD / YTD financial summaries

---

## 6. Module-Level Detail Rules

### 6.1 Products

**Purpose for assistant:** look up a product to answer a customer's question, check if it's in stock, see what price applies. Not a management surface.

**Inventory data source:** stock levels and low-stock flags come exclusively from Tally / Busy / Zoho integration sync. Assistants cannot manually edit inventory — only view what the integration provides.

#### Landing page

| Column | seller_admin | seller_assistant |
|---|:---:|:---:|
| Product name, SKU, brand | ✅ | ✅ |
| Category, images | ✅ | ✅ |
| MRP | ✅ | ✅ |
| Base selling price | ✅ | ✅ |
| GST rate, HSN | ✅ | ✅ |
| Stock status (In Stock / Low / Out) | ✅ | ✅ |
| Stock quantity | ✅ | ✅ |
| Cost price | ✅ | ✗ |
| GMV / Revenue | ✅ | ✗ |
| Units sold | ✅ | ✗ |
| GrowthPill | ✅ | ✗ |

**Landing page actions for assistant:** None. No "Add product" button. No row-level edit/delete. Low-stock items display a `warn` StatusTag — visible but not actionable here.

**All price lists for a product** (the "what prices exist for this product" view): visible to assistant in read-only mode. Useful when a customer asks why their price differs from another retailer's. No edit access.

#### Detail page tabs

| Tab | seller_admin | seller_assistant |
|---|:---:|:---:|
| Details | ✅ (editable) | ✅ (read-only) |
| Performance | ✅ | ✗ (hidden) |
| Price Lists | ✅ | ✅ (read-only, all lists for this product) |
| Activity | ✅ | ✅ |

**Details tab (assistant view):** all product fields visible in read-only mode. Cost price field hidden entirely (not shown as masked).

### 6.2 Customers

**Purpose for assistant:** create new customers, update basic details, place and confirm orders, follow up on invoices. Cohort and price list assignments remain admin-controlled — the assistant should not accidentally change what price tier a customer is on.

#### Landing page

| Column | seller_admin | seller_assistant |
|---|:---:|:---:|
| Name, Business name | ✅ | ✅ |
| GSTIN, City/State | ✅ | ✅ |
| Tier, Credit limit | ✅ | ✅ |
| Last order date | ✅ | ✅ |
| Order count | ✅ | ✅ |
| Total spend (LTD) | ✅ | ✗ |
| Revenue growth % / GrowthPill | ✅ | ✗ |
| Revenue rank | ✅ | ✗ |

**Landing page actions for assistant:** Create customer (full form, see below). No delete. No deactivate.

#### Detail page tabs

| Tab | seller_admin | seller_assistant |
|---|:---:|:---:|
| Details | ✅ (editable) | ✅ (editable — basic fields only, see below) |
| Performance | ✅ | ✗ (hidden) |
| Orders | ✅ | ✅ (location-scoped) |
| Estimates | ✅ | ✅ (location-scoped) |
| Invoices | ✅ | ✅ (location-scoped) |
| Cohorts | ✅ | ✅ (read-only) |
| Price Lists | ✅ | ✅ (read-only; resolved price lookup available) |
| Activity | ✅ | ✅ |

**Details tab — what assistant can edit:**
- Name, contact details, address, GSTIN, business name
- Credit terms (payment days)
- Notes

**Details tab — what assistant cannot edit:**
- Cohort assignment
- Price list assignment
- Tier / segment
- Credit limit (admin sets this)
- Customer status (active/inactive/deactivate)

**Orders / Estimates / Invoices tabs:** Full transaction history scoped to the assistant's accessible locations — not just the last 3. Columns: document number, date, status, amount, location. The assistant calling a customer has full visibility into every interaction at their locations. `GrowthPill` and spend trend are not shown — raw transaction list only.

**Resolved price lookup:** on the Price Lists tab (or as a CTA within the Details tab), a "Check price" action lets the assistant select a product and calls `resolve_price(customer_id, product_id, qty)`, returning the resolved price. No editing of price or discount allowed here.

### 6.3 Price Lists

**Purpose for assistant:** understand what prices exist; use the resolved price lookup on customer/order pages. Direct navigation to Price Lists is a fallback, not the primary workflow.

#### Landing page

| Column | seller_admin | seller_assistant |
|---|:---:|:---:|
| Price list name | ✅ | ✅ |
| Cohort | ✅ | ✅ |
| Validity window | ✅ | ✅ |
| Item count | ✅ | ✅ |
| Performance metrics | ✅ | ✗ |

**Landing page actions for assistant:** None. No "Create price list" button.

#### Detail page tabs

| Tab | seller_admin | seller_assistant |
|---|:---:|:---:|
| Details (line items: product, price, discount) | ✅ (editable) | ✅ (read-only) |
| Cohort members | ✅ | ✅ (read-only) |
| Performance | ✅ | ✗ (hidden) |
| Activity | ✅ | ✅ |

**Margin/cost columns** (if added in future): hidden for assistant in all price list views.

---

## 7. Performance Tab — Global Rule

**The Performance tab is hidden for `seller_assistant` across every module where it exists.**

Affected modules: Products, Customers. (Brands, Cohorts, Catalogs are admin-only and hidden entirely.)

For `seller_assistant`, the tab bar on detail pages shows only: **Details · [Entity-specific tabs] · Activity**.

Related entity tabs (e.g., Orders on Customer detail) are visible but always filtered to the assistant's assigned locations.

Implementation: gate the tab render on role:

```tsx
const tabs = [
  { id: 'details', label: 'Details' },
  ...(role === 'seller_admin' ? [{ id: 'performance', label: 'Performance' }] : []),
  { id: 'activity', label: 'Activity' },
  // entity-specific tabs follow
]
```

---

## 8. Sidebar Navigation

The sidebar is gated by **two independent conditions** that must both pass before a nav item renders:

1. **Feature flag is enabled** for the tenant (`df_<module>` is on in PostHog for this `tenant_id`).
2. **Role has access** to the module (see matrix below).

If either condition fails, the nav item is not rendered — not greyed out, not locked. A `seller_assistant` will never see a nav item for a disabled module even if their role would permit it, and an admin will never see a module the tenant hasn't enabled.

**Resolution logic (pseudocode):**

```ts
const navItems = ALL_NAV_ITEMS.filter(item =>
  isFeatureEnabled(item.flag, tenantId)        // PostHog flag check (server-side)
  && rolePermits(item.module, user.role)        // role matrix check
)
```

**Role × module matrix (assumes feature flag is on):**

| Nav item | Feature flag | seller_admin | seller_assistant |
|---|---|:---:|:---:|
| Dashboard | always on | ✅ | ✅ (operational variant) |
| Brands | `df_brand_product_master` | ✅ | ✗ |
| Products | `df_brand_product_master` | ✅ | ✅ (read-only) |
| Customers | `df_customer_master` | ✅ | ✅ |
| Cohorts | `df_cohorts` | ✅ | ✗ |
| Price Lists | `df_pricing_engine` | ✅ | ✅ (read-only) |
| Catalogs | `df_catalog_publishing` | ✅ | ✗ |
| Estimates | `df_estimates` | ✅ | ✅ |
| Sales Orders | `df_sales_orders` | ✅ | ✅ |
| Invoices | `df_invoices` | ✅ | ✅ |
| Exports | `df_tally_export` | ✅ | ✗ |
| Settings | always on | ✅ | ✗ |

**Example:** if `df_estimates` is off for the tenant, neither admin nor assistant sees Estimates in the sidebar. If `df_estimates` is on but the user is `seller_assistant`, the item renders. If the user is `seller_assistant` and `df_cohorts` is on, Cohorts still does not render (role blocks it).

---

## 9. Open Items / Decisions

| Item | Decision | Notes |
|---|---|---|
| Product inventory flag | Deferred to v1.1 | Inventory comes from Tally/Zoho sync only. No manual flagging in v1. |
| Customer deactivation | Admin only | Downstream effects on cohort membership and active catalogs. |
| Price lookup on Order composer | `resolve_price()` only — no edit price, no edit discount | Auto-resolves on customer + product selection. Display-only. |
| Notification routing | Separate epic | Order/enquiry notifications route to the assistant of the matched location (entity's `location_id`). Admin always receives a copy. Design in Notifications spec. |
| Multi-location assistant view | Merged by default | All assigned locations shown together. Location filter chip on landing pages lets assistant narrow to one location. No "switch location" context. |

---

## 10. Implementation Sequence

Build in this order to avoid rework:

1. **DB migrations** — `location_ids` on `tenant_users`; `location_id` on orders, estimates, invoices.
2. **JWT propagation** — embed `location_ids` in app metadata on login; middleware reads it.
3. **RPC location filtering** — update all list RPCs to accept and apply `p_location_ids`.
4. **Settings → Team** — location picker on invite/edit flow for `seller_assistant`.
5. **Sidebar rendering** — role-gated nav items.
6. **Performance tab gate** — role check on tab bar render in all detail page components.
7. **Dashboard operational variant** — new KPI tiles, callout data, and Recent Transactions feed.
8. **Document composers** — Location field in Basic Details strip; Place of Supply moved to left panel.
9. **Module-level column/action hiding** — Products (strip financials, read-only), Customers (strip spend columns, lock cohort/pricelist), Price Lists (strip actions).
10. **Inline price lookup** — `resolve_price()` on Customer detail (Price Lists tab) and Order/Estimate composer.
