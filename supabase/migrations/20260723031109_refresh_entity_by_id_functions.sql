-- Per-entity "recompute now" functions, analogous to the existing app.refresh_cohort_by_id,
-- for price lists and campaigns. Used by API routes to satisfy requirement 4 (automatic
-- membership recomputed on save/publish), not just left for the next scheduled tick.

CREATE OR REPLACE FUNCTION "app"."refresh_price_list_by_id"("p_price_list_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_product   record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.price_lists
  WHERE id = p_price_list_id AND membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_product IN
    SELECT id FROM app.tenant_products
    WHERE tenant_id = v_tenant_id AND deleted_at IS NULL
  LOOP
    PERFORM app.evaluate_product_for_price_lists_v2(v_product.id);
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."refresh_price_list_by_id"("uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_campaign_products_by_id"("p_campaign_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_product   record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.campaigns
  WHERE id = p_campaign_id AND product_membership_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_product IN
    SELECT id FROM app.tenant_products
    WHERE tenant_id = v_tenant_id AND deleted_at IS NULL
  LOOP
    PERFORM app.evaluate_product_for_campaigns_v2(v_product.id);
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."refresh_campaign_products_by_id"("uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "app"."refresh_campaign_buyers_by_id"("p_campaign_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'app', 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_buyer     record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.campaigns
  WHERE id = p_campaign_id AND buyer_target_mode = 'automatic' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_buyer IN
    SELECT id FROM app.buyers
    WHERE tenant_id = v_tenant_id AND deleted_at IS NULL AND is_active = true
  LOOP
    PERFORM app.evaluate_buyer_for_campaign_buyers(v_buyer.id);
  END LOOP;
END;
$$;

ALTER FUNCTION "app"."refresh_campaign_buyers_by_id"("uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "app"."refresh_price_list_by_id"("uuid") TO "service_role";
GRANT ALL ON FUNCTION "app"."refresh_campaign_products_by_id"("uuid") TO "service_role";
GRANT ALL ON FUNCTION "app"."refresh_campaign_buyers_by_id"("uuid") TO "service_role";
