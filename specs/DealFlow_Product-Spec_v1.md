# DealFlow — Product Spec v1

**Module:** Multibrand Distributor Cockpit + Cohort-Catalog Publishing + Custom Pricing
**Date:** 2026-05-19 (rev 2) | **For:** Phani | **Audience:** Solopreneur build plan, PMF-oriented MVP

---

## 1. Product Thesis (one paragraph)

Multibrand SMB distributors juggle 5-15 brand principals, each with its own catalog, pricing, and portal. They lose orders to chaos: agents don't know what's in stock, retailers don't see new arrivals, pricing is inconsistent across cohorts, and reconciliation is manual. **DealFlow is the distributor's own command center**: one place to manage all brands, publish geo/cohort-specific catalogs to retailers, run custom pricing, and capture orders — with a buyer-side mobile app that retailers actually use. MVP wins by making the distributor look 10x more organized to their retailers within 30 days of onboarding.

---

## 2. MVP Definition (Absolute Minimum to Sell)

### Must ship to take money

1. **Tenant onboarding** — sign up, set brand, invite 1-3 buyers.
2. **Brand & Product master** — add brands; add products to brands (with images, MRP, base price, GST, HSN).
3. **Customer (Buyer) Master** — create/import buyers with business info, GSTIN, geography, tier, credit terms, `external_ref`. **This is the foundation cohorts are built on — ships before cohorts.**
4. **Cohort builder** — create buyer cohorts (e.g., "North Delhi A-class", "Premium retailers") from the Customer Master.
5. **Custom pricing per cohort** — one price list per cohort, override base price.
6. **Catalog publishing** — pick products + cohort + validity window → publish.
7. **Buyer mobile app (PWA)** — login → see published catalogs → browse → add to cart → place order.
8. **Distributor cockpit (desktop responsive)** — see brands, products, customers, cohorts, catalogs, orders.
9. **Order management** — see incoming orders, change status (Received → Confirmed → Dispatched → Delivered → Cancelled).
10. **Tally CSV export** — invoice & order CSV in Tally-importable format. (No live API in MVP.)
11. **Search** — PostgreSQL full-text search + pgvector across cockpit + buyer app (no Typesense yet — see §8).
12. **RBAC + multitenant isolation** — strict tenant separation, four roles working.

### Explicitly **not in MVP** (defer ruthlessly)

- AI multimodal intake (WhatsApp/voice/email/image).
- Replenishment forecasting.
- Multi-portal brand aggregation.
- Payment reconciliation.
- Live Tally/Busy API (CSV first; **Zoho API is IN MVP — see §9**).
- Returns / claims management.
- Trade promotions / schemes.
- Brand-side dashboards (sell upstream later).
- Typesense search (PG full-text + pgvector first; migrate post-PMF — see §8).

**Rationale:** Items above are commodity in 12 months or 6+ weeks of work each. None unlock the first 10 paying customers. Cohort catalogs + custom pricing + buyer app close deals.

---

## 3. Tech Stack (locked)


| Layer                 | Choice                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime               | **Node**                                                                                                                                               |
| Framework             | **Next.js (App Router)** + React + Tailwind + shadcn/ui                                                                                                |
| Data fetching / cache | **TanStack Query**                                                                                                                                     |
| Validation / schemas  | **Zod** — shared client + server validation; single source of truth for types                                                                          |
| Backend logic         | **Supabase for now** — Postgres functions/RPC + RLS carry the business logic. **Defer** Vercel serverless functions until logic outgrows the DB layer. |
| DB / Auth / Realtime  | **Supabase** (Postgres + RLS + Auth + pgvector)                                                                                                        |
| Search                | **PostgreSQL full-text search + pgvector** (Typesense deferred until post-PMF — see §8)                                                                |
| File storage          | **Cloudflare R2** (product images, catalog assets, invoice PDFs) via S3-compatible API                                                                 |
| Analytics             | **PostHog** — product analytics, funnels, and feature-flag management (see §3A)                                                                        |
| Background jobs       | Supabase scheduled functions + pg_cron                                                                                                                 |
| Hosting               | **Vercel** (Next.js app)                                                                                                                               |
| Observability         | PostHog + Sentry (errors)                                                                                                                              |
| Email                 | Resend (transactional)                                                                                                                                 |
| WhatsApp              | Meta Cloud API via AiSensy/Interakt — **used for buyer OTP in MVP**, broader messaging in Phase 2                                                      |


