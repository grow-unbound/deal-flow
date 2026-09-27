-- F20 regression: realtime broadcast topic isolation (see specs/db-perf-recovery-2026-09-20.md).
-- Run with: npx supabase test db --file=tests/realtime_broadcast_isolation.sql
-- Requires migrations 20260920133936 (A) and 20260920133939 (B). Uses a rolled-back fixture.
BEGIN;
SELECT plan(9);

CREATE TEMP TABLE _f AS
SELECT gen_random_uuid() AS t, gen_random_uuid() AS b1, gen_random_uuid() AS b2, gen_random_uuid() AS o1;
GRANT SELECT ON _f TO authenticated;

INSERT INTO app.realtime_notifications (tenant_id, buyer_id, entity_type, entity_id, event_type, payload, old_payload)
SELECT t, b1, 'orders', o1, 'update',
       jsonb_build_object('id', o1, 'order_number', 'SO-1', 'status', 'confirmed', 'updated_at', now(),
                          'shipping_address', 'SECRET-ADDR', 'total_amount', 999999),
       jsonb_build_object('status', 'draft', 'shipping_address', 'SECRET-ADDR')
FROM _f;
INSERT INTO app.realtime_notifications (tenant_id, entity_type, entity_id, event_type, payload)
SELECT t, 'campaigns', gen_random_uuid(), 'update',
       jsonb_build_object('id', gen_random_uuid(), 'name', 'All', 'status', 'published', 'scope_type', 'all', 'share_token', 'TOK')
FROM _f;
INSERT INTO app.realtime_notifications (tenant_id, entity_type, entity_id, event_type, payload)
SELECT t, 'campaigns', gen_random_uuid(), 'update',
       jsonb_build_object('id', gen_random_uuid(), 'name', 'Cohort', 'status', 'published', 'scope_type', 'cohort',
                          'share_token', 'TOK-COH', 'scope_value', jsonb_build_object('cohort_ids', jsonb_build_array(gen_random_uuid())))
FROM _f;

-- buyer 1
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','user_role','buyer_admin','tenant_id',t,'buyer_id',b1)::text FROM _f), true);
SELECT is((SELECT count(*)::int FROM realtime.messages, _f WHERE topic = 'buyer-notifications:'||t||':'||b1), 1, 'buyer 1 reads own buyer topic');
SELECT is((SELECT count(*)::int FROM realtime.messages, _f WHERE topic = 'buyer-notifications:'||t||':'||b2), 0, 'buyer 1 cannot read buyer 2 topic');
SELECT is((SELECT count(*)::int FROM realtime.messages, _f WHERE topic = 'tenant-notifications:'||t), 0, 'buyer cannot read the tenant-wide topic');
SELECT is((SELECT count(*)::int FROM realtime.messages, _f WHERE topic = 'catalog-updates:'||t), 1, 'buyer reads all-buyers catalog announcement (cohort-scoped one is not pushed)');
SELECT is((SELECT count(*)::int FROM realtime.messages WHERE payload::text LIKE '%SECRET-ADDR%' OR payload::text LIKE '%999999%'), 0, 'no leaked address/total in any buyer-visible message');

-- buyer 2
SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','user_role','buyer_admin','tenant_id',t,'buyer_id',b2)::text FROM _f), true);
SELECT is((SELECT count(*)::int FROM realtime.messages WHERE topic LIKE 'buyer-notifications:%'), 0, 'buyer 2 sees no buyer-scoped messages');

-- buyer of another tenant
SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','user_role','buyer_admin','tenant_id',gen_random_uuid(),'buyer_id',b1)::text FROM _f), true);
SELECT is((SELECT count(*)::int FROM realtime.messages, _f WHERE topic LIKE '%'||t||'%'), 0, 'cross-tenant buyer sees nothing');

-- seller
SELECT set_config('request.jwt.claims', (SELECT jsonb_build_object('role','authenticated','user_role','seller_admin','tenant_id',t)::text FROM _f), true);
SELECT is((SELECT count(*)::int FROM realtime.messages, _f WHERE topic = 'tenant-notifications:'||t), 3, 'seller reads the tenant topic (full messages)');
SELECT is((SELECT count(*)::int FROM realtime.messages WHERE topic LIKE 'buyer-notifications:%'), 0, 'seller does not read buyer-scoped topics');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
