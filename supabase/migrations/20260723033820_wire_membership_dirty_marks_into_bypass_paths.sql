-- app.trg_order_buyer_cohort_refresh returns early with no work at all when
-- sync_trigger_bypass_active() is true (bulk Zoho order sync) -- unlike the M11 inventory
-- fix, no reconciliation existed for this bypass, so automatic cohort/campaign-buyer
-- membership silently went stale after every bulk order sync until this migration. Mark the
-- tenant's automatic buyer-side entities dirty instead of doing nothing; the tick (30s
-- cadence) picks them up shortly after.
--
-- Also mark app.trg_inventory_campaign_refresh's bypass branch dirty as defense-in-depth
-- alongside the M11 batched fix in persist_with_natural_key_lock, in case some other bulk
-- inventory write path is ever added that doesn't go through that function.

CREATE OR REPLACE FUNCTION "app"."trg_order_buyer_cohort_refresh"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    PERFORM app.membership_mark_tenant_dirty(NEW.tenant_id, 'buyer', 'bulk_order_sync_bypass');
    RETURN NEW;
  END IF;

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
DECLARE
  v_tenant_id uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    SELECT tp.tenant_id INTO v_tenant_id FROM app.tenant_products tp WHERE tp.id = NEW.tenant_product_id;
    IF v_tenant_id IS NOT NULL THEN
      PERFORM app.membership_mark_tenant_dirty(v_tenant_id, 'product', 'bulk_inventory_sync_bypass');
    END IF;
    RETURN NEW;
  END IF;

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
