# DealFlow — Project AGENTS.md

## Product in One Line
Distributor command center: manage multibrand catalogs, publish cohort-specific pricing to retailers, capture orders via a buyer PWA. Target: Indian SMB multibrand distributors.

---

## Tech Stack (locked — do not debate)
| Layer | Choice |
|---|---|
| Framework | Next.js App Router + React + Tailwind + shadcn/ui |
| Validation | Zod — shared client + server, single type source |
| Backend | Supabase (Postgres + RLS + Auth + pgvector) |
| Business logic | Postgres RPCs/functions. Defer Vercel serverless until logic outgrows DB |
| Search | PG full-text (tsvector + GIN) + pgvector hybrid. No Typesense until post-PMF |
| File storage | Cloudflare R2 via S3-compatible API |
| Analytics + flags | PostHog (product analytics + feature flags) |
| Background jobs | Supabase pg_cron + scheduled functions |
| Hosting | Vercel |
| Email | Resend |
| WhatsApp OTP | Meta Cloud API via AiSensy/Interakt |
| Observability | PostHog + Sentry |

---

## Project Structure
```
dealflow/
├── app/                          # Next.js App Router
│   ├── (auth)/                  # Auth routes
│   ├── (seller)/                # Distributor seller routes (dashboard, brands, products, buyers, cohorts, price-lists, catalogs, orders, exports, settings)
│   ├── (buyer)/shop/            # Buyer PWA routes (home, catalog, orders, profile + deep: product/[id], cart, checkout)
│   ├── api/                     # API routes & RPC wrappers
│   ├── layout.tsx
│   └── globals.css
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── layout/             # Layout components (sidebar, nav, shells)
│   │   ├── seller/             # Distributor seller features (was: cockpit/)
│   │   └── buyer/              # Buyer app components
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client & auth helpers
│   │   ├── zod.ts              # Shared Zod schemas
│   │   └── utils.ts            # Utilities
│   ├── hooks/                  # React hooks (useQuery, useAuth, etc.)
│   ├── contexts/               # React contexts (AuthContext, TenantContext)
│   ├── types/                  # TypeScript types (generated from Zod)
│   ├── constants/              # Feature flags, roles, etc.
│   └── styles/                 # Tailwind config, design tokens
├── supabase/
│   ├── migrations/             # SQL migrations (schemas, RLS, functions)
│   ├── seed.sql                # Master catalog seed data
│   └── functions/              # Edge functions (create-user, batch-assignments, etc.)
├── public/                      # Static assets
├── .env.example
├── .env.local                   # Git-ignored local secrets
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── AGENTS.md                    # This file
```

---

## Spacing & Layout Standard
- Forms, dialogs, alert dialogs, and confirmation sheets must use clear `header` / `body` / `footer` spacing, not ad hoc stacked blocks.
- Keep modal inner spacing balanced: header padding at the top, consistent body padding, and a dedicated footer row for actions.
- Use the shared dialog primitives (`DialogHeader`, `DialogBody`, `DialogFooter`) whenever possible so spacing stays consistent across screens.
- For two-column form rows, keep labels, inputs, and helper text aligned with the form grid and avoid collapsing helper text into the action row.

---

## Database: Three Schemas
- **`auth`** — Supabase-managed identity (system-owned)
- **`catalog`** — Master brands, products, categories. Reusable across tenants. `is_public = true` is global-readable.
- **`app`** — All tenant business data. RLS-enforced per tenant.

### Mandatory conventions on every table
- PK: `id uuid default gen_random_uuid()`
- Audit: `created_at`, `updated_at`, `created_by`, `updated_by` — non-negotiable
- Soft-delete: `deleted_at timestamptz` (never hard-delete business data)
- ERP mapping: `external_ref text` — unique per `(tenant_id, external_ref)`
- All FKs: `ON DELETE RESTRICT` — never cascade business data

### Key `app` tables
- `tenants` → `tenant_users` → `tenant_brands` → `tenant_products` → `tenant_inventory`
- `buyers` → `buyer_users` → `cohorts` → `cohort_members`
- `price_lists` → `price_list_items` → `price_list_assignments`
- `published_catalogs` → `published_catalog_items`
- `orders` → `order_items`
- `audit_log` (append-only, every entity mutation)