---

## 3A. Engineering Principle — Feature Flags & Modular Build

**Rule: split the product into major features and build each behind a feature flag.** Nothing ships to all tenants by default; every major feature is a togglable slice you can enable per-tenant, per-environment, or per-cohort. Non-negotiable for a solo founder shipping continuously to live customers.

### Why

- **Ship incomplete work safely** — merge to main behind a flag that's off in production.
- **Pilot with one tenant** (e.g., turn Zoho sync on for WineYard only) before general release.
- **Kill switch** — disable a broken feature without a redeploy.
- **Clean PMF signal** — PostHog ties flag exposure to activation/retention, so you learn which features actually drive value.

### Major feature modules (each = one flag)

`tenant_onboarding`, `brand_product_master`, `customer_master`, `cohorts`, `pricing_engine`, `catalog_publishing`, `buyer_app`, `order_management`, `search`, `tally_export`, `zoho_integration`. Phase-2 modules (`ai_intake`, `replenishment`, `payments`, `lending`) are scaffolded as flags from day one, default off.

### Guidelines

- **Flag source of truth: PostHog feature flags.** Read flags server-side (Next.js) *and* client-side; gate both the UI and the underlying RPC/route so a flag-off feature can't be reached via the API.
- **Naming:** `df_<module>` (e.g., `df_zoho_integration`); boolean, or multivariate where a staged rollout helps.
- **Targeting:** support per-tenant overrides (by `tenant_id`) and percentage rollouts.
- **Default-off for anything not GA;** default-on only after a tenant pilot passes.
- **Flag hygiene:** every flag carries an owner note + removal date. Delete flags once a feature is 100% rolled out and stable — dead flags are tech debt.
- **DB-level safety:** RLS and RPCs must not assume a feature is enabled; a disabled module's tables simply go untouched.
- **Test matrix:** cross-tenant security tests run with flags both on and off.

---

## 4. Tenancy Model

- **Tenant = Distributor (seller).** One distributor business = one tenant.
- **Buyers (retailers / dealers / integrators) belong inside a tenant.** They are not tenants themselves — they're scoped customers of a distributor.
- **One auth user can be associated with multiple buyers across multiple tenants** (a retailer might buy from 3 distributors). Resolved via `tenant_users` and `buyer_users` link tables — not via duplicating identities.
- **Master catalog data (`catalog` schema) is global and reusable** — any tenant can reference or clone master brands/products. Reduces onboarding friction massively.

---

## 5. Database Schema Design

### 5.1 Three Postgres schemas


| Schema    | Purpose                                                                             | Visibility                    |
| --------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| `auth`    | Supabase-managed user identity                                                      | System                        |
| `catalog` | Master brands, products, categories — reusable across all tenants                   | Read-public, write-controlled |
| `app`     | All tenant business data: tenants, users, buyers, cohorts, prices, catalogs, orders | RLS-enforced per tenant       |


Naming `app` instead of `public` because the user asked for catalog to be separate from `public` — and Supabase tooling treats `public` specially. Cleaner to namespace explicitly.

### 5.2 Common conventions

- Primary key: `id uuid default gen_random_uuid()`.
- External reference: `external_ref text` — distributor-supplied ID from their ERP/Tally/Busy. Unique per tenant per entity type: `UNIQUE(tenant_id, external_ref)`.
- **Audit columns are MANDATORY on every table in every schema** (`catalog`, `app`, and any future schema): `created_at timestamptz default now()`, `updated_at timestamptz`, `created_by uuid`, `updated_by uuid`. `updated_at` is maintained by a shared trigger. DDL blocks below abbreviate these as `+ audit cols` — they are always present.
- Soft-delete via `deleted_at timestamptz` (not hard delete; needed for audit + Tally reconciliation).
- All FKs use `ON DELETE RESTRICT` by default; never cascade business data.

### 5.3 `catalog` schema — Master data (brand-centric)

