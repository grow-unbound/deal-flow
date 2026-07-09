ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS place_of_supply text;

UPDATE app.estimates est
SET place_of_supply = COALESCE(
  NULLIF(est.place_of_supply, ''),
  NULLIF(est_buyer.geography->>'state', ''),
  substring(est_buyer.gstin from 1 for 2),
  'Unknown'
)
FROM app.buyers est_buyer
WHERE est.buyer_id = est_buyer.id
  AND (est.place_of_supply IS NULL OR btrim(est.place_of_supply) = '');

UPDATE app.estimates
SET place_of_supply = 'Unknown'
WHERE place_of_supply IS NULL OR btrim(place_of_supply) = '';

ALTER TABLE app.estimates
  ALTER COLUMN place_of_supply SET DEFAULT 'Unknown';

ALTER TABLE app.estimates
  ALTER COLUMN place_of_supply SET NOT NULL;
