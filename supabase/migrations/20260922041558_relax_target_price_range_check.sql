-- Allow single-sided buyer target pricing (min-only or max-only) per estimate
-- line item, not just both-or-neither. Target pricing must remain optional —
-- an item with no target set stays valid.
ALTER TABLE app.estimate_items
  DROP CONSTRAINT IF EXISTS estimate_items_buyer_target_unit_price_range_check;

ALTER TABLE app.estimate_items
  ADD CONSTRAINT estimate_items_buyer_target_unit_price_range_check
  CHECK (
    (buyer_target_unit_price_min IS NULL OR buyer_target_unit_price_min >= 0)
    AND (buyer_target_unit_price_max IS NULL OR buyer_target_unit_price_max >= 0)
    AND (
      buyer_target_unit_price_min IS NULL
      OR buyer_target_unit_price_max IS NULL
      OR buyer_target_unit_price_max >= buyer_target_unit_price_min
    )
  );