```sql
catalog.brands
  id uuid PK
  name text NOT NULL
  slug text UNIQUE NOT NULL
  logo_url text
  description text
  origin_tenant_id uuid NULL          -- who first added it
  is_public boolean DEFAULT true      -- if false, only origin tenant sees
  external_ref text NULL              -- e.g., GS1 brand code
  embedding vector(1536) NULL         -- pgvector, deferred use
  + audit cols (created_at, updated_at, created_by, updated_by)

catalog.categories
  id uuid PK
  name text NOT NULL
  parent_id uuid NULL REFERENCES catalog.categories(id)
  slug text NOT NULL
  image_url text                      -- category banner/thumbnail (Cloudflare R2)
  embedding vector(1536) NULL         -- pgvector, semantic category matching
  is_public boolean DEFAULT true
  external_ref text NULL
  + audit cols (created_at, updated_at, created_by, updated_by)
  UNIQUE(parent_id, slug)

catalog.products
  id uuid PK
  brand_id uuid REFERENCES catalog.brands(id)
  category_id uuid REFERENCES catalog.categories(id)
  master_sku text NOT NULL            -- GS1/EAN/UPC or canonical SKU
  name text NOT NULL
  description text
  default_uom text                    -- pcs, kg, ltr, box
  pack_size numeric
  hsn_code text
  gst_rate numeric                    -- India-specific
  attributes jsonb DEFAULT '{}'       -- flexible: color, size, weight, etc.
  image_urls text[] DEFAULT '{}'
  is_public boolean DEFAULT true
  embedding vector(1536) NULL
  external_ref text NULL
  + audit cols (created_at, updated_at, created_by, updated_by)
  UNIQUE(brand_id, master_sku)

catalog.product_aliases
  id uuid PK
  product_id uuid REFERENCES catalog.products(id)
  alias text NOT NULL                 -- common names, vernacular, abbreviations
  language text
  embedding vector(1536) NULL
```

### 5.4 `app` schema — Tenant business data

