# DealFlow — CLAUDE.md

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

## Database: Three Schemas
- `auth` — Supabase-managed identity (system-owned)
- `catalog` — Master brands, products, categories. Reusable across tenants. `is_public = true` is global-readable.
- `app` — All tenant business data. RLS-enforced per tenant.

### Mandatory conventions on every table
- PK: `id uuid default gen_random_uuid()`
- Audit: `created_at`, `updated_at`, `created_by`, `updated_by` — non-negotiable
- Soft-delete: `deleted_at timestamptz` (never hard-delete business data)
- ERP mapping: `external_ref text` — unique per `(tenant_id, external_ref)`
- All FKs: `ON DELETE RESTRICT` — never cascade business data

### Key `app` tables
`tenants` → `tenant_users` → `tenant_brands` → `tenant_products` → `tenant_inventory`
`buyers` → `buyer_users` → `cohorts` → `cohort_members`
`price_lists` → `price_list_items` → `price_list_assignments`
`published_catalogs` → `published_catalog_items`
`orders` → `order_items`
`audit_log` (append-only, every entity mutation)

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
**Cockpit** (`{slug}.dealflow.in`) — desktop-first, left sidebar nav, shadcn/ui components, lucide icons. Sidebar footer: user avatar + name + role + logout (pinned `mt-auto`).

**Buyer PWA** (`shop.dealflow.in/{share_token}`) — mobile-first, WhatsApp OTP auth (no passwords). Two modes: tokenized (share link → OTP → order) and authenticated (persistent session).

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
