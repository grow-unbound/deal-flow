-- Manual campaign-buyer membership. Nothing persists this today (CampaignFormSheet's
-- "individual_buyers" mode just says "manage in Details" with no backing table).
-- SCD2 from day one (valid_from/valid_until) since this is new schema, per the
-- decision to model time-bound membership history directly on junction tables.

CREATE TABLE IF NOT EXISTS "app"."campaign_buyer_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "valid_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valid_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "campaign_buyer_members_valid_range_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from")
);

ALTER TABLE "app"."campaign_buyer_members" OWNER TO "postgres";

ALTER TABLE ONLY "app"."campaign_buyer_members"
    ADD CONSTRAINT "campaign_buyer_members_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "app"."campaign_buyer_members"
    ADD CONSTRAINT "campaign_buyer_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "app"."campaigns"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "app"."campaign_buyer_members"
    ADD CONSTRAINT "campaign_buyer_members_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "app"."buyers"("id") ON DELETE RESTRICT;

-- Exactly one active (valid_until IS NULL) row per (campaign_id, buyer_id) pair.
CREATE UNIQUE INDEX "campaign_buyer_members_active_uk" ON "app"."campaign_buyer_members" ("campaign_id", "buyer_id") WHERE ("valid_until" IS NULL);
CREATE INDEX "campaign_buyer_members_campaign_active_idx" ON "app"."campaign_buyer_members" ("campaign_id") WHERE ("valid_until" IS NULL);
CREATE INDEX "campaign_buyer_members_buyer_idx" ON "app"."campaign_buyer_members" ("buyer_id");

ALTER TABLE "app"."campaign_buyer_members" ENABLE ROW LEVEL SECURITY;

-- RLS follows the same EXISTS-to-parent pattern as cohort_members/campaign_items (no own tenant_id column).
CREATE POLICY "campaign_buyer_members_seller_select" ON "app"."campaign_buyer_members" FOR SELECT USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_buyer_members"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));

CREATE POLICY "campaign_buyer_members_seller_insert" ON "app"."campaign_buyer_members" FOR INSERT WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_buyer_members"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));

CREATE POLICY "campaign_buyer_members_seller_update" ON "app"."campaign_buyer_members" FOR UPDATE USING (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_buyer_members"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"())))))) WITH CHECK (("app"."is_seller"() AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_buyer_members"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()))))));

CREATE POLICY "campaign_buyer_members_buyer_select" ON "app"."campaign_buyer_members" FOR SELECT USING (("app"."is_buyer"() AND ("buyer_id" = "app"."jwt_buyer_id"()) AND (EXISTS ( SELECT 1
   FROM "app"."campaigns" "c"
  WHERE (("c"."id" = "campaign_buyer_members"."campaign_id") AND ("c"."tenant_id" = "app"."jwt_tenant_id"()) AND ("c"."status" = 'published'::"text"))))));