```sql
app.tenants
  id uuid PK
  slug text UNIQUE NOT NULL
  business_name text NOT NULL
  gstin text
  primary_state text
  subdomain text UNIQUE
  plan text DEFAULT 'starter'         -- starter | growth | scale
  settings jsonb DEFAULT '{}'         -- theme overrides, currency, etc.
  + audit cols (created_at, updated_at, created_by, updated_by)
  -- NOTE: every app.* table below also carries + audit cols (omitted for brevity)

app.tenant_users
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  user_id uuid REFERENCES auth.users(id)
  role text CHECK (role IN ('seller_admin','seller_assistant'))
  is_active boolean DEFAULT true
  invited_at, joined_at
  UNIQUE(tenant_id, user_id)

app.tenant_brands
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  master_brand_id uuid REFERENCES catalog.brands(id)
  display_name_override text
  margin_pct numeric                  -- planning aid
  exclusivity boolean DEFAULT false
  is_active boolean DEFAULT true
  external_ref text
  UNIQUE(tenant_id, master_brand_id)

app.tenant_products
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  tenant_brand_id uuid REFERENCES app.tenant_brands(id)
  master_product_id uuid NULL REFERENCES catalog.products(id)   -- nullable if private/custom
  internal_sku text                   -- distributor's own SKU
  name_override text
  attributes_override jsonb DEFAULT '{}'
  mrp numeric
  base_selling_price numeric
  cost_price numeric                  -- private; not exposed buyer-side
  default_uom text
  pack_size numeric
  image_urls text[]                   -- override master
  is_active boolean DEFAULT true
  external_ref text                   -- Tally item ID
  UNIQUE(tenant_id, internal_sku)

app.tenant_inventory
  id uuid PK
  tenant_product_id uuid REFERENCES app.tenant_products(id)
  location_id uuid REFERENCES app.locations(id)
  qty_available numeric DEFAULT 0
  qty_reserved numeric DEFAULT 0
  reorder_point numeric
  updated_at

app.locations
  id uuid PK
  tenant_id uuid
  name text                            -- warehouse, godown, branch
  address jsonb
  is_default boolean

app.buyers
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  business_name text NOT NULL
  contact_name text
  phone text
  email text
  gstin text
  geography jsonb                     -- {city, state, pincode, zone}
  credit_limit numeric DEFAULT 0
  payment_terms_days integer DEFAULT 0
  tier text                           -- A, B, C class — for cohort rules
  external_ref text
  is_active boolean DEFAULT true
  UNIQUE(tenant_id, external_ref)

app.buyer_users
  id uuid PK
  buyer_id uuid REFERENCES app.buyers(id)
  user_id uuid REFERENCES auth.users(id)
  role text CHECK (role IN ('buyer_admin','buyer_assistant'))
  is_active boolean DEFAULT true
  UNIQUE(buyer_id, user_id)

app.cohorts
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  name text NOT NULL
  description text
  rules jsonb                         -- {geography.state:'KA', tier:'A', brand_focus:[...]}
  is_static boolean DEFAULT false     -- true = manual list, false = rules evaluated live
  cached_member_count integer
  created_at

app.cohort_members            -- only used when cohort.is_static = true
  cohort_id uuid REFERENCES app.cohorts(id)
  buyer_id uuid REFERENCES app.buyers(id)
  PRIMARY KEY (cohort_id, buyer_id)

app.price_lists
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  name text
  currency text DEFAULT 'INR'
  valid_from timestamptz
  valid_to timestamptz
  priority integer DEFAULT 0          -- higher wins on conflict
  is_active boolean DEFAULT true

app.price_list_items
  id uuid PK
  price_list_id uuid REFERENCES app.price_lists(id)
  tenant_product_id uuid REFERENCES app.tenant_products(id)
  price numeric NOT NULL
  min_qty numeric DEFAULT 1
  max_qty numeric NULL
  UNIQUE(price_list_id, tenant_product_id, min_qty)

app.price_list_assignments
  id uuid PK
  price_list_id uuid REFERENCES app.price_lists(id)
  target_type text CHECK (target_type IN ('buyer','cohort','all_buyers'))
  target_id uuid NULL                 -- null when target_type='all_buyers'

app.published_catalogs
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  name text NOT NULL
  scope_type text CHECK (scope_type IN ('cohort','buyer','geography','all'))
  scope_value jsonb                   -- {cohort_id:..} or {buyer_id:..} or {state:'KA',city:'BLR'}
  valid_from timestamptz
  valid_to timestamptz
  status text CHECK (status IN ('draft','published','archived'))
  hero_image_url text
  message text                        -- "New arrivals from Brand X this week"
  share_token text UNIQUE             -- public PWA link for buyer
  created_by uuid

app.published_catalog_items
  id uuid PK
  catalog_id uuid REFERENCES app.published_catalogs(id)
  tenant_product_id uuid REFERENCES app.tenant_products(id)
  is_featured boolean DEFAULT false
  display_order integer
  price_override numeric NULL
  UNIQUE(catalog_id, tenant_product_id)

app.orders
  id uuid PK
  tenant_id uuid REFERENCES app.tenants(id)
  buyer_id uuid REFERENCES app.buyers(id)
  placed_by uuid REFERENCES auth.users(id)
  order_number text                   -- human-readable: DF-2026-00123
  status text CHECK (status IN
    ('draft','received','confirmed','partially_dispatched','dispatched','delivered','cancelled'))
  source text                         -- 'buyer_app','cockpit_manual','csv_import' (later: 'whatsapp','email')
  catalog_id uuid NULL                -- which published catalog drove this order
  subtotal numeric, tax_amount numeric, total_amount numeric
  currency text DEFAULT 'INR'
  notes text
  placed_at timestamptz
  external_ref text
  UNIQUE(tenant_id, order_number)

app.order_items
  id uuid PK
  order_id uuid REFERENCES app.orders(id)
  tenant_product_id uuid REFERENCES app.tenant_products(id)
  qty numeric, unit_price numeric, tax_rate numeric, line_total numeric

app.audit_log
  id bigserial PK
  tenant_id uuid
  actor_user_id uuid
  entity_type text
  entity_id uuid
  action text                         -- create | update | delete | publish | status_change
  diff jsonb
  ts timestamptz DEFAULT now()
```

### 5.5 Pricing resolution function

Single function `app.resolve_price(tenant_product_id, buyer_id, qty)` returns the effective price by evaluating in order: (1) catalog `price_override`, (2) price lists assigned to buyer (highest priority + valid window), (3) price lists assigned to any cohort the buyer belongs to, (4) price lists assigned to `all_buyers`, (5) fallback to `tenant_products.base_selling_price`. Deterministic, indexable, testable.

---

## 6. RBAC — Four Roles + RLS

### 6.1 Role matrix


