---
paths:
  - "supabase/**"
  - "**/*.sql"
  - "src/lib/supabase*"
---
# Supabase / SQL conventions

Prod-safety and migration hard rules live in `CLAUDE.md` (always loaded). Details here.

## Schemas
`auth` (Supabase-managed) · `catalog` (master brands/products/categories, reusable across tenants, `is_public = true` is global-readable) · `app` (all tenant data, RLS per tenant).

```sql
-- ✅ SELECT * FROM app.tenants WHERE id = $1;   CREATE FUNCTION app.resolve_price(...)
-- ❌ SELECT * FROM tenants WHERE id = $1;  (implicit schema — silent bugs)
```
```ts
supabase.schema('app').from('tenants').select('*')   // ✅
supabase.from('tenants').select('*')                 // ❌ defaults to public (no tables)
```

## Metrics V2 operational table exception
Dirty-work, lease, runtime-control, refresh-state and execution-history tables are coordination tables, not business records. They still need tenant ownership where applicable, timestamps, explicit RLS/service-role access, bounded retention, schema-qualified `app` DDL. They are exempt from `external_ref`, `created_by/updated_by` and `deleted_at` so retention jobs can hard-delete them. Narrow: business-facing snapshots/read models still follow the mandatory conventions unless an approved plan records an exception.

## Working against the hosted dev project (`yukti-dev`)
- Password: `SUPABASE_DB_PASSWORD` from `.env.local` (fall back to `DATABASE_PASSWORD` if it's the only one). `SUPABASE_PASSWORD` is not the project variable.
- Use a verified temporary Supabase workdir linked to `yukti-dev`; never rely on another session's link state. Project refs are safe to record; credentials are not.
- Read-only inspection / SQL behavior tests: `npx supabase db query --linked --file <file>`. Wrap mutation-shaped validation in `BEGIN … ROLLBACK`, use isolated fixtures, and confirm no persistent business data changed.
- Tests that can't run in a rolled-back transaction (cross-connection, API, Cron, sync, load) run on `yukti-dev` with deterministic isolated seed data. Never fall back to prod when dev is unavailable.
- After a persistent push: verify migration history, RLS, grants, advisors, focused tests.

## Local storefront hosts (no Vercel, no `/etc/hosts`)
`*.localhost` resolves to 127.0.0.1. With `pnpm dev`: seller `http://app.localhost:3000`; tenant storefront `http://{slug}.localhost:3000` (e.g. `acme`); legacy unscoped seller `http://localhost:3000`. Don't add hosts entries, `lvh.me` or nip.io. Going live = `app.catalogs.live_at` (+ `pricing_mode`); unpublished hosts render `/not-live`.
