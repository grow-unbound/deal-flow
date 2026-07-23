-- Unified Manual/Automatic membership mode columns for cohorts, price_lists, campaigns.
-- Enums follow this repo's text+CHECK convention (no native CREATE TYPE usage exists elsewhere).

ALTER TABLE "app"."cohorts"
  ADD COLUMN "membership_mode" "text" DEFAULT 'manual'::"text" NOT NULL;

ALTER TABLE "app"."cohorts"
  ADD CONSTRAINT "cohorts_membership_mode_check"
  CHECK ("membership_mode" = ANY (ARRAY['manual'::"text", 'automatic'::"text"]));

UPDATE "app"."cohorts"
SET "membership_mode" = CASE WHEN "is_static" THEN 'manual' ELSE 'automatic' END;

COMMENT ON COLUMN "app"."cohorts"."is_static" IS
  'DEPRECATED: superseded by membership_mode (is_static=true -> manual, false -> automatic). Kept for backward-compat reads during rollout; remove in a later migration once all readers are ported.';


ALTER TABLE "app"."price_lists"
  ADD COLUMN "membership_mode" "text" DEFAULT 'manual'::"text" NOT NULL;

ALTER TABLE "app"."price_lists"
  ADD CONSTRAINT "price_lists_membership_mode_check"
  CHECK ("membership_mode" = ANY (ARRAY['manual'::"text", 'automatic'::"text"]));

-- membership_mode is decoupled from pricing_strategy (which governs per-item price computation, not membership).
UPDATE "app"."price_lists"
SET "membership_mode" = CASE
  WHEN "pricing_strategy" <> 'edit_each' AND "filters" IS NOT NULL AND "filters" <> '{}'::"jsonb" THEN 'automatic'
  ELSE 'manual'
END;


-- Campaigns have three independent axes: buyer targeting (3-way), product membership (2-way), pricing source (2-way, not membership).
ALTER TABLE "app"."campaigns"
  ADD COLUMN "buyer_target_mode" "text" DEFAULT 'customer_group'::"text" NOT NULL,
  ADD COLUMN "buyer_filter_rules" "jsonb",
  ADD COLUMN "product_membership_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
  ADD COLUMN "pricing_source" "text" DEFAULT 'individual_prices'::"text" NOT NULL,
  ADD COLUMN "price_list_id" "uuid";

ALTER TABLE "app"."campaigns"
  ADD CONSTRAINT "campaigns_buyer_target_mode_check"
  CHECK ("buyer_target_mode" = ANY (ARRAY['manual'::"text", 'automatic'::"text", 'customer_group'::"text"]));

ALTER TABLE "app"."campaigns"
  ADD CONSTRAINT "campaigns_product_membership_mode_check"
  CHECK ("product_membership_mode" = ANY (ARRAY['manual'::"text", 'automatic'::"text"]));

ALTER TABLE "app"."campaigns"
  ADD CONSTRAINT "campaigns_pricing_source_check"
  CHECK ("pricing_source" = ANY (ARRAY['pricelist'::"text", 'individual_prices'::"text"]));

ALTER TABLE "app"."campaigns"
  ADD CONSTRAINT "campaigns_price_list_id_fkey"
  FOREIGN KEY ("price_list_id") REFERENCES "app"."price_lists"("id") ON DELETE RESTRICT;

-- Backfill from existing scope_type/is_dynamic/scope_value (today's target_mode/pricing_mode are only
-- encoded in scope_value jsonb via app/api/tenant/catalogs routes, not persisted columns).
UPDATE "app"."campaigns"
SET "buyer_target_mode" = CASE
  WHEN "scope_type" = 'cohort' THEN 'customer_group'
  ELSE 'manual'
END;

UPDATE "app"."campaigns"
SET "product_membership_mode" = CASE WHEN "is_dynamic" THEN 'automatic' ELSE 'manual' END;

UPDATE "app"."campaigns"
SET
  "pricing_source" = CASE WHEN "scope_value"->>'priceSource' = 'price_list' THEN 'pricelist' ELSE 'individual_prices' END,
  "price_list_id" = NULLIF("scope_value"#>>'{composer,price_list_id}', '')::"uuid"
WHERE "scope_value" IS NOT NULL;

COMMENT ON COLUMN "app"."campaigns"."is_dynamic" IS
  'DEPRECATED: superseded by product_membership_mode (true -> automatic, false -> manual). Kept for backward-compat reads during rollout.';

CREATE INDEX IF NOT EXISTS "campaigns_price_list_id_idx" ON "app"."campaigns" ("price_list_id") WHERE "price_list_id" IS NOT NULL;
