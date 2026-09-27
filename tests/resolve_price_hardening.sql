-- app.resolve_price hardening: buyer_pending denied, cross-tenant denied, anon has no EXECUTE.
-- Run with: npx supabase test db --file=tests/resolve_price_hardening.sql
-- Requires migration 20260926014759_harden_resolve_price_pending_and_anon. Rolled-back fixture.
BEGIN;
SELECT plan(9);

-- Fixture rows bypass FK/trigger noise (brand/category not needed for pricing).
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE _f AS
SELECT gen_random_uuid() AS t1, gen_random_uuid() AS t2, gen_random_uuid() AS p1,
       gen_random_uuid() AS p2, gen_random_uuid() AS b1;
GRANT SELECT ON _f TO authenticated, anon;

INSERT INTO app.tenants (id, slug, business_name) SELECT t1, 'rp-'||left(t1::text, 8), 'RP One' FROM _f;
INSERT INTO app.tenants (id, slug, business_name) SELECT t2, 'rp-'||left(t2::text, 8), 'RP Two' FROM _f;
INSERT INTO app.tenant_products (id, tenant_id, internal_sku, tenant_brand_id, base_selling_price)
SELECT p1, t1, 'RP-1', gen_random_uuid(), 100 FROM _f;
INSERT INTO app.tenant_products (id, tenant_id, internal_sku, tenant_brand_id, base_selling_price)
SELECT p2, t2, 'RP-2', gen_random_uuid(), 200 FROM _f;
INSERT INTO app.buyers (id, tenant_id, business_name) SELECT b1, t1, 'RP Buyer' FROM _f;
SET LOCAL session_replication_role = origin;

SELECT ok(NOT has_function_privilege('anon', 'app.resolve_price(uuid,uuid,numeric)', 'EXECUTE'), 'anon has no EXECUTE');
SELECT ok(has_function_privilege('authenticated', 'app.resolve_price(uuid,uuid,numeric)', 'EXECUTE'), 'authenticated keeps EXECUTE');
SELECT ok(has_function_privilege('service_role', 'app.resolve_price(uuid,uuid,numeric)', 'EXECUTE'), 'service_role keeps EXECUTE');

-- approved buyer, own tenant: control
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','user_role','buyer_admin','tenant_id',t1,'buyer_id',b1)::text FROM _f), true);
SELECT is((SELECT app.resolve_price(p1, b1, 1) FROM _f), 100::numeric, 'approved buyer resolves own-tenant price');

-- approved buyer, other tenant product
SELECT throws_ok($$SELECT app.resolve_price(p2, b1, 1) FROM _f$$, '42501', 'forbidden', 'approved buyer cannot price another tenant''s product');

-- buyer_pending
SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','user_role','buyer_pending','tenant_id',t1,'buyer_id',b1)::text FROM _f), true);
SELECT throws_ok($$SELECT app.resolve_price(p1, b1, 1) FROM _f$$, '42501', 'forbidden', 'buyer_pending denied with buyer id');
SELECT throws_ok($$SELECT app.resolve_price(p1, NULL, 1) FROM _f$$, '42501', 'forbidden', 'buyer_pending denied without buyer id');

-- seller: cross tenant denied, own ok
SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','user_role','seller_admin','tenant_id',t1)::text FROM _f), true);
SELECT throws_ok($$SELECT app.resolve_price(p2, NULL, 1) FROM _f$$, '42501', 'forbidden', 'seller cannot price another tenant''s product');

-- service_role unchanged
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is((SELECT app.resolve_price(p2, NULL, 1) FROM _f), 200::numeric, 'service_role behaviour unchanged');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
