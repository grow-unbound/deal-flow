-- The UPDATE triggers added in 20260720142106 were a workaround for the real
-- bug: the seller-app composer was POSTing an empty draft first and PATCHing
-- the full payload after, so the INSERT trigger fired against an incomplete
-- row. The root fix (same migration file date, applied in the app layer) is to
-- POST the full payload in one shot so the INSERT already has buyer + items.
-- These UPDATE triggers are no longer needed.

DROP TRIGGER IF EXISTS "push-estimate-to-zoho-on-send" ON app.estimates;
DROP TRIGGER IF EXISTS "push-order-to-zoho-on-confirm" ON app.orders;