| Capability                   | seller_admin | seller_assistant | buyer_admin | buyer_assistant         |
| ---------------------------- | ------------ | ---------------- | ----------- | ----------------------- |
| Manage tenant settings       | ✓            | ✗                | ✗           | ✗                       |
| Invite/manage seller users   | ✓            | ✗                | ✗           | ✗                       |
| Manage brands & products     | ✓            | ✓                | ✗           | ✗                       |
| Manage cost prices           | ✓            | ✗                | ✗           | ✗                       |
| Manage cohorts & price lists | ✓            | ✗                | ✗           | ✗                       |
| Publish catalogs             | ✓            | ✓                | ✗           | ✗                       |
| Manage buyer master data     | ✓            | ✓                | ✗           | ✗                       |
| View all tenant orders       | ✓            | ✓                | ✗           | ✗                       |
| Change order status          | ✓            | ✓                | ✗           | ✗                       |
| Export to Tally CSV          | ✓            | ✓                | ✗           | ✗                       |
| Browse published catalogs    | ✗            | ✗                | ✓           | ✓                       |
| Place orders                 | ✗            | ✗                | ✓           | ✓ (submit for approval) |
| Approve buyer-side orders    | ✗            | ✗                | ✓           | ✗                       |
| Manage own buyer users       | ✗            | ✗                | ✓           | ✗                       |
| View own buyer's orders      | ✗            | ✗                | ✓           | ✓                       |


### 6.2 RLS enforcement strategy

- **JWT claims** (Supabase custom claim hook): `tenant_id`, `buyer_id` (nullable), `role`.
- Every `app.`* table has RLS policies keyed off `auth.jwt() ->> 'tenant_id'` and role.
- Buyer-side reads filter additionally by `buyer_id` matching their assigned buyers.
- `catalog.`* tables: `is_public = true` is readable by everyone; non-public rows only by `origin_tenant_id`.
- Write paths for sensitive operations (publish catalog, change order status, export Tally) go through Postgres functions with `SECURITY DEFINER`, double-checking role inside.

### 6.3 Multi-tenant gotchas to handle from day one

- **One user, many tenants:** Resolve "current tenant" via subdomain or explicit tenant-switch in app; never trust client-supplied tenant_id without verifying membership.
- **Buyer associated with multiple distributors:** `buyer_users` is the source of truth, not `tenants`.
- **Cross-tenant leakage tests:** Write 5 integration tests on day 1 that try to access another tenant's data. Run on every PR.

---

## 7. Two Interfaces

### 7.1 Distributor Cockpit (desktop-first, mobile responsive)

**Route group:** `app/(seller)/` — all routes under this group render inside `SellerShell`.

URL: `{slug}.dealflow.in` in production. In local dev: `localhost:3000/dashboard` etc. (no subdomain routing in dev).

**Shell structure** (`src/components/layout/`):

| Component | File | Details |
|---|---|---|
| `SellerShell` | `SellerShell.tsx` | Grid: fixed 248px sidebar left + `main` with `marginLeft: var(--sidebar-w)` and `paddingTop: var(--topbar-h)` |
| `SellerSidebar` | `SellerSidebar.tsx` | `bg-cream-50 border-r border-cream-300`. 248px fixed. Logo top, nav items, user footer (mt-auto) |
| `SellerTopbar` | `SellerTopbar.tsx` | `bg-cream-100 border-b border-cream-300`. 64px fixed. Props: `title`, optional `action` node |

Theme applied by `<ThemeProvider surface="seller">` in `app/(seller)/layout.tsx` — adds class `theme-seller` to `<html>`.

**Nav (left sidebar) — each item is a lucide icon + label:**

1. Dashboard (`LayoutDashboard`) — orders today, top brands, low-stock alerts. *MVP keeps it static, no fancy charts.*
2. Brands (`Tag`) — add from master / create new
3. Products (`Package`) — browse, edit, bulk CSV upload
4. Customers (`Users`) — Customer Master: CRUD, tiers, credit info, import
5. Cohorts (`UsersRound`) — rules builder + preview
6. Price Lists (`IndianRupee`) — line-item editor
7. Catalogs (`BookOpen`) — draft → publish flow
8. Orders (`ShoppingCart`) — table with status filters
9. Exports (`FileDown`) — Tally CSV download
10. Settings (`Settings`) — users, theme, integrations

Active nav item: `bg-teal-500 text-cream-50 rounded-sm`. Hover: `bg-cream-200`.

**Sidebar footer (bottom-aligned):** user block pinned with `mt-auto` — avatar (initial from email) + email + role chip + Logout button (`LogOut` icon + label).

**Key flows (MVP must-have):**

