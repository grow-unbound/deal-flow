-- Existing buyers (seller/ERP-created, buyer_app_enabled = false) have no intake form to file.
-- app.sync_entry_from_buyer deliberately creates no inbox entry for them (see
-- 20260928042731_fix_sync_entry_from_buyer_null_guard.sql), so when such a buyer taps
-- "Request access" on /pending we raise the approval entry explicitly here.
--
-- The entry is a normal 'business_approval' (approve / request_more_info / decline, admin-only,
-- Zoho push all work unchanged) flagged with metadata.request_kind = 'existing_buyer_access' and a
-- read-only snapshot of the buyer's sales, demand and dues so the seller can decide with context.
-- Numbers come from the aggregate snapshots (metrics_buyer_period_summary / metrics_buyer_now_summary),
-- never recomputed from raw documents.
--
-- Not routed through app.upsert_entry: that returns NULL when the tenant disabled auto-generation
-- for the entry type, which would silently swallow an explicit buyer action. The INSERT below mirrors
-- upsert_entry's dedupe/reopen semantics.

CREATE OR REPLACE FUNCTION app.request_buyer_app_access(p_buyer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_buyer app.buyers%ROWTYPE;
  v_dedupe_key text;
  v_existing app.entries%ROWTYPE;
  v_primary text;
  v_cur_start date := date_trunc('quarter', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_prev_start date;
  v_cur app.metrics_buyer_period_summary%ROWTYPE;
  v_prev app.metrics_buyer_period_summary%ROWTYPE;
  v_now app.metrics_buyer_now_summary%ROWTYPE;
  v_snapshot jsonb;
  v_metadata jsonb;
  v_entry_id uuid;
BEGIN
  v_prev_start := (v_cur_start - interval '3 months')::date;

  SELECT * INTO v_buyer
  FROM app.buyers
  WHERE id = p_buyer_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_buyer.id IS NULL THEN
    RAISE EXCEPTION 'buyer_not_found' USING ERRCODE = '02000';
  END IF;

  IF COALESCE(v_buyer.buyer_app_enabled, true) THEN
    RAISE EXCEPTION 'buyer_app_already_enabled' USING ERRCODE = '22023';
  END IF;

  IF v_buyer.custom_fields->>'storefront_self_registered' = 'true' THEN
    RAISE EXCEPTION 'not_an_existing_buyer' USING ERRCODE = '22023';
  END IF;

  IF v_buyer.onboarding_status = 'declined' THEN
    RAISE EXCEPTION 'access_request_declined' USING ERRCODE = '22023';
  END IF;

  v_dedupe_key := concat_ws(':', v_buyer.tenant_id::text, 'business_approval', 'buyer', v_buyer.id::text);

  SELECT * INTO v_existing
  FROM app.entries e
  WHERE e.tenant_id = v_buyer.tenant_id
    AND e.dedupe_key = v_dedupe_key
    AND e.deleted_at IS NULL;

  -- Already asked and the seller has not acted yet (new/opened/in_progress/waiting): nothing to redo.
  IF v_existing.id IS NOT NULL
     AND v_existing.status <> 'resolved'
     AND v_existing.metadata->>'request_kind' = 'existing_buyer_access' THEN
    RETURN jsonb_build_object('entry_id', v_existing.id, 'already_requested', true);
  END IF;

  v_primary := app.metrics_v4_primary_demand_kind(v_buyer.tenant_id);

  SELECT * INTO v_cur
  FROM app.metrics_buyer_period_summary s
  WHERE s.tenant_id = v_buyer.tenant_id AND s.buyer_id = v_buyer.id
    AND s.grain = 'quarter' AND s.period_start = v_cur_start AND s.deleted_at IS NULL;

  SELECT * INTO v_prev
  FROM app.metrics_buyer_period_summary s
  WHERE s.tenant_id = v_buyer.tenant_id AND s.buyer_id = v_buyer.id
    AND s.grain = 'quarter' AND s.period_start = v_prev_start AND s.deleted_at IS NULL;

  SELECT * INTO v_now
  FROM app.metrics_buyer_now_summary s
  WHERE s.tenant_id = v_buyer.tenant_id AND s.buyer_id = v_buyer.id AND s.deleted_at IS NULL;

  -- A missing summary row means "no activity in that period" -> zeros (the summary builder only
  -- writes rows where something happened), so COALESCE rather than leaving nulls.
  v_snapshot := jsonb_build_object(
    'current_quarter_start', v_cur_start,
    'previous_quarter_start', v_prev_start,
    'sales', jsonb_build_object(
      'current', jsonb_build_object('invoice_value', COALESCE(v_cur.invoice_value, 0), 'invoice_count', COALESCE(v_cur.invoice_count, 0)),
      'previous', jsonb_build_object('invoice_value', COALESCE(v_prev.invoice_value, 0), 'invoice_count', COALESCE(v_prev.invoice_count, 0))
    ),
    'demand', jsonb_build_object(
      'kind', v_primary,
      'current', jsonb_build_object('value', COALESCE(v_cur.primary_demand_value, 0), 'count', COALESCE(v_cur.primary_demand_count, 0)),
      'previous', jsonb_build_object('value', COALESCE(v_prev.primary_demand_value, 0), 'count', COALESCE(v_prev.primary_demand_count, 0))
    ),
    'dues', jsonb_build_object(
      'receivable_amount', COALESCE(v_now.receivable_amount, 0),
      'receivable_invoice_count', COALESCE(v_now.receivable_invoice_count, 0),
      'overdue_amount', COALESCE(v_now.overdue_amount, 0),
      'overdue_invoice_count', COALESCE(v_now.overdue_invoice_count, 0),
      'credit_limit', COALESCE(v_now.credit_limit, v_buyer.credit_limit, 0),
      'credit_available', v_now.credit_available,
      'last_invoice_date', v_now.last_invoice_date,
      'last_buyer_app_activity_at', v_now.last_buyer_app_activity_at
    ),
    'computed_at', GREATEST(v_cur.computed_at, v_prev.computed_at, v_now.computed_at)
  );

  v_metadata := jsonb_build_object(
    'request_kind', 'existing_buyer_access',
    'existing_buyer', true,
    'app_access_disabled', true,
    'business_name', v_buyer.business_name,
    'contact_name', v_buyer.contact_name,
    'phone', v_buyer.phone,
    'gstin', v_buyer.gstin,
    'has_business_details', true,
    'buyer_context', v_snapshot,
    'requested_at', now()
  );

  INSERT INTO app.entries (
    tenant_id, buyer_id, location_id, entry_type, source_channel,
    source_entity_type, source_entity_id, dedupe_key, status, priority_at,
    external_sync_status, metadata, external_ref, created_by, updated_by
  )
  VALUES (
    v_buyer.tenant_id, v_buyer.id, NULL, 'business_approval', 'storefront',
    'buyer', v_buyer.id, v_dedupe_key, 'new', now(),
    'pending', v_metadata, v_dedupe_key, v_buyer.user_id, v_buyer.user_id
  )
  ON CONFLICT (tenant_id, dedupe_key) WHERE deleted_at IS NULL
  DO UPDATE SET
    status = 'new',
    remind_at = NULL,
    resolution_reason = NULL,
    resolved_at = NULL,
    resolved_by = NULL,
    priority_at = now(),
    metadata = app.entries.metadata || EXCLUDED.metadata,
    updated_by = EXCLUDED.updated_by
  RETURNING id INTO v_entry_id;

  INSERT INTO app.entry_events (
    tenant_id, entry_id, actor_user_id, action, to_status, metadata, created_by, updated_by
  )
  VALUES (
    v_buyer.tenant_id, v_entry_id, NULL,
    CASE WHEN v_existing.id IS NULL THEN 'generated' ELSE 'reopen' END,
    'new',
    jsonb_build_object('entry_type', 'business_approval', 'source_channel', 'storefront', 'request_kind', 'existing_buyer_access'),
    NULL, NULL
  );

  UPDATE app.buyers
  SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object('access_requested_at', now()),
      updated_at = now(),
      updated_by = v_buyer.user_id
  WHERE id = v_buyer.id;

  RETURN jsonb_build_object('entry_id', v_entry_id, 'already_requested', false);
END;
$function$;

REVOKE ALL ON FUNCTION app.request_buyer_app_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.request_buyer_app_access(uuid) TO service_role;
