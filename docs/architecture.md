# DealFlow architecture (read when working in a domain)

## Layout
`app/` Next.js routes — `(auth)`, `(seller)` (dashboard, brands, products, buyers, cohorts, price-lists, catalogs, orders, exports, settings), `(buyer)/shop` (home, catalog, orders, profile; deep: product/[id], cart, checkout), `api/`. `src/` components (`ui/` shadcn, `layout/`, `seller/`, `buyer/`), `lib/`, `hooks/`, `contexts/`, `types/`, `constants/`. `supabase/` migrations, seed, functions. Use `codegraph files` / `codegraph explore` for the live map.

## Integrations
Supabase (DB/Auth/RLS/pgvector/Edge Functions/Vault) · Cloudflare R2 + `yukti-image-worker` (only resize path; presized variants thumb/small/medium/large, see `specs/image-upload-architecture.md`) · PostHog (analytics + flags) · Resend · WhatsApp OTP (Meta Cloud API via AiSensy/Interakt) · Zoho Books/Inventory connector · Sentry · Vercel.

## Data model
- Business tables: uuid PK, `created_at/updated_at/created_by/updated_by`, `deleted_at`, `external_ref` (unique per `(tenant_id, external_ref)`), FKs `ON DELETE RESTRICT`.
- Chains: `tenants → tenant_users → tenant_brands → tenant_products → tenant_inventory` · `buyers → buyer_users → cohorts → cohort_members` · `price_lists → price_list_items → price_list_assignments` · `published_catalogs → published_catalog_items` · `orders → order_items` · `audit_log` (append-only, every entity mutation).
- Pricing: `app.resolve_price(tenant_product_id, buyer_id, qty)` resolves in order: catalog `price_override` → buyer price lists (highest priority + valid window) → cohort price lists → `all_buyers` → `base_selling_price`.
- Search: PG full-text (tsvector+GIN) + pgvector hybrid via `app.search_products(tenant_id, query, filters)`. No Typesense until post-PMF.

## Tenancy & RBAC
- Tenant = distributor (one business = one tenant), subdomain `{slug}.dealflow.in`. Buyers live inside a tenant. One auth user can link to many buyers across tenants via `buyer_users`.
- JWT carries `tenant_id`, `buyer_id` (nullable), `role` — verify every request.
- Roles: `seller_admin`, `seller_assistant`, `buyer_admin`, `buyer_assistant`. Seller roles manage brands, products, cohorts, catalogs, orders, Tally export; `seller_admin` only: settings, users, cost prices, cohort/price-list management. Buyers browse and order only.

## Feature flags (PostHog, non-negotiable)
Every major feature ships behind `df_<module>` (default off until tenant pilot passes): tenant_onboarding, brand_product_master, customer_master, cohorts, pricing_engine, catalog_publishing, buyer_app, order_management, search, tally_export, zoho_integration. Scaffolded off: ai_intake, replenishment, payments. Gate UI **and** RPC; per-`tenant_id` targeting; every flag has an owner and removal date.

## Surfaces
- Seller cockpit: desktop-first, left sidebar (Dashboard, Brands, Products, Customers, Cohorts, Price Lists, Catalogs, Orders, Exports, Settings), footer avatar/name/role/logout pinned `mt-auto`.
- Buyer PWA: `shop.dealflow.in/{share_token}`, mobile-first, WhatsApp OTP (no passwords), tokenized or authenticated. Tabs: Home / Catalog / Orders / Profile; deep screens (product, cart, checkout, order placed) have no tab bar.

## Scope guardrails
Not in MVP (defer ruthlessly): AI multimodal intake, replenishment forecasting, payment reconciliation, live Tally/Busy API, returns, trade promotions, brand-side dashboards, Typesense, webhooks. Order workflow: draft → received → confirmed → dispatched → delivered → cancelled. Tally CSV export: Item Master, Sales Voucher, Ledger Master.

## Customers
WineYard (CCTV distributor, on Zoho) is the first customer; Zoho integration is the conversion wedge, piloted behind `df_zoho_integration`. Target ₹50–75K/mo Scale tier.

## Security testing
Cross-tenant isolation tests run on every PR, with feature flags both on and off. `catalog.*` enforces `is_public` + `origin_tenant_id`.
