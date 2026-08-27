-- Restores the flat-₹-off / %-off / manual pricing-mode UX for both price lists and
-- campaigns. Price lists already had `pricing_strategy`/`strategy_value` columns and a
-- CASE-based repricer (`refresh_price_list_by_id`), but that function only reprices
-- *automatic*-membership lists. Campaigns never had a strategy column at all -- pricing
-- was either "use a price list" or fully manual with no bulk-apply. Add the missing
-- campaign columns, and add two narrower "reprice all current members" RPCs (independent
-- of membership_mode) that both the create-time flow and the Details-tab bulk-apply
-- confirm dialog call.

ALTER TABLE app.campaigns
  ADD COLUMN pricing_strategy text NOT NULL DEFAULT 'edit_each',
  ADD COLUMN strategy_value numeric NULL;

ALTER TABLE app.campaigns
  ADD CONSTRAINT campaigns_pricing_strategy_check
  CHECK (pricing_strategy = ANY (ARRAY['edit_each'::text, 'flat_off_base'::text, 'percentage'::text]));

CREATE OR REPLACE FUNCTION app.apply_price_list_pricing_strategy(p_price_list_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_pricing_strategy text;
  v_strategy_value numeric;
  v_external_ref text;
  v_updated_count bigint;
BEGIN
  SELECT pricing_strategy, strategy_value, external_ref
  INTO v_pricing_strategy, v_strategy_value, v_external_ref
  FROM app.price_lists
  WHERE id = p_price_list_id AND deleted_at IS NULL;

  -- Zoho-synced price lists (external_ref set) carry `pricing_strategy` as a descriptive
  -- tag copied from the Zoho pricebook type ('percentage'/'per_item') -- their item prices
  -- come exclusively from the Zoho sync, never from this CASE math. Also only the two
  -- modes this feature manages (flat_off_base/percentage) should ever trigger a recompute
  -- here -- 'per_item'/'margin_from_mrp' are legacy composer-only modes with their own
  -- semantics (handled by refresh_price_list_by_id for automatic-membership lists) and
  -- must not fall through to the ELSE branch and get silently reset to base_selling_price.
  IF NOT FOUND OR v_external_ref IS NOT NULL OR v_pricing_strategy NOT IN ('flat_off_base', 'percentage') THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE app.price_list_items pli
    SET
      price = GREATEST(
        CASE v_pricing_strategy
          WHEN 'flat_off_base' THEN COALESCE(tp.base_selling_price, 0) - COALESCE(v_strategy_value, 0)
          WHEN 'percentage' THEN COALESCE(tp.base_selling_price, 0) * (1 - COALESCE(v_strategy_value, 0) / 100)
        END, 0),
      updated_at = now()
    FROM app.tenant_products tp
    WHERE tp.id = pli.tenant_product_id
      AND pli.price_list_id = p_price_list_id
      AND pli.deleted_at IS NULL
    RETURNING pli.id
  )
  SELECT count(*) INTO v_updated_count FROM updated;

  RETURN v_updated_count;
END;
$function$;

CREATE OR REPLACE FUNCTION app.apply_campaign_pricing_strategy(p_campaign_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_pricing_source text;
  v_pricing_strategy text;
  v_strategy_value numeric;
  v_updated_count bigint;
BEGIN
  SELECT pricing_source, pricing_strategy, strategy_value
  INTO v_pricing_source, v_pricing_strategy, v_strategy_value
  FROM app.campaigns
  WHERE id = p_campaign_id AND deleted_at IS NULL;

  IF NOT FOUND OR v_pricing_source <> 'individual_prices' OR v_pricing_strategy NOT IN ('flat_off_base', 'percentage') THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE app.campaign_items ci
    SET
      price_override = GREATEST(
        CASE v_pricing_strategy
          WHEN 'flat_off_base' THEN COALESCE(tp.base_selling_price, 0) - COALESCE(v_strategy_value, 0)
          WHEN 'percentage' THEN COALESCE(tp.base_selling_price, 0) * (1 - COALESCE(v_strategy_value, 0) / 100)
        END, 0),
      updated_at = now()
    FROM app.tenant_products tp
    WHERE tp.id = ci.tenant_product_id
      AND ci.campaign_id = p_campaign_id
      AND ci.deleted_at IS NULL
    RETURNING ci.id
  )
  SELECT count(*) INTO v_updated_count FROM updated;

  RETURN v_updated_count;
END;
$function$;