- *Add a brand:* search master → "Use this brand" → optional override → done.
- *Add a product:* search master → adjust price/SKU → save. Or "Create custom product."
- *Build a cohort:* visual rule builder ("buyers where state=KA AND tier=A") + preview count.
- *Publish a catalog:* select products → select cohort → set validity → preview as buyer → publish. Generates a `share_token` link.
- *View order:* line items, status timeline, change status, export PDF invoice.

### 7.2 Buyer App (mobile-first PWA)

**Route group:** `app/(buyer)/shop/*` — all buyer routes render inside `BuyerShell`.

URL: `shop.dealflow.in/{share_token}` in production. In local dev: `localhost:3000/shop/catalog` etc. The `/shop/` prefix disambiguates buyer routes from seller routes in the single-app (they share the same Next.js process; in production different subdomains serve the respective surfaces).

**Shell structure** (`src/components/layout/`):

| Component | File | Details |
|---|---|---|
| `BuyerShell` | `BuyerShell.tsx` | Flex column: header (fixed) + scrollable body + tab bar (fixed). `paddingTop: var(--header-h)`, `paddingBottom: calc(var(--tab-bar-h) + env(safe-area-inset-bottom))` |
| `BuyerHeader` | `BuyerHeader.tsx` | Frosted glass: `rgba(253,251,247,0.92)` + `backdrop-blur-md`. 52px. Optional back button (`showBack` prop). `paddingTop: env(safe-area-inset-top)` for iOS notch |
| `BuyerTabBar` | `BuyerTabBar.tsx` | Frosted glass bottom. 60px + `env(safe-area-inset-bottom)`. 4 primary tabs: **Home · Catalog · Orders · Profile**. Cart is a deep screen (no tab). Active: `text-teal-500` |

Theme applied by `<ThemeProvider surface="buyer">` in `app/(buyer)/layout.tsx` — adds class `theme-buyer` to `<html>`.

**Buyer routes (local dev paths):**

| Screen | Path | Tab bar? |
|---|---|---|
| Home (dashboard) | `/shop/home` | ✅ primary tab |
| Catalog browse | `/shop/catalog` | ✅ primary tab |
| Orders | `/shop/orders` | ✅ primary tab |
| Profile | `/shop/profile` | ✅ primary tab |
| Product detail | `/shop/product/[id]` | ❌ deep screen |
| Cart | `/shop/cart` | ❌ deep screen |
| Checkout | `/shop/checkout` | ❌ deep screen |
| Order placed | `/shop/checkout` | ❌ deep screen |

**Auth: WhatsApp OTP (locked).** No passwords. Buyer enters phone number → receives a one-time code on **WhatsApp** (Meta Cloud API via AiSensy/Interakt) → logged in. Fits Indian SMB WhatsApp-first behavior and dodges SMS deliverability/cost issues.

**Two access modes:**

1. **Tokenized (low friction):** Tap catalog link from WhatsApp → browse → add to cart → WhatsApp OTP → place order.
2. **Authenticated (returning buyers):** Persistent session after first WhatsApp OTP; sees all catalogs across distributors they're linked to.

**Screens (MVP):**

1. Home: catalogs published to me, recent orders, "Order again."
2. Catalog browse: grid, filter by brand/category, full-text search bar (PG FTS + pgvector — see §8).
3. Product detail: images, price (resolved), pack, MOQ, add to cart.
4. Cart + checkout: review, delivery address, place order.
5. Orders: list + status.
6. Profile: business info, linked distributors.

**Premium comfort aesthetic** (see §10).

---

## 8. Search (PostgreSQL full-text + pgvector — Typesense deferred)

**Decision:** until PMF, search runs entirely inside Postgres. No external search infra to operate, no sync pipeline to maintain, one less thing to break as a solo founder. Migrate to Typesense only when catalog size or query volume makes PG search the bottleneck (a good problem to have).

### Implementation

- **Lexical:** a generated `tsvector` column (`search_doc`) on `catalog.products` and `app.tenant_products`, built from name + brand + category + aliases + key attributes. GIN-indexed. Use `websearch_to_tsquery` for forgiving parsing, `ts_rank_cd` for ranking.
- **Semantic (pgvector):** `embedding vector(1536)` on products/categories/aliases, backfilled in a batch job. HNSW index for ANN. Handles intent queries ("night vision dome camera" matches even without exact tokens) and "similar products."
- **Hybrid ranking:** combine FTS rank and vector distance with a weighted score (e.g., `0.6*fts + 0.4*vector`). Wrap in a single `app.search_products(tenant_id, query, filters)` RPC so the frontend has one entry point.
- **Facets/filters:** brand, category, price range, in-stock — plain SQL `WHERE`; cheap at MVP scale.

