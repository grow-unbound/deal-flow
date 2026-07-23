-- Scheduled-refresh fallback net for automatic membership (requirement 4: recomputed
-- whenever evaluated, including "on a scheduled refresh"). On-view and on-publish already
-- recompute synchronously (the refresh_*_by_id RPCs wired into the Phase 4 API routes) --
-- this is the backstop for everything else, modeled on metrics-v2's dirty-mark + tick
-- pattern (app.metrics_dirty_work / app.metrics_refresh_tick,
-- 20260716041516_metrics_v2_phase_2_additive_schema_foundation.sql /
-- 20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql) but deliberately much
-- simpler: membership evaluation per entity is already fast/atomic (no multi-tick cursor
-- resumption, no fencing epochs needed -- those solve problems specific to metrics-v2's
-- large batch computations that don't apply here).

CREATE TABLE IF NOT EXISTS "app"."membership_dirty_work" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lease_owner" "uuid",
    "lease_until" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "membership_dirty_work_entity_type_check" CHECK ("entity_type" = ANY (ARRAY['cohort'::"text", 'price_list'::"text", 'campaign_buyers'::"text", 'campaign_products'::"text"])),
    CONSTRAINT "membership_dirty_work_state_check" CHECK ("state" = ANY (ARRAY['pending'::"text", 'claimed'::"text", 'done'::"text", 'failed'::"text"])),
    CONSTRAINT "membership_dirty_work_attempts_check" CHECK ("attempts" >= 0)
);

ALTER TABLE "app"."membership_dirty_work" OWNER TO "postgres";

ALTER TABLE ONLY "app"."membership_dirty_work"
    ADD CONSTRAINT "membership_dirty_work_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "app"."membership_dirty_work"
    ADD CONSTRAINT "membership_dirty_work_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE RESTRICT;

-- Idempotent mark-dirty: at most one pending row per (tenant, entity) at a time.
CREATE UNIQUE INDEX "membership_dirty_work_pending_uk" ON "app"."membership_dirty_work" ("tenant_id", "entity_type", "entity_id") WHERE ("state" = 'pending');
CREATE INDEX "membership_dirty_work_claim_idx" ON "app"."membership_dirty_work" ("next_attempt_at", "created_at") WHERE ("state" = 'pending');

ALTER TABLE "app"."membership_dirty_work" ENABLE ROW LEVEL SECURITY;

-- Only SECURITY DEFINER functions and cron touch this table; no seller/buyer-facing route
-- reads it, so it needs no request-context RLS policy, only the service_role grant below.
GRANT ALL ON "app"."membership_dirty_work" TO "service_role";


