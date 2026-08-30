-- app.evaluate_product_for_campaigns_v2 crashes with a 23505 duplicate
-- key on app.campaign_items(campaign_id, tenant_product_id) whenever a
-- product that was previously matched to a campaign, then unmatched
-- (soft-deleted from campaign_items), matches that campaign again: the
-- UPDATE ... WHERE deleted_at IS NULL misses the soft-deleted row (NOT
-- FOUND), so it falls through to INSERT, which collides with the
-- existing row on the unique constraint. Confirmed live-reproducible on
-- Wine Yard (product e256b019-04f7-4411-8ab5-354c538d8b05).
--
-- This function is called by trg_inventory_campaign_refresh, an AFTER
-- trigger on app.tenant_inventory that fires alphabetically BEFORE
-- trg_metrics_v2_capture_inventory (renamed trg_metrics_v4_...) on the
-- same table -- so this crash also aborts the whole UPDATE statement
-- before the metrics-dirty-marking trigger ever runs, for any inventory
-- write touching an affected product.
--
-- Fix: replace the UPDATE-then-INSERT-if-NOT-FOUND race with a real
-- upsert.
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname = 'evaluate_product_for_campaigns_v2' AND pronamespace = 'app'::regnamespace;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fix_campaign_items: evaluate_product_for_campaigns_v2 not found';
  END IF;

  IF (SELECT count(*) FROM regexp_matches(v_def,
        E'UPDATE app\\.campaign_items\\n      SET updated_at = v_now,\\n          deleted_at = NULL\\n      WHERE campaign_id = v_campaign\\.id\\n        AND tenant_product_id = p_tenant_product_id\\n        AND deleted_at IS NULL;\\n\\n      IF NOT FOUND THEN\\n        INSERT INTO app\\.campaign_items \\(campaign_id, tenant_product_id, valid_from\\)\\n        VALUES \\(v_campaign\\.id, p_tenant_product_id, v_now\\);\\n      END IF;', 'g')) <> 1 THEN
    RAISE EXCEPTION 'fix_campaign_items: anchor not found exactly once, aborting';
  END IF;

  v_new := replace(v_def,
    E'UPDATE app.campaign_items\n      SET updated_at = v_now,\n          deleted_at = NULL\n      WHERE campaign_id = v_campaign.id\n        AND tenant_product_id = p_tenant_product_id\n        AND deleted_at IS NULL;\n\n      IF NOT FOUND THEN\n        INSERT INTO app.campaign_items (campaign_id, tenant_product_id, valid_from)\n        VALUES (v_campaign.id, p_tenant_product_id, v_now);\n      END IF;',
    E'INSERT INTO app.campaign_items (campaign_id, tenant_product_id, valid_from)\n      VALUES (v_campaign.id, p_tenant_product_id, v_now)\n      ON CONFLICT (campaign_id, tenant_product_id)\n      DO UPDATE SET updated_at = v_now, deleted_at = NULL;');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'fix_campaign_items: no substitution applied, aborting';
  END IF;

  EXECUTE v_new;
END $$;
