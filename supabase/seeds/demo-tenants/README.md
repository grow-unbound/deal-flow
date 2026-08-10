# Demo tenants — Yukti industry datasets

Seeds 5 industry-specific demo tenants (Electricals, Mobiles & Electronics,
Automotive Spares, Hardware & Building Materials, Cosmetics & Salon Supply)
from `specs/Yukti_Demo-Datasets_v1.md`, so a sales demo can be spun up per
prospect industry without touching the existing `techwave` tenant.

## What's here

| File | Purpose |
|---|---|
| `00_shared_catalog.sql` | Global `catalog.brands` / `catalog.categories` / `catalog.products` for all 5 industries. Run once. |
| `01_electricals.sql` | Electricals tenant: locations, warehouses, brands, categories, products, buyers, cohorts, price lists, one published campaign. |
| `02_mobiles_electronics.sql` | Same, Mobiles & Electronics. |
| `03_automotive_spares.sql` | Same, Automotive Spares. |
| `04_hardware_building.sql` | Same, Hardware & Building Materials. |
| `05_cosmetics_salon.sql` | Same, Cosmetics & Salon Supply. |
| `90_generate_transactions.sql` | Estimates → orders → invoices → payments for all 5 tenants (no funnel = no demo). |
| `99_refresh_metrics.sql` | Materializes KPI tiles/landing pages via the v4 metrics backfill driver. |

All scripts are **additive only** — none of them `TRUNCATE` anything. `01`–`05`
are idempotent (no-op if the tenant slug already exists). `90` is **not**
idempotent — re-running it for an already-seeded tenant adds a second batch of
transactions; there's no natural "already done" marker for transactional data.

Every tenant reuses the existing shared seller login from `supabase/seed.sql`
(`santosh.phani@gmail.com` / `Welcome@123`, `seller_admin`) so one login can
switch across `techwave` and all 5 new demo tenants by subdomain.

## Prerequisites

- `supabase/seed.sql` must already have been run (creates the shared seller
  auth user these scripts link into every new tenant — `01`–`05` will
  `RAISE EXCEPTION` if it's missing).
- `99_refresh_metrics.sql` calls `app._metrics_v4_backfill_driver` and
  `app.metrics_inspect()`, both `service_role`-only — run it over a
  `service_role`/`postgres` connection, not an `anon`/`authenticated` one.

## How to run — in order

```bash
psql "$DB_URL" -f supabase/seeds/demo-tenants/00_shared_catalog.sql
psql "$DB_URL" -f supabase/seeds/demo-tenants/01_electricals.sql
psql "$DB_URL" -f supabase/seeds/demo-tenants/02_mobiles_electronics.sql
psql "$DB_URL" -f supabase/seeds/demo-tenants/03_automotive_spares.sql
psql "$DB_URL" -f supabase/seeds/demo-tenants/04_hardware_building.sql
psql "$DB_URL" -f supabase/seeds/demo-tenants/05_cosmetics_salon.sql
psql "$DB_URL" -f supabase/seeds/demo-tenants/90_generate_transactions.sql
psql "$DB_URL" -f supabase/seeds/demo-tenants/99_refresh_metrics.sql   # only once you've reviewed it
```

These are **not** picked up by `supabase db reset` — they're separate from
`supabase/seed.sql` by design, so a normal reset still only loads `techwave`.

## Why not `app.post_sync_rebuild`

`seed.sql` and `seed_operational_data.sql` both call
`app.post_sync_rebuild(tenant_id, days)` to materialize KPIs after seeding.
As of this writing that function is **dead**: its body still calls
`app.refresh_buyers_snapshot`, `app.refresh_buyer_current_snapshot`, and
`app.rebuild_kpi_buyers_daily_for_tenant`, all of which were dropped in
`20260719065025_v1_snapshot_retirement.sql` and
`20260723125928_drop_kpi_buyers_daily_v1_table.sql`. Calling it now raises
`function ... does not exist`.

None of these scripts call it. `99_refresh_metrics.sql` uses the real v4
replacement instead: `app._metrics_v4_backfill_driver`
(`scripts/sql/metrics-v4-chunked-backfill.sql`), the purpose-built
manual/seed backfill entrypoint — it marks reconciliation dirty-work and
drains it via the same `app.metrics_refresh_tick` stage calls the 15-second
cron job uses.

The v1/v2/v3 `*_snapshot` and `kpi_*_daily` tables these dead functions fed
are being fully deprecated as the app finishes its v4 cutover — don't wire
new code to them.

## Execution — do not run without explicit approval

**These files were written but not executed.** Given this org's Supabase
project is flagged "Yukti Production" with a live paying tenant (WineYard) on
it, running any of this — locally or remotely — is a separate, explicitly
confirmed step. Review the SQL first; confirm the target database each time
before running.

## Verification, once you do run it

```sql
SELECT slug, business_name FROM app.tenants;
-- 6 tenants: techwave + 5 new, no duplicates.

SELECT t.slug, count(*) FROM app.tenant_products tp JOIN app.tenants t ON t.id = tp.tenant_id
GROUP BY t.slug;  -- ~15 per new tenant

SELECT t.slug, count(*) FROM app.buyers b JOIN app.tenants t ON t.id = b.tenant_id
GROUP BY t.slug;  -- 8 per new tenant

SELECT t.slug, count(*) FROM app.campaigns c JOIN app.tenants t ON t.id = c.tenant_id
WHERE c.status = 'published' GROUP BY t.slug;  -- 1 per new tenant

SELECT * FROM app.metrics_inspect() WHERE dead_letter_count > 0;
-- should return zero rows after 99_refresh_metrics.sql
```

Then log in as `santosh.phani@gmail.com` / `Welcome@123`, switch to each new
tenant's subdomain, and confirm the seller dashboard KPI tiles render real
numbers (not blank/skeleton) and the published campaign shows as live.