### Pricing resolution
Single function `app.resolve_price(tenant_product_id, buyer_id, qty)` → evaluates in order:
1. Catalog `price_override` → 2. Buyer price lists (highest priority + valid window) → 3. Cohort price lists → 4. `all_buyers` → 5. `base_selling_price`

---

## Tenancy Model
- **Tenant = Distributor.** One business = one tenant. Subdomain: `{slug}.dealflow.in`
- **Buyers belong inside a tenant** — not tenants themselves
- One auth user can link to multiple buyers across multiple tenants (via `buyer_users` join table)
- JWT claims carry `tenant_id`, `buyer_id` (nullable), `role` — verify on every request

---

## RBAC: Four Roles
`seller_admin` | `seller_assistant` | `buyer_admin` | `buyer_assistant`

- Seller roles manage brands, products, cohorts, catalogs, orders, Tally export
- `seller_admin` only: settings, users, cost prices, cohort/price-list management
- Buyer roles browse catalogs and place orders only
- Sensitive ops (publish catalog, status change, Tally export) go through `SECURITY DEFINER` RPCs — role double-checked inside DB function

---

## Feature Flags (PostHog — non-negotiable)
Every major feature ships behind `df_<module>` flag. Default off until tenant pilot passes.

Modules: `df_tenant_onboarding`, `df_brand_product_master`, `df_customer_master`, `df_cohorts`, `df_pricing_engine`, `df_catalog_publishing`, `df_buyer_app`, `df_order_management`, `df_search`, `df_tally_export`, `df_zoho_integration`

Phase-2 scaffolded off: `df_ai_intake`, `df_replenishment`, `df_payments`

**Rules:** Gate both UI and RPC. Support per-`tenant_id` targeting. Every flag has owner + removal date.

---

## Two Interfaces

### Distributor Cockpit
URL: `{slug}.dealflow.in` — desktop-first, left sidebar nav with 10 nav items (Dashboard, Brands, Products, Customers, Cohorts, Price Lists, Catalogs, Orders, Exports, Settings). Footer: user avatar + name + role + logout (pinned with `mt-auto`).

### Buyer PWA
URL: `shop.dealflow.in/{share_token}` — mobile-first, WhatsApp OTP auth (no passwords). Two modes: tokenized (share link → OTP → order) and authenticated (persistent session).

**Tab bar (4 primary tabs):** Home / Catalog / Orders / Profile
**Deep screens (no tab bar):** Product detail, Cart, Checkout, Order Placed

- **Home** — KPI grid (annual spend, open orders, credit limit), distributor list, "order again" horizontal scroll, new catalogs, recent activity
- **Catalog** — search, location/delivery picker, filter chips, catalogs scroll, category grid, brand chips, product grid
- **Orders** — sub-tabs (Orders / Enquiries / Invoices), status filter chips, order cards
- **Profile** — avatar head, account card (business/GSTIN/credit/delivery), preferences, logout

All primary buttons: lucide icon (left, 16px) + text label. Never icon-only for CTAs.

---

## MVP Scope — Build This
1. Tenant onboarding + subdomain routing
2. Brand & Product master (CRUD + CSV import + R2 image upload)
3. Customer (Buyer) Master — CRUD + CSV import. **Ships before cohorts.**
4. Cohort builder — rule-based + static lists + preview count
5. Custom pricing per cohort + `resolve_price()` RPC
6. Catalog publishing — draft → publish → share_token
7. Buyer PWA — WhatsApp OTP, catalog browse, cart, order placement
8. Distributor cockpit — brands, products, customers, cohorts, catalogs, orders
9. Order management — status workflow (draft → received → confirmed → dispatched → delivered → cancelled)
10. Tally CSV export (Item Master, Sales Voucher, Ledger Master CSVs)
11. Zoho Books/Inventory connector — piloted on WineYard tenant first, behind `df_zoho_integration`
12. PG full-text + pgvector hybrid search via `app.search_products(tenant_id, query, filters)` RPC

## Not In MVP — Defer Ruthlessly
AI multimodal intake, replenishment forecasting, payment reconciliation, live Tally/Busy API, returns management, trade promotions, brand-side dashboards, Typesense, webhooks.

---

## WineYard (First Customer)
CCTV products distributor. On Zoho. The Zoho integration is the conversion wedge — removes their main objection to switching. Pilot the `df_zoho_integration` flag on WineYard's tenant. Goal: convert to ₹50-75K/mo Scale-tier SaaS package.

