# Yukti architecture (read when working in a domain)

Verified against the codebase on 2026-09-27. This file points at the code that is the source of truth; it deliberately does not restate lists (routes, tabs, tables, flags) that drift. When code and this file disagree, code wins — flag the drift via `/wrap`.

## Product
Multi-tenant SaaS for Indian SMB multibrand distributors: catalogs, customer-specific pricing, sales documents, buyer ordering, integrations. **Yukti** is the product name everywhere ("DealFlow" was a working title; legacy mentions survive in old specs, some comments, `df_` flag prefixes and the GitHub repo name).

## Hosts & routing
- Canonical suffix `useyukti.in` (legacy `yukti.so`), local `*.localhost`. `app.<suffix>` = seller app, `catalog.<suffix>` = catalog host, `{slug}.<suffix>` = tenant storefront (buyer). Reserved labels are listed in `src/lib/storefront-host.ts`.
- `middleware.ts` resolves the host and **rewrites public storefront paths to internal route namespaces**: buyer pages live under `app/(buyer)/buy/*` (signed-in), `app/(buyer-guest)/buy/g/[tenantSlug]/*` (guest), `app/(guest)/c/[share_token]`; public paths (`/orders`, `/product/[id]`…) are defined in `src/lib/storefront-paths.ts`. There is no `/shop` route. Any new root-level static public file must be added to `PUBLIC_PREFIXES` in `middleware.ts`.
- Other route groups: `(auth)`, `(seller)`, `(onboarding)`, `(catalog)`, `(storefront)` (`not-live`, `tenant-not-found`), plus root pages `onboarding`, `pending`, `resubmit-documents`, `verify-human`, `consent`. API groups under `app/api/*` (auth, buyer, tenant, brands, products, customers, cohorts, price-lists, whatsapp, settings, team, upload(s), internal, public, health, verify-human).

## Surfaces (seller app and buyer app)
- **Both are mobile-first and responsive up to desktop.** Same token system, adapted per breakpoint. Never hardcode colors, font sizes, spacing or radii in components — reference tokens defined in `app/globals.css` (`--yk-*` base, `--bg-*`/`--fg-*`/`--border-*` semantic, `--teal-*`/`--cream-*`/`--ember-*` palette, `--ctl-*` controls, `--b-text-*` buyer type scale scoped under `[data-app="buyer"]`, `--sidebar-w`/`--topbar-*`/`--tab-*`/`--header-*` layout). If a token is missing, add it to `globals.css`, don't inline a literal.
- Navigation is defined in code — read these, don't copy them here:
  - Seller routes: `src/lib/seller-routes.ts`; desktop sidebar: `src/components/layout/seller-sidebar-layout.ts` + `SellerSidebar.tsx`; mobile chrome and bottom tabs: `SellerMobileChrome.tsx`.
  - Buyer paths: `src/lib/storefront-paths.ts` (`STOREFRONT`); tab bar: `src/components/layout/BuyerTabBar.tsx`; shell: `BuyerShell.tsx`.
- Design system: `specs/Yukti_DesignSystem_R12.md`.

## Auth & identity
Phone OTP delivered over WhatsApp (`sendLoginOtpWhatsapp`, `src/lib/server/whatsapp.ts`; `app/api/auth/phone-otp/*`) plus email verification/OTP and invites (`app/api/auth/*`), Cloudflare Turnstile human check, per-IP challenge state. One auth user can belong to multiple tenants/buyers (context switching: `select-context`, `switch-context`, `switch-buyer`). `platform_admins` is the platform-operator table.

## Tenancy & RBAC
- Tenant = one distributor business. Buyers (`app.buyers`, `app.buyer_users`) live inside a tenant. Every request re-verifies tenant membership server-side (see `src/lib/server/seller-server-claims.ts`, `buyer-access`); never trust a client `tenant_id`.
- Roles: `seller_admin`, `seller_assistant`, `buyer_admin`, `buyer_assistant` (`ROLES` in `src/constants/index.ts`; DB checks in migrations and `SECURITY DEFINER` helpers like `app._*_assert_seller_admin`). Seller-assistant location scoping: `specs/DealFlow_SellerAssistant-RBAC_v1.md`.
- **Tenant-agnostic by rule:** the codebase, design, tooling and priorities serve all tenants. No tenant-specific branches, copy, flags or special cases in code; per-tenant behavior only via `app.tenant_settings` / integration config / flag targeting. Tests may use fixture names.

## Data model (schemas `auth`, `catalog`, `app`)
Do not enumerate tables here — use `src/types/database.ts`, `codegraph`, or the migrations. Domain groups in `app`:
tenancy & settings · catalog master (brands, categories, products, product families, inventory, warehouses, locations) · customers (buyers, cohorts) · pricing (`price_lists*`, `app.resolve_price` — see its latest migration for resolution order) · **campaigns** (`campaigns`, `campaign_items`, `campaign_buyer_members`; this replaced the old `published_catalogs*`, whose names survive only in legacy constraint names) and `catalogs` · sales documents (estimates, orders, invoices, credit notes, payments) · `entries` (Today) · integrations (`tenant_integrations`, `integration_*`) · WhatsApp (broadcasts, messages, send queue, credit wallet) · recommendations (`reco_*`) · metrics (`kpi_*_daily`, `metrics_*`, `*_snapshot`; rules in `.claude/rules/metrics.md`) · `audit_log`.
Search: PG full-text + pgvector via `app.search_products`; embedding provider is configurable (`EMBEDDING_PROVIDER`). Order statuses: `ORDER_STATUSES` in `src/constants/index.ts`.
Conventions and SQL rules: `CLAUDE.md` (hard rules) and `.claude/rules/supabase-sql.md`.

## Integrations
Supabase (DB, Auth, RLS, pgvector, Edge Functions, Vault, cron) · Cloudflare R2 + `workers/yukti-image-worker` (the only resize path; presized variants, `specs/image-upload-architecture.md`) · PostHog (analytics + flags) · Sentry · Vercel · Cloudflare Turnstile · Google Maps (Places/Geocoding) · WhatsApp Business via Meta Cloud API (Embedded Signup, templates, broadcasts) · ERP/accounting connectors in `src/lib/integrations/` (`zoho_books`, `zoho_inventory`, `tally_prime`, `busy`, `whatsapp_business`; `specs/integrations.md`).
Not used despite appearances: **Resend** — the `resend` dependency and `RESEND_API_KEY` in `.env.example` have no code imports (candidate cleanup); "resend" in code means re-sending invites/OTPs.

## Feature flags
PostHog flags, names in `FEATURE_FLAGS` (`src/constants/index.ts`). The `df_` prefix is legacy — do not rename flags (breaks targeting). Every major feature ships behind a flag that gates UI **and** RPC, supports per-`tenant_id` targeting, and has an owner and removal date. Default off until pilot passes.

## Security testing
Cross-tenant isolation tests run on every PR, with flags on and off. `catalog.*` enforces `is_public` + `origin_tenant_id`.
