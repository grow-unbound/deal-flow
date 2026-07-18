-- push-order-to-zoho / push-estimate-to-zoho triggers point at a hardcoded
-- stale project ref (ytlusgmlqxuosifeapkz) instead of this project's actual
-- ref (hcpzbnmumbykdqveyjhr) — same bug class as app.get_functions_base_url's
-- fallback, fixed separately in 20260713133345_fix_functions_base_url.sql.
-- Every locally-placed order/estimate currently fails to push to Zoho.
--
-- Also adds a trigger-level WHEN clause so rows synced in FROM Zoho
-- (source = 'zoho_import') skip the webhook entirely at the Postgres level.
-- The push-order-to-zoho/push-estimate-to-zoho edge functions already
-- self-skip these rows (see supabase/functions/push-order-to-zoho/index.ts
-- lines 66-68), so this was functionally harmless, but every synced-in row
-- during bulk sync still fired a real async pg_net HTTP round-trip just to
-- be told to skip — wasted work at bulk-sync volume, worse while the URL
-- above was also dead (guaranteed DNS-failure per row).
DROP TRIGGER IF EXISTS "push-order-to-zoho" ON app.orders;
CREATE TRIGGER "push-order-to-zoho"
  AFTER INSERT ON app.orders
  FOR EACH ROW
  WHEN (NEW.source IS DISTINCT FROM 'zoho_import')
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://hcpzbnmumbykdqveyjhr.supabase.co/functions/v1/push-order-to-zoho',
    'POST',
    '{"Content-type":"application/json","x-push-secret":"gGM2DkCdSUNGGj9GQnI7qvN1JjVgwDAHnmOZfkBnRLb1tsWoMXUjr1Tgh63dPPEA"}',
    '{}',
    '5000'
  );

DROP TRIGGER IF EXISTS "push-estimate-to-zoho" ON app.estimates;
CREATE TRIGGER "push-estimate-to-zoho"
  AFTER INSERT ON app.estimates
  FOR EACH ROW
  WHEN (NEW.source IS DISTINCT FROM 'zoho_import')
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://hcpzbnmumbykdqveyjhr.supabase.co/functions/v1/push-estimate-to-zoho',
    'POST',
    '{"Content-type":"application/json","x-push-secret":"gGM2DkCdSUNGGj9GQnI7qvN1JjVgwDAHnmOZfkBnRLb1tsWoMXUjr1Tgh63dPPEA"}',
    '{}',
    '5000'
  );