### Why this is enough for MVP

- Distributor catalogs at MVP scale (hundreds–low thousands of SKUs/tenant) are trivial for Postgres.
- pgvector delivers "smart" search that feels premium without standing up Typesense.

### Migration trigger (post-PMF)

- Move to Typesense when per-tenant SKUs exceed ~50k, p95 search latency degrades, or you need typo-tolerant typeahead at scale. The `app.search_products` RPC is the single seam to swap behind — the frontend won't change. Gate the swap behind the `df_search` flag.

---

## 9. Integration & External Reference Standards

- Every business entity exposes `external_ref` for ERP/Tally/Busy mapping.
- **Tally CSV export format (MVP):**
  - Item Master CSV (mapped from `tenant_products`).
  - Sales Voucher CSV (mapped from `orders` with status ≥ `dispatched`).
  - Ledger Master CSV (mapped from `buyers`).
  - Format: TallyPrime's XML-import-equivalent CSV. Document the column mapping.
- **Import CSV (MVP):**
  - Buyers CSV upload (with external_ref column).
  - Products CSV upload.
  - Provides a parse → preview → confirm UI.
- **Zoho integration (IN MVP — WineYard conversion path):** build a Zoho Books/Inventory connector (OAuth + REST) syncing items, customers (ledgers), and sales orders/invoices. This is the wedge to convert **WineYard (CCTV products distributor)** into the first paying SaaS customer — they're on Zoho, so a working sync removes their main objection. Scope tight: item-master push, customer-master push, sales-order/invoice push, with `external_ref` holding the Zoho record ID. Ship behind `df_zoho_integration`, piloted on WineYard's tenant first.
- **Tally (CSV in MVP, API later):** Tally stays CSV-only for MVP; live Tally API and Busy are Phase 2.
- **Webhooks (Phase 2):** Outbound webhook on order status change for future Tally/Busy connectors.
- **API versioning:** All public endpoints under `/v1/`. Internal RPCs not versioned.

---

## 10. Theme & Aesthetic — "Ember & Cream"

**The design system is fully implemented.** Tokens live in `src/lib/theme/tokens.ts` (single source of truth) and are wired into `tailwind.config.ts`. All token classes (`bg-cream-100`, `text-teal-500`, `shadow-md`, etc.) are available in every component. Do not hardcode hex values — always use token utilities.

**Intent:** the default SaaS blue-on-white signals "tool." For SMB distributors running long-established family businesses, aim for **premium, calm, trustworthy, slightly aspirational** — closer to private banking or a quiet artisan brand than typical B2B SaaS.

### Color Palette (Ember & Cream)

| Scale | Purpose | Key values |
|---|---|---|
| **Cream** (50–900) | Page backgrounds, cards, borders | 50: `#FDFBF7` · 100: `#FAF7F2` · 200: `#F4EFE6` · 300: `#EFE9DF` · 900: `#1A1A1A` |
| **Teal** (50–900) | Primary actions, sidebar active, brand | 500: `#1F3A34` (primary) · 400: `#346A5C` · 300: `#5D8E81` |
| **Ember** (50–800) | Accent, focus rings, CTAs | 400: `#C26E3A` (accent) · 300: `#DC9655` · 500: `#A55A2B` |
| **Semantic** | Success / Warning / Danger / Info | 500-weight is the functional color; 50 is background tint |

### Typography

| Font | Family | Usage |
|---|---|---|
| **Fraunces** | Serif display | `font-display` — h1/h2/h3, hero text, brand name |
| **Inter** | Sans-serif body | `font-sans` — all body copy, labels, navigation |
| **JetBrains Mono** | Monospace | `font-mono` — prices, SKUs, order numbers, code |

Loaded via Google Fonts in `app/globals.css`. Always set `font-display: swap`.

### Spacing & Radii

- Base 8px grid: tokens `1`–`11` map to 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72 / 96 px.
- Border radius: `xs` (4px) → `sm` (6px) → `md` (10px) → `lg` (14px) → `xl` (20px) → `2xl` (28px) → `pill` (999px).
- Shadow scale `xs`–`xl` uses warm-tinted `rgba(31, 58, 52, ...)` — never cool grey.

### Token locations (authoritative)

