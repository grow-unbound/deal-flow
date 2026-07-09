-- Remove legacy delivery_address snapshots from buyer document tables.
-- place_of_supply and location_id are the supported fulfillment fields.

ALTER TABLE app.orders
  DROP COLUMN IF EXISTS delivery_address;

ALTER TABLE app.estimates
  DROP COLUMN IF EXISTS delivery_address;
