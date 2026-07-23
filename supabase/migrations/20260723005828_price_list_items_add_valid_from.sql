-- price_list_items already has a real "left" signal (deleted_at, the repo-wide soft-delete
-- convention) -- no need to add a duplicate valid_until column or touch any read call site.
-- Only valid_from ("entered") is missing.

ALTER TABLE "app"."price_list_items"
  ADD COLUMN "valid_from" timestamp with time zone;

UPDATE "app"."price_list_items"
SET "valid_from" = GREATEST("created_at", '2026-04-01'::timestamptz);

ALTER TABLE "app"."price_list_items"
  ALTER COLUMN "valid_from" SET NOT NULL,
  ALTER COLUMN "valid_from" SET DEFAULT "now"();

COMMENT ON COLUMN "app"."price_list_items"."valid_from" IS
  'Membership entry time for point-in-time attribution. Pair with deleted_at (the existing soft-delete/exit timestamp) for [valid_from, deleted_at) windows.';
