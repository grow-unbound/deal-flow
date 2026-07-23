-- Same rationale as price_list_items: deleted_at already serves as the "left" timestamp.
-- Only valid_from ("entered") is missing.

ALTER TABLE "app"."price_list_assignments"
  ADD COLUMN "valid_from" timestamp with time zone;

UPDATE "app"."price_list_assignments"
SET "valid_from" = GREATEST("created_at", '2026-04-01'::timestamptz);

ALTER TABLE "app"."price_list_assignments"
  ALTER COLUMN "valid_from" SET NOT NULL,
  ALTER COLUMN "valid_from" SET DEFAULT "now"();

COMMENT ON COLUMN "app"."price_list_assignments"."valid_from" IS
  'Membership entry time for point-in-time attribution. Pair with deleted_at (the existing soft-delete/exit timestamp) for [valid_from, deleted_at) windows.';
