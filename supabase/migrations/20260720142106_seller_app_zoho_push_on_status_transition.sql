-- Seller-app estimates and orders are created as DRAFT first (buyer=null, no
-- items), then filled in and finalized.  The existing INSERT triggers fire on
-- an empty/incomplete row and immediately bail (no_line_items / draft_order).
-- When the seller sends / confirms the document the status changes via UPDATE —
-- no trigger fires, so the document never reaches Zoho.
--
-- Buyer-PWA documents are created complete in one shot (status=received /
-- buyer set / items already inserted), so the INSERT trigger works for them.
--
-- Fix: add AFTER UPDATE triggers that fire at the meaningful completion point:
--   • estimates → when status transitions  draft → sent
--   • orders    → when status transitions  draft → anything final (confirmed)
--
-- The push functions already guard against double-push via external_ref, and
-- the edge function itself re-fetches the authoritative DB row, so firing on
-- UPDATE is safe even if the webhook record is momentarily stale.

-- ── Estimates: fire when seller sends a draft ────────────────────────────────
CREATE OR REPLACE TRIGGER "push-estimate-to-zoho-on-send"
  AFTER UPDATE ON app.estimates
  FOR EACH ROW
  WHEN (
    OLD.status = 'draft'
    AND NEW.status = 'sent'
    AND (NEW.source IS DISTINCT FROM 'zoho_import')
    AND NEW.deleted_at IS NULL
  )
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://hcpzbnmumbykdqveyjhr.supabase.co/functions/v1/push-estimate-to-zoho',
    'POST',
    '{"Content-type":"application/json","x-push-secret":"gGM2DkCdSUNGGj9GQnI7qvN1JjVgwDAHnmOZfkBnRLb1tsWoMXUjr1Tgh63dPPEA"}',
    '{}',
    '5000'
  );

-- ── Orders: fire when seller confirms a draft ────────────────────────────────
-- Covers cockpit_manual orders that go draft → confirmed.
-- Buyer-app orders are already handled by the INSERT trigger (they arrive as
-- status=received, so the INSERT trigger's WHEN fires and the UPDATE trigger's
-- OLD.status='draft' condition never matches — no double-push risk).
CREATE OR REPLACE TRIGGER "push-order-to-zoho-on-confirm"
  AFTER UPDATE ON app.orders
  FOR EACH ROW
  WHEN (
    OLD.status = 'draft'
    AND NEW.status NOT IN ('draft', 'cancelled')
    AND (NEW.source IS DISTINCT FROM 'zoho_import')
    AND NEW.deleted_at IS NULL
  )
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://hcpzbnmumbykdqveyjhr.supabase.co/functions/v1/push-order-to-zoho',
    'POST',
    '{"Content-type":"application/json","x-push-secret":"gGM2DkCdSUNGGj9GQnI7qvN1JjVgwDAHnmOZfkBnRLb1tsWoMXUjr1Tgh63dPPEA"}',
    '{}',
    '5000'
  );