CREATE OR REPLACE FUNCTION "app"."membership_mark_dirty"("p_tenant_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
BEGIN
  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  VALUES (p_tenant_id, p_entity_type, p_entity_id, p_reason)
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;
END;
$$;

ALTER FUNCTION "app"."membership_mark_dirty"("uuid", "text", "uuid", "text") OWNER TO "postgres";


-- Coarse tenant-wide dirty-mark: on any buyer/order write, mark every automatic
-- cohort/campaign-buyer-audience for that tenant dirty (re-evaluation is cheap and
-- idempotent -- narrower per-entity dirtying only if tick load becomes a problem).
-- On any inventory/stock_in_events write, mark every automatic price-list/campaign-product
-- entity dirty instead.
CREATE OR REPLACE FUNCTION "app"."membership_mark_tenant_dirty"("p_tenant_id" "uuid", "p_kind" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
BEGIN
  IF p_kind = 'buyer' THEN
    INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
    SELECT p_tenant_id, 'cohort', c.id, p_reason
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id AND c.membership_mode = 'automatic' AND c.deleted_at IS NULL
    ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

    INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
    SELECT p_tenant_id, 'campaign_buyers', c.id, p_reason
    FROM app.campaigns c
    WHERE c.tenant_id = p_tenant_id AND c.buyer_target_mode = 'automatic' AND c.deleted_at IS NULL
    ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

  ELSIF p_kind = 'product' THEN
    INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
    SELECT p_tenant_id, 'price_list', pl.id, p_reason
    FROM app.price_lists pl
    WHERE pl.tenant_id = p_tenant_id AND pl.membership_mode = 'automatic' AND pl.deleted_at IS NULL
    ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

    INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
    SELECT p_tenant_id, 'campaign_products', c.id, p_reason
    FROM app.campaigns c
    WHERE c.tenant_id = p_tenant_id AND c.product_membership_mode = 'automatic' AND c.deleted_at IS NULL
    ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;
  END IF;
END;
$$;

ALTER FUNCTION "app"."membership_mark_tenant_dirty"("uuid", "text", "text") OWNER TO "postgres";


-- Single-claim-per-tick, matching metrics-v2's proven "at most one lease advances per
-- invocation" shape. Runs as a plain function (not a multi-stage claim/compute/ack RPC) since
-- membership evaluation for one entity is already a single fast transaction.
CREATE OR REPLACE FUNCTION "app"."membership_refresh_tick"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_row    app.membership_dirty_work%ROWTYPE;
  v_owner  uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_row
  FROM app.membership_dirty_work
  WHERE state = 'pending' AND next_attempt_at <= now()
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE app.membership_dirty_work
  SET state = 'claimed', lease_owner = v_owner, lease_until = now() + interval '2 minutes', updated_at = now()
  WHERE id = v_row.id;

  BEGIN
    IF v_row.entity_type = 'cohort' THEN
      PERFORM app.refresh_cohort_by_id(v_row.entity_id);
    ELSIF v_row.entity_type = 'price_list' THEN
      PERFORM app.refresh_price_list_by_id(v_row.entity_id);
    ELSIF v_row.entity_type = 'campaign_buyers' THEN
      PERFORM app.refresh_campaign_buyers_by_id(v_row.entity_id);
    ELSIF v_row.entity_type = 'campaign_products' THEN
      PERFORM app.refresh_campaign_products_by_id(v_row.entity_id);
    END IF;

    UPDATE app.membership_dirty_work
    SET state = 'done', updated_at = now()
    WHERE id = v_row.id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE app.membership_dirty_work
    SET state = CASE WHEN attempts >= 4 THEN 'failed' ELSE 'pending' END,
        attempts = attempts + 1,
        next_attempt_at = now() + (interval '30 seconds' * (attempts + 1)),
        last_error = SQLERRM,
        lease_owner = NULL,
        lease_until = NULL,
        updated_at = now()
    WHERE id = v_row.id;
  END;
END;
$$;

ALTER FUNCTION "app"."membership_refresh_tick"() OWNER TO "postgres";

GRANT ALL ON FUNCTION "app"."membership_mark_dirty"("uuid", "text", "uuid", "text") TO "service_role";
GRANT ALL ON FUNCTION "app"."membership_mark_tenant_dirty"("uuid", "text", "text") TO "service_role";
GRANT ALL ON FUNCTION "app"."membership_refresh_tick"() TO "service_role";


-- Cron registration, mirroring app.ensure_metrics_refresh_tick_cron_scheduled's idempotent
-- upsert-by-jobname idiom (20260717090520_metrics_v2_refresh_tick_15s_cadence.sql). 30s
-- cadence: lower latency need than metrics GMV, and this is a fallback net behind
-- already-synchronous on-view/on-publish recompute, not the primary freshness path.
CREATE OR REPLACE FUNCTION "app"."ensure_membership_refresh_tick_cron_scheduled"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'membership-automatic-refresh-tick',
    '30 seconds',
    $cron$SELECT app.membership_refresh_tick();$cron$
  );
END;
$$;

ALTER FUNCTION "app"."ensure_membership_refresh_tick_cron_scheduled"() OWNER TO "postgres";

SELECT "app"."ensure_membership_refresh_tick_cron_scheduled"();
