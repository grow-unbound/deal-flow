ALTER TABLE app.price_lists
  ADD COLUMN IF NOT EXISTS description text;
