-- Buyer order notifications: persist routing + send metadata on orders.

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_channel text;

ALTER TABLE app.orders DROP CONSTRAINT IF EXISTS orders_sent_channel_check;
ALTER TABLE app.orders
  ADD CONSTRAINT orders_sent_channel_check
  CHECK (sent_channel IS NULL OR sent_channel IN ('whatsapp', 'email', 'download'));

UPDATE app.orders
SET place_of_supply = 'Unknown'
WHERE place_of_supply IS NULL OR btrim(place_of_supply) = '';

ALTER TABLE app.orders
  ALTER COLUMN place_of_supply SET DEFAULT 'Unknown',
  ALTER COLUMN place_of_supply SET NOT NULL;
