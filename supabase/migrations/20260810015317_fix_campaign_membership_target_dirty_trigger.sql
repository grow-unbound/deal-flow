-- Hotfix: the membership target dirty trigger runs on cohorts, price_lists, and
-- campaigns. A prior version referenced v_row.membership_mode before narrowing the
-- table branch, which breaks campaign updates because campaigns use
-- buyer_target_mode/product_membership_mode instead.

CREATE OR REPLACE FUNCTION app.trg_membership_target_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row jsonb;
  v_tenant_id uuid;
  v_entity_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_tenant_id := (v_row ->> 'tenant_id')::uuid;
  v_entity_id := (v_row ->> 'id')::uuid;

  IF TG_TABLE_NAME = 'cohorts' THEN
    IF v_row ->> 'membership_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'cohort',
        v_entity_id,
        TG_TABLE_NAME || '_' || lower(TG_OP)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'price_lists' THEN
    IF v_row ->> 'membership_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'price_list',
        v_entity_id,
        TG_TABLE_NAME || '_' || lower(TG_OP)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'campaigns' THEN
    IF v_row ->> 'buyer_target_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'campaign_buyers',
        v_entity_id,
        TG_TABLE_NAME || '_buyer_' || lower(TG_OP)
      );
    END IF;

    IF v_row ->> 'product_membership_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'campaign_products',
        v_entity_id,
        TG_TABLE_NAME || '_product_' || lower(TG_OP)
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app.trg_membership_target_dirty() OWNER TO postgres;
GRANT ALL ON FUNCTION app.trg_membership_target_dirty() TO service_role;
