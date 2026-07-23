-- cohort_members is the one membership junction with no created_at/deleted_at at all today
-- (bare (cohort_id, buyer_id) PK, hard DELETE on removal). Converting to real SCD2: a
-- surrogate id PK, valid_from/valid_until, and a partial unique index enforcing exactly one
-- active row per (cohort_id, buyer_id) pair. Historical (closed) rows are preserved instead
-- of deleted, so a buyer who left and rejoined has two rows with two distinct windows.
--
-- Backfill: no prior signal exists for when current members actually joined, so valid_from
-- is set to 2026-04-01 (the date the business confirmed all current data originates from),
-- not now() -- now() would misattribute pre-existing members as having "just joined" for any
-- point-in-time query against pre-migration orders.

ALTER TABLE "app"."cohort_members"
  ADD COLUMN "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  ADD COLUMN "valid_from" timestamp with time zone,
  ADD COLUMN "valid_until" timestamp with time zone,
  ADD COLUMN "created_at" timestamp with time zone DEFAULT "now"();

UPDATE "app"."cohort_members"
SET "valid_from" = '2026-04-01'::timestamptz,
    "created_at" = '2026-04-01'::timestamptz
WHERE "valid_from" IS NULL;

ALTER TABLE "app"."cohort_members"
  ALTER COLUMN "valid_from" SET NOT NULL,
  ALTER COLUMN "valid_from" SET DEFAULT "now"();

ALTER TABLE "app"."cohort_members"
  ADD CONSTRAINT "cohort_members_valid_range_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

-- Drop the old composite PK in favor of a surrogate id PK; the FK constraints on
-- cohort_id/buyer_id are independent of the PK and are unaffected by this.
ALTER TABLE "app"."cohort_members" DROP CONSTRAINT "cohort_members_pkey";
ALTER TABLE "app"."cohort_members" ADD CONSTRAINT "cohort_members_pkey" PRIMARY KEY ("id");

-- Exactly one active row per (cohort_id, buyer_id) pair.
CREATE UNIQUE INDEX "cohort_members_active_uk" ON "app"."cohort_members" ("cohort_id", "buyer_id") WHERE ("valid_until" IS NULL);
CREATE INDEX "cohort_members_cohort_active_idx" ON "app"."cohort_members" ("cohort_id") WHERE ("valid_until" IS NULL);

-- idx_cohort_members_buyer_id already exists from prod_bootstrap and remains useful as-is.

-- Convenience view for the ~20+ existing read call sites (app/api, src/lib, and metrics RPCs)
-- that all assume "row exists = active member" -- true before this migration since no
-- historical rows existed. security_invoker defers to cohort_members' own RLS policies.
CREATE OR REPLACE VIEW "app"."cohort_members_active"
  WITH (security_invoker = true) AS
  SELECT "id", "cohort_id", "buyer_id", "valid_from"
  FROM "app"."cohort_members"
  WHERE "valid_until" IS NULL;

COMMENT ON VIEW "app"."cohort_members_active" IS
  'Current-membership view over app.cohort_members (valid_until IS NULL). Existing "who is a member right now" reads should point here instead of the base table now that historical rows can exist. Point-in-time attribution reads should query the base table directly with an explicit valid_from/valid_until window.';

GRANT SELECT ON "app"."cohort_members_active" TO "authenticated";
GRANT SELECT ON "app"."cohort_members_active" TO "anon";
GRANT ALL ON "app"."cohort_members_active" TO "service_role";
