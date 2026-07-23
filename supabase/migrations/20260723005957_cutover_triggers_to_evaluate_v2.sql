-- Cut the live trigger paths over to the v2 evaluators. v1 functions
-- (evaluate_buyer_for_cohorts, evaluate_product_for_campaigns, evaluate_product_for_price_lists)
-- are left in place, deprecated, in case anything else still calls them directly.

CREATE OR REPLACE FUNCTION "app"."trg_buyer_geography_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.geography IS DISTINCT FROM OLD.geography THEN
    PERFORM app.evaluate_buyer_for_cohorts_v2(NEW.id);
    PERFORM app.evaluate_buyer_for_campaign_buyers(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "app"."trg_buyer_geography_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_order_buyer_cohort_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE' AND (
      NEW.status       IS DISTINCT FROM OLD.status OR
      NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
      NEW.placed_at    IS DISTINCT FROM OLD.placed_at
    )
  ) THEN
    PERFORM app.evaluate_buyer_for_cohorts_v2(NEW.buyer_id);
    PERFORM app.evaluate_buyer_for_campaign_buyers(NEW.buyer_id);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "app"."trg_order_buyer_cohort_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."trg_inventory_campaign_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NEW; END IF;

  -- Log stock-in event if qty increased
  IF NEW.qty_available > COALESCE(OLD.qty_available, 0) THEN
    INSERT INTO app.stock_in_events (tenant_id, tenant_product_id, qty_delta)
    SELECT tp.tenant_id,
           NEW.tenant_product_id,
           NEW.qty_available - COALESCE(OLD.qty_available, 0)
    FROM app.tenant_products tp
    WHERE tp.id = NEW.tenant_product_id;
  END IF;

  PERFORM app.evaluate_product_for_campaigns_v2(NEW.tenant_product_id);
  PERFORM app.evaluate_product_for_price_lists_v2(NEW.tenant_product_id);

  RETURN NEW;
END;
$$;

ALTER FUNCTION "app"."trg_inventory_campaign_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_cohort_by_id"("p_cohort_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tenant_id uuid;
  v_buyer     record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.cohorts
  WHERE id = p_cohort_id AND membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_buyer IN
    SELECT id FROM app.buyers
    WHERE tenant_id = v_tenant_id AND deleted_at IS NULL AND is_active = true
  LOOP
    PERFORM app.evaluate_buyer_for_cohorts_v2(v_buyer.id);
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."refresh_cohort_by_id"("p_cohort_id" "uuid") OWNER TO "postgres";