| Asset | File |
|---|---|
| Token definitions | `src/lib/theme/tokens.ts` |
| Tailwind config | `tailwind.config.ts` |
| CSS custom properties + base styles | `app/globals.css` |
| Theme provider (surface switcher) | `src/components/providers/ThemeProvider.tsx` |
| Layout constants | `src/lib/theme/tokens.ts` → `layout` export |

### Component principles

- shadcn/ui as the base; all CSS variables already mapped to Ember & Cream tokens in `tailwind.config.ts`.
- **All CTAs and primary buttons use a lucide-react icon + text label** — never icon-only for primary actions. e.g., "Publish catalog" = `<Send/>` + label; "Add product" = `<Plus/>` + label; "Export to Tally" = `<FileDown/>` + label; "Logout" = `<LogOut/>` + label. Icon sits left of text, 16px.
- Rounded radii (`lg` = 14px for cards, `md` = 10px for inputs), subtle warm shadows, generous whitespace; denser tables in the cockpit, airier layout in the buyer app.
- One restrained illustration accent on empty states — brand presence without noise.

### Buyer-side mood

- Treat the buyer catalog like a curated lookbook, not a SKU grid: hero image, product cards with breathing room, MRP struck through with the cohort price highlighted. This is what makes the distributor look 10x more organized.

---

## 11. Build Sequence (12-Week Solo Plan)


| Week | Deliverable                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | ✅ Next.js + Supabase setup, schemas, base RLS, auth + tenant subdomain routing, PostHog + feature-flag scaffold (§3A), Zod base schemas             |
| 2    | ✅ Ember & Cream design tokens → `tokens.ts` + `tailwind.config.ts`; ThemeProvider (seller/buyer surfaces); SellerShell + BuyerShell + all route groups; stub pages for all seller + buyer routes |
| 3    | Brands + products CRUD in cockpit, CSV import, Cloudflare R2 image uploads                                                                        |
| 4    | **Customer Master** CRUD + import → then cohorts (rule engine + static lists) + cohort preview                                                    |
| 5    | Price lists + assignments + `resolve_price()` function + tests                                                                                    |
| 6    | Catalog publishing flow (draft → publish, share_token generation)                                                                                 |
| 7    | Buyer PWA shell, **WhatsApp OTP** auth, catalog browse via share_token                                                                            |
| 8    | Buyer cart + checkout + order placement                                                                                                           |
| 9    | Orders cockpit (list, detail, status changes, invoice PDF)                                                                                        |
| 10   | PG full-text + pgvector search (`search_products` RPC + search UI)                                                                                |
| 11   | Tally CSV export + **Zoho integration (WineYard pilot)** + CSV import polish                                                                      |
| 12   | Cross-tenant security tests (flags on + off), onboarding polish, first paid customer                                                              |


### Daily discipline (non-negotiable for solopreneur)

- One demo a week to a real prospect distributor, even before product is ready.
- Don't build features you haven't validated in a demo.
- Every Friday: ship to Vercel, even if behind a feature flag.

---

## 12. Go-To-Market for MVP

1. **Anchor on WineYard (CCTV products distributor):** convert to the new SaaS package via the **Zoho integration** (their main objection). Land a case study + reference logo.
2. **Outbound to 50 distributors** in the target ICP — **electricals, electronics, mobiles, beauty/personal care** (multibrand, catalog-heavy, cohort pricing matters, distributor layer is structurally permanent). Lead the demo with cohort catalog publishing — that's the wow moment.
3. **Convert 5 paid customers in 90 days** at ₹10-25K/mo. That's your PMF signal.
4. **Don't take consulting/customization money** in MVP phase; it pulls you off product.

---

## 13. Decisions Locked (from Phani)

1. **Design system / palette:** separate Design System file (generated via Claude Design); frontend consumes its tokens. Spec no longer hard-codes colors (see §10).
2. **Tally:** CSV for MVP. **Plus a Zoho integration in MVP** to convert WineYard (their ERP) into the first paying SaaS customer (see §9, §11).
3. **Buyer auth:** **WhatsApp OTP** — no passwords (see §7.2).
4. **Domains:** **subdomain per tenant** (`{slug}.dealflow.in`); custom domains later.
5. **ICP for first 50 outbound:** **electricals, electronics, mobiles, beauty/personal care.**

Next deliverables on request: day-1 schema migration scripts, the feature-flag scaffold (§3A), and the shared Zod schemas.