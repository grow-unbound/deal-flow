-- Metrics V2: stop the per-event tenant-wide app.refresh_buyer_app_daily()
-- call inside app.record_buyer_app_activity(). This function is invoked on
-- EVERY Buyer App activity event (e.g. `home_viewed`, product views, catalog
-- browsing) -- not just transactions -- so for a tenant with many app-enabled
-- buyers browsing regularly, event volume is far higher than order/invoice/
-- estimate volume. refresh_buyer_app_daily does a DELETE + full tenant/day
-- rescan of orders, estimates, invoices, and buyer_app_activity
-- (20260709000001_prod_bootstrap.sql:6710-6841) -- exactly the synchronous
-- tenant-wide aggregate-on-every-write pattern already removed from the
-- order/invoice/estimate dispatch triggers in
-- 20260717080952_metrics_v2_stop_legacy_tenant_refresh.sql.
--
-- Confirmed zero application routes read kpi_buyer_app_daily or
-- buyer_app_snapshot anymore (grep across app/ and src/lib/server/ is empty)
-- -- Buyer App analytics now reads metrics_tenant_buyer_app_snapshot /
-- metrics_buyer_snapshot. This migration is purely subtractive: it does not
-- touch the buyer_app_activity insert/upsert itself, only the trailing
-- refresh call.
--
-- The three trg_estimates/invoices/orders_refresh_buyer_app_daily() trigger
-- functions in prod_bootstrap were checked and confirmed orphaned -- defined
-- but never attached via CREATE TRIGGER to any table -- so they are dead
-- code, not a live risk, and are left untouched.

CREATE OR REPLACE FUNCTION app.record_buyer_app_activity(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_event_name text,
  p_occurred_at timestamp with time zone DEFAULT now(),
  p_location_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL::text,
  p_qualifies_for_engagement boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $$
DECLARE
  v_claim_tenant uuid := app.jwt_tenant_id();
  v_claim_buyer uuid := app.jwt_buyer_id();
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_occurred_day date := (COALESCE(p_occurred_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  v_activity_id uuid;
BEGIN
  IF btrim(COALESCE(p_event_name, '')) = '' THEN
    RAISE EXCEPTION 'event_name_required' USING ERRCODE = '22023';
  END IF;

  IF v_claim_tenant IS NOT NULL AND v_claim_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_claim_buyer IS NOT NULL AND v_claim_buyer <> p_buyer_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM app.buyers b
  WHERE b.id = p_buyer_id
    AND b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'buyer_not_found' USING ERRCODE = '22023';
  END IF;

  IF p_location_id IS NOT NULL THEN
    PERFORM 1
    FROM app.locations l
    WHERE l.id = p_location_id
      AND l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'location_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO app.buyer_app_activity (
      tenant_id,
      buyer_id,
      location_id,
      event_name,
      event_source,
      source_entity_id,
      occurred_at,
      occurred_day,
      qualifies_for_engagement,
      metadata,
      idempotency_key,
      created_by,
      updated_by,
      deleted_at
    )
    VALUES (
      p_tenant_id,
      p_buyer_id,
      p_location_id,
      btrim(p_event_name),
      'route',
      NULL,
      v_occurred_at,
      v_occurred_day,
      p_qualifies_for_engagement,
      COALESCE(p_metadata, '{}'::jsonb),
      p_idempotency_key,
      auth.uid(),
      auth.uid(),
      NULL
    )
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
    SET
      buyer_id = EXCLUDED.buyer_id,
      location_id = EXCLUDED.location_id,
      event_name = EXCLUDED.event_name,
      occurred_at = EXCLUDED.occurred_at,
      occurred_day = EXCLUDED.occurred_day,
      qualifies_for_engagement = EXCLUDED.qualifies_for_engagement,
      metadata = EXCLUDED.metadata,
      updated_by = auth.uid(),
      deleted_at = NULL
    RETURNING id INTO v_activity_id;
  ELSE
    INSERT INTO app.buyer_app_activity (
      tenant_id,
      buyer_id,
      location_id,
      event_name,
      event_source,
      source_entity_id,
      occurred_at,
      occurred_day,
      qualifies_for_engagement,
      metadata,
      idempotency_key,
      created_by,
      updated_by,
      deleted_at
    )
    VALUES (
      p_tenant_id,
      p_buyer_id,
      p_location_id,
      btrim(p_event_name),
      'route',
      NULL,
      v_occurred_at,
      v_occurred_day,
      p_qualifies_for_engagement,
      COALESCE(p_metadata, '{}'::jsonb),
      NULL,
      auth.uid(),
      auth.uid(),
      NULL
    )
    RETURNING id INTO v_activity_id;
  END IF;

  RETURN v_activity_id;
END;
$$;