---

## Security Non-Negotiables
- 5 cross-tenant isolation tests on day 1 — run on every PR
- Run security tests with feature flags both on and off
- Never trust client-supplied `tenant_id` — always verify membership from JWT
- RLS on all `app.*` tables; `catalog.*` enforces `is_public` + `origin_tenant_id`

---

## Development Setup

### Prerequisites
```bash
node >= 18
npm (or bun)
```

### Local Setup
```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local

# 3. Run migrations on Supabase (see supabase/migrations/)
# Use Supabase dashboard or CLI

# 4. Seed master catalog (see supabase/seed.sql)

# 5. Start dev server
npm run dev

# App runs at http://localhost:3000
```

### Environment Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-role-key>

NEXT_PUBLIC_POSTHOG_KEY=<posthog-project-key>

CLOUDFLARE_ACCOUNT_ID=<r2-account-id>
CLOUDFLARE_API_TOKEN=<r2-token>

RESEND_API_KEY=<resend-api-key>

NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER_ID=<aisemsy-phone-id>
AISEMSY_AUTH_TOKEN=<aisemsy-token>

ZOHO_CLIENT_ID=<zoho-oauth-client-id>
ZOHO_CLIENT_SECRET=<zoho-oauth-secret>
```

---

## Build Sequence (12 weeks)
Wk 1: Setup, schemas, RLS, auth, PostHog/flag scaffold, Zod base schemas
Wk 2: Design system tokens → Tailwind/shadcn, layout shells, sidebar
Wk 3: Brands + products CRUD + CSV import + R2 images
Wk 4: Customer Master → Cohorts (rule engine + preview)
Wk 5: Price lists + `resolve_price()` + tests
Wk 6: Catalog publishing flow + share_token
Wk 7: Buyer PWA shell + WhatsApp OTP
Wk 8: Cart + checkout + order placement
Wk 9: Orders cockpit (list, detail, status, invoice PDF)
Wk 10: PG FTS + pgvector search
Wk 11: Tally CSV export + Zoho integration (WineYard pilot)
Wk 12: Cross-tenant security tests, onboarding polish, first paid customer

---

## Supabase Conventions

### Migration workflow
- **Always create migration files via CLI:** `supabase migration new <descriptive-name>` — never create or name migration files manually. The CLI generates the correct `YYYYMMDDHHMMSS_<name>.sql` timestamp format.
- **Never create schema changes directly in the Supabase dashboard** without immediately capturing them into a migration file via `supabase db pull --local`.
- Apply to remote with `supabase db push`. Verify with `supabase migration list`.

### Always qualify schema names
Every SQL statement — in migration files, seed files, RPC definitions, Edge Functions, and application code (Supabase JS client calls) — **must explicitly name the schema**. This project uses three schemas (`auth`, `catalog`, `app`) and ambiguity causes silent bugs.

```sql
-- ✅ correct
SELECT * FROM app.tenants WHERE id = $1;
INSERT INTO catalog.brands (name) VALUES ($1);
CREATE FUNCTION app.resolve_price(...) ...

-- ❌ wrong — schema is implicit and fragile
SELECT * FROM tenants WHERE id = $1;
```

In application code, always pass `{ schema: 'app' }` or `{ schema: 'catalog' }` explicitly on the Supabase client:
```ts
// ✅ correct
supabase.schema('app').from('tenants').select('*')

// ❌ wrong — defaults to public, which has no tables
supabase.from('tenants').select('*')
```

---

## Workflow Rules (from parent project)
- Explore first, plan before coding. Use plan mode for anything touching >2 files.
- Always verify your work. Run tests or show a diff before declaring done.
- Use subagents for investigation tasks. Do not bloat main context with file reads.
- Commit frequently with descriptive messages. Always create a PR, never push to main.

---

## Key First Steps
1. ✅ Initialize git repo
2. ✅ Create package.json
3. ⏳ Create `.env.example`
4. ⏳ Create Supabase project & generate migrations
5. ⏳ Set up Next.js config (tailwind, zod schemas)
6. ⏳ Create auth/tenant routing scaffold
7. ⏳ Seed catalog master data
8. ⏳ First PR: auth + tenant subdomain routing
