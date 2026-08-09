-- Metrics V4: mark 'setup' domain dirty on invoice/estimate/order writes.
--
-- Confirmed during the 2026-08-09 Wine Yard audit verification pass: after
-- fixing the dead-letter backlog (20260809070025/072229), the dashboard's
-- Outstanding Dues / Overdue Receivables cards were STILL stale
-- (metrics_tenant_now_summary.computed_at frozen at 2026-08-08 19:12,
-- untouched by the drained backlog). Root cause is separate from the
-- dead-letter issue: receivable_amount/overdue_amount/open_estimate_value/
-- open_order_value are written only by app._metrics_v4_refresh_setup_now,
-- which runs under the 'setup' domain (app._metrics_refresh_setup). But
-- app.metrics_capture_invoices/_estimates/_orders -- the row-level triggers
-- that fire on every invoice/estimate/order write -- only mark 'commercial'
-- and 'buyer_app' dirty. 'setup' was never marked dirty by transactional
-- writes at all (confirmed: zero domain='setup' rows ever existed in
-- metrics_dirty_work for this tenant), so these four now-summary fields
-- were frozen at whatever they were computed to during onboarding,
-- completely decoupled from invoice/payment/estimate/order activity.
--
-- _metrics_v4_refresh_setup_now(p_tenant_id) takes no buyer/product/date
-- scoping -- it's a full recompute of one small per-tenant row (confirmed:
-- 53 rows written, sub-second) -- so the fix is simply to mark 'setup'
-- dirty too, coalesced onto one row per tenant via a fixed source_id
-- (mirroring the age_out pattern) so a burst of invoice writes doesn't
-- explode into duplicate dirty-work rows.

CREATE OR REPLACE FUNCTION app.metrics_capture_invoices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_day date;
  v_new_day date;
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.invoice_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.invoice_date, NEW.created_at);
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'invoice', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'invoice', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  -- receivable_amount/overdue_amount live in the 'setup'-domain now-summary
  -- (app._metrics_v4_refresh_setup_now) -- a full per-tenant recompute, so
  -- one coalesced source_id per tenant is enough; no buyer/day scoping.
  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'setup', 'reconciliation', v_tenant_id
  );

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION app.metrics_capture_estimates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_day date;
  v_new_day date;
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.estimate_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.estimate_date, NEW.created_at);
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'estimate', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'estimate', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  -- open_estimate_value/open_estimate_count live in the same 'setup'-domain
  -- now-summary row.
  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'setup', 'reconciliation', v_tenant_id
  );

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION app.metrics_capture_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_source_id uuid := COALESCE(NEW.id, OLD.id);
  v_old_day date;
  v_new_day date;
BEGIN
  IF v_tenant_id IS NULL OR v_source_id IS NULL OR app.sync_trigger_bypass_active() THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.order_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.order_date, NEW.created_at);
  END IF;

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'commercial', 'order', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'buyer_app', 'order', v_source_id,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.buyer_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.buyer_id ELSE NULL END,
    NULL, NULL,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.location_id ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.location_id ELSE NULL END,
    v_old_day, v_new_day
  );

  -- open_order_value/open_order_count live in the same 'setup'-domain
  -- now-summary row.
  PERFORM app.metrics_mark_dirty(
    v_tenant_id, 'setup', 'reconciliation', v_tenant_id
  );

  RETURN NULL;
END;
$function$;

-- One-time immediate backfill: mark 'setup' dirty for every tenant with an
-- active integration so the now-summary catches up rather than waiting for
-- the next transactional write. _metrics_v4_refresh_setup_now is a cheap
-- full-tenant recompute, so this is safe to do for all tenants at once.
DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN SELECT id FROM app.tenants WHERE deleted_at IS NULL LOOP
    PERFORM app.metrics_mark_dirty(v_tenant.id, 'setup', 'reconciliation', v_tenant.id);
  END LOOP;
END $$;
