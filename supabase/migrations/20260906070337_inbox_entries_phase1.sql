-- Yukti Inbox phase 1: actionable seller-side entries.

CREATE TABLE IF NOT EXISTS app.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid REFERENCES app.buyers(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES app.locations(id) ON DELETE RESTRICT,
  entry_type text NOT NULL,
  source_channel text NOT NULL DEFAULT 'backend',
  source_entity_type text NOT NULL,
  source_entity_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  priority_at timestamptz NOT NULL DEFAULT now(),
  remind_at timestamptz,
  last_actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  last_action text,
  last_action_at timestamptz,
  external_sync_status text NOT NULL DEFAULT 'not_required',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT entries_entry_type_check CHECK (
    entry_type = ANY (ARRAY[
      'business_approval',
      'new_user_login',
      'new_enquiry',
      'new_order_confirmation',
      'order_dispatch_needed',
      'invoice_due',
      'invoice_overdue',
      'credit_limit_breach'
    ])
  ),
  CONSTRAINT entries_source_channel_check CHECK (
    source_channel = ANY (ARRAY['storefront', 'backend', 'manual', 'whatsapp', 'email', 'phone'])
  ),
  CONSTRAINT entries_source_entity_type_check CHECK (
    source_entity_type = ANY (ARRAY['buyer', 'estimate', 'order', 'invoice'])
  ),
  CONSTRAINT entries_status_check CHECK (
    status = ANY (ARRAY['new', 'opened', 'in_progress', 'waiting', 'resolved'])
  ),
  CONSTRAINT entries_external_sync_status_check CHECK (
    external_sync_status = ANY (ARRAY['not_required', 'pending', 'synced', 'failed'])
  ),
  CONSTRAINT entries_remind_at_check CHECK (
    (status = 'waiting' AND remind_at IS NOT NULL)
    OR (status <> 'waiting')
  )
);

CREATE TABLE IF NOT EXISTS app.entry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  entry_id uuid NOT NULL REFERENCES app.entries(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  from_status text,
  to_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT entry_events_status_check CHECK (
    (from_status IS NULL OR from_status = ANY (ARRAY['new', 'opened', 'in_progress', 'waiting', 'resolved']))
    AND (to_status IS NULL OR to_status = ANY (ARRAY['new', 'opened', 'in_progress', 'waiting', 'resolved']))
  )
);

CREATE TABLE IF NOT EXISTS app.entry_type_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  entry_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  auto_generate_enabled boolean NOT NULL DEFAULT true,
  notification_enabled boolean NOT NULL DEFAULT true,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT entry_type_settings_entry_type_check CHECK (
    entry_type = ANY (ARRAY[
      'business_approval',
      'new_user_login',
      'new_enquiry',
      'new_order_confirmation',
      'order_dispatch_needed',
      'invoice_due',
      'invoice_overdue',
      'credit_limit_breach'
    ])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS entries_tenant_dedupe_active_uk
  ON app.entries (tenant_id, dedupe_key)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entries_tenant_external_ref_uk
  ON app.entries (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS entries_tenant_status_priority_idx
  ON app.entries (tenant_id, status, priority_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_tenant_buyer_status_priority_idx
  ON app.entries (tenant_id, buyer_id, status, priority_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_tenant_type_status_priority_idx
  ON app.entries (tenant_id, entry_type, status, priority_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_tenant_location_status_priority_idx
  ON app.entries (tenant_id, location_id, status, priority_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entries_tenant_source_entity_idx
  ON app.entries (tenant_id, source_entity_type, source_entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS entry_events_entry_created_idx
  ON app.entry_events (entry_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_events_tenant_created_idx
  ON app.entry_events (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entry_events_tenant_external_ref_uk
  ON app.entry_events (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entry_type_settings_tenant_type_active_uk
  ON app.entry_type_settings (tenant_id, entry_type)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entry_type_settings_tenant_external_ref_uk
  ON app.entry_type_settings (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;

DROP TRIGGER IF EXISTS entries_updated_at ON app.entries;
CREATE TRIGGER entries_updated_at
  BEFORE UPDATE ON app.entries
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS entry_events_updated_at ON app.entry_events;
CREATE TRIGGER entry_events_updated_at
  BEFORE UPDATE ON app.entry_events
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS entry_type_settings_updated_at ON app.entry_type_settings;
CREATE TRIGGER entry_type_settings_updated_at
  BEFORE UPDATE ON app.entry_type_settings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.entry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.entry_type_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.jwt_location_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = app, public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT value::uuid
      FROM jsonb_array_elements_text(COALESCE(auth.jwt()->'app_metadata'->'location_ids', auth.jwt()->'location_ids', '[]'::jsonb)) AS value
    ),
    ARRAY[]::uuid[]
  );
$$;

DROP POLICY IF EXISTS "seller members can read entries" ON app.entries;
CREATE POLICY "seller members can read entries"
  ON app.entries FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND (
      (select app.jwt_role()) = 'seller_admin'
      OR location_id IS NULL
      OR location_id IN (SELECT unnest(app.jwt_location_ids()))
    )
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "seller members can read entry events" ON app.entry_events;
CREATE POLICY "seller members can read entry events"
  ON app.entry_events FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM app.entries e
      WHERE e.id = entry_events.entry_id
        AND e.tenant_id = entry_events.tenant_id
        AND e.deleted_at IS NULL
        AND (
          (select app.jwt_role()) = 'seller_admin'
          OR e.location_id IS NULL
          OR e.location_id IN (SELECT unnest(app.jwt_location_ids()))
        )
    )
  );

DROP POLICY IF EXISTS "seller members can read entry type settings" ON app.entry_type_settings;
CREATE POLICY "seller members can read entry type settings"
  ON app.entry_type_settings FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND deleted_at IS NULL
  );

REVOKE ALL ON TABLE app.entries FROM anon, authenticated;
REVOKE ALL ON TABLE app.entry_events FROM anon, authenticated;
REVOKE ALL ON TABLE app.entry_type_settings FROM anon, authenticated;
GRANT SELECT ON TABLE app.entries TO authenticated;
GRANT SELECT ON TABLE app.entry_events TO authenticated;
GRANT SELECT ON TABLE app.entry_type_settings TO authenticated;
GRANT ALL ON TABLE app.entries TO service_role;
GRANT ALL ON TABLE app.entry_events TO service_role;
GRANT ALL ON TABLE app.entry_type_settings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE app.entries_entry_number_seq TO service_role;

CREATE OR REPLACE FUNCTION app.entry_type_auto_generate_enabled(
  p_tenant_id uuid,
  p_entry_type text
) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = app, auth, public
AS $$
  SELECT COALESCE((
    SELECT ets.enabled AND ets.auto_generate_enabled
    FROM app.entry_type_settings ets
    WHERE ets.tenant_id = p_tenant_id
      AND ets.entry_type = p_entry_type
      AND ets.deleted_at IS NULL
    LIMIT 1
  ), true);
$$;

CREATE OR REPLACE FUNCTION app.entry_allowed_actions(
  p_entry_type text,
  p_status text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = app, public
AS $$
BEGIN
  IF p_status = 'resolved' THEN
    CASE p_entry_type
      WHEN 'new_enquiry' THEN
        RETURN jsonb_build_array('reopen', 'view_enquiry', 'view_buyer');
      WHEN 'new_order_confirmation' THEN
        RETURN jsonb_build_array('reopen', 'view_order', 'view_buyer');
      WHEN 'order_dispatch_needed' THEN
        RETURN jsonb_build_array('reopen', 'view_order', 'view_buyer');
      WHEN 'invoice_due' THEN
        RETURN jsonb_build_array('reopen', 'view_invoice', 'view_buyer');
      WHEN 'invoice_overdue' THEN
        RETURN jsonb_build_array('reopen', 'view_invoice', 'view_buyer');
      ELSE
        RETURN jsonb_build_array('reopen', 'view_details', 'view_buyer');
    END CASE;
  END IF;

  IF p_status = 'waiting' THEN
    CASE p_entry_type
      WHEN 'new_enquiry' THEN
        RETURN jsonb_build_array('reopen', 'add_note', 'view_enquiry', 'view_buyer');
      WHEN 'new_order_confirmation' THEN
        RETURN jsonb_build_array('reopen', 'add_note', 'view_order', 'view_buyer');
      WHEN 'order_dispatch_needed' THEN
        RETURN jsonb_build_array('reopen', 'add_note', 'view_order', 'view_buyer');
      WHEN 'invoice_due' THEN
        RETURN jsonb_build_array('reopen', 'add_note', 'view_invoice', 'view_buyer');
      WHEN 'invoice_overdue' THEN
        RETURN jsonb_build_array('reopen', 'add_note', 'view_invoice', 'view_buyer');
      ELSE
        RETURN jsonb_build_array('reopen', 'add_note', 'view_details', 'view_buyer');
    END CASE;
  END IF;

  CASE p_entry_type
    WHEN 'business_approval' THEN
      RETURN jsonb_build_array('approve', 'request_more_info', 'decline', 'view_details', 'view_buyer', 'add_note');
    WHEN 'new_user_login' THEN
      RETURN jsonb_build_array('approve', 'request_more_info', 'decline', 'view_details', 'view_buyer', 'add_note', 'view_activity', 'ignore');
    WHEN 'new_enquiry' THEN
      RETURN jsonb_build_array('reply_quote', 'send', 'convert', 'contact_buyer', 'view_enquiry', 'view_buyer', 'view_buyer_history', 'mark_converted_manually', 'remind_later', 'add_note');
    WHEN 'new_order_confirmation' THEN
      RETURN jsonb_build_array('accept_order', 'contact_buyer', 'reject', 'view_order', 'view_buyer', 'add_note');
    WHEN 'order_dispatch_needed' THEN
      RETURN jsonb_build_array('mark_dispatched', 'view_order', 'view_buyer', 'remind_later', 'add_note');
    WHEN 'invoice_due' THEN
      RETURN jsonb_build_array('send_reminder', 'view_invoice', 'view_buyer', 'remind_later', 'add_note');
    WHEN 'invoice_overdue' THEN
      RETURN jsonb_build_array('send_reminder', 'log_call', 'view_invoice', 'view_buyer', 'remind_later', 'add_note');
    WHEN 'credit_limit_breach' THEN
      RETURN jsonb_build_array('hold_new_orders', 'adjust_limit', 'view_account', 'view_details', 'view_buyer', 'remind_later', 'add_note');
    ELSE
      RETURN jsonb_build_array('view_details', 'view_buyer', 'add_note');
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION app.entry_time_bucket(p_priority_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = app, public
AS $$
DECLARE
  v_day date := (p_priority_at AT TIME ZONE 'Asia/Kolkata')::date;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v_day = v_today THEN
    RETURN 'today';
  ELSIF v_day = v_today - 1 THEN
    RETURN 'yesterday';
  ELSIF v_day >= date_trunc('week', v_today::timestamp)::date THEN
    RETURN 'this_week';
  ELSIF v_day >= date_trunc('month', v_today::timestamp)::date THEN
    RETURN 'this_month';
  ELSIF v_day >= date_trunc('quarter', v_today::timestamp)::date THEN
    RETURN 'this_quarter';
  END IF;
  RETURN 'previous';
END;
$$;

CREATE OR REPLACE FUNCTION app.upsert_entry(
  p_tenant_id uuid,
  p_entry_type text,
  p_source_channel text,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_buyer_id uuid,
  p_location_id uuid,
  p_priority_at timestamptz,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_external_sync_status text DEFAULT 'not_required',
  p_actor_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_dedupe_key text := concat_ws(':', p_tenant_id::text, p_entry_type, p_source_entity_type, p_source_entity_id::text);
  v_entry_id uuid;
  v_existing_status text;
BEGIN
  IF NOT app.entry_type_auto_generate_enabled(p_tenant_id, p_entry_type) THEN
    RETURN NULL;
  END IF;

  INSERT INTO app.entries (
    tenant_id, buyer_id, location_id, entry_type, source_channel,
    source_entity_type, source_entity_id, dedupe_key, status, priority_at,
    external_sync_status, metadata, external_ref, created_by, updated_by
  )
  VALUES (
    p_tenant_id, p_buyer_id, p_location_id, p_entry_type, p_source_channel,
    p_source_entity_type, p_source_entity_id, v_dedupe_key, 'new', COALESCE(p_priority_at, now()),
    p_external_sync_status, COALESCE(p_metadata, '{}'::jsonb), v_dedupe_key, p_actor_user_id, p_actor_user_id
  )
  ON CONFLICT (tenant_id, dedupe_key) WHERE deleted_at IS NULL
  DO UPDATE SET
    buyer_id = EXCLUDED.buyer_id,
    location_id = EXCLUDED.location_id,
    source_channel = EXCLUDED.source_channel,
    status = CASE WHEN app.entries.status = 'resolved' THEN 'new' ELSE app.entries.status END,
    remind_at = CASE WHEN app.entries.status = 'resolved' THEN NULL ELSE app.entries.remind_at END,
    priority_at = GREATEST(app.entries.priority_at, EXCLUDED.priority_at),
    external_sync_status = EXCLUDED.external_sync_status,
    metadata = app.entries.metadata || EXCLUDED.metadata,
    updated_by = COALESCE(EXCLUDED.updated_by, app.entries.updated_by)
  RETURNING id, status INTO v_entry_id, v_existing_status;

  INSERT INTO app.entry_events (
    tenant_id, entry_id, actor_user_id, action, to_status, metadata, created_by, updated_by
  )
  SELECT p_tenant_id, v_entry_id, p_actor_user_id, 'generated', v_existing_status,
         jsonb_build_object('entry_type', p_entry_type, 'source_channel', p_source_channel),
         p_actor_user_id, p_actor_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM app.entry_events ee
    WHERE ee.entry_id = v_entry_id
      AND ee.action = 'generated'
      AND ee.deleted_at IS NULL
  );

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.resolve_entries_for_source(
  p_tenant_id uuid,
  p_entry_type text,
  p_source_entity_type text,
  p_source_entity_ids uuid[],
  p_reason text DEFAULT 'auto_resolved',
  p_actor_user_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT e.id, e.status
    FROM app.entries e
    WHERE e.tenant_id = p_tenant_id
      AND e.entry_type = p_entry_type
      AND e.source_entity_type = p_source_entity_type
      AND e.source_entity_id = ANY(COALESCE(p_source_entity_ids, ARRAY[]::uuid[]))
      AND e.status <> 'resolved'
      AND e.deleted_at IS NULL
  ),
  changed AS (
    UPDATE app.entries e
    SET status = 'resolved',
        remind_at = NULL,
        last_actor_id = p_actor_user_id,
        last_action = p_reason,
        last_action_at = now(),
        updated_by = p_actor_user_id
    FROM candidates c
    WHERE e.id = c.id
    RETURNING e.id, c.status
  )
  INSERT INTO app.entry_events (tenant_id, entry_id, actor_user_id, action, from_status, to_status, created_by, updated_by)
  SELECT p_tenant_id, c.id, p_actor_user_id, p_reason, c.status, 'resolved', p_actor_user_id, p_actor_user_id
  FROM changed c;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION app.touch_entries_for_source_action(
  p_tenant_id uuid,
  p_entry_type text,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_action text,
  p_to_status text DEFAULT 'resolved',
  p_actor_user_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_remind_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_entry app.entries%ROWTYPE;
BEGIN
  SELECT * INTO v_entry
  FROM app.entries
  WHERE tenant_id = p_tenant_id
    AND entry_type = p_entry_type
    AND source_entity_type = p_source_entity_type
    AND source_entity_id = p_source_entity_id
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_entry.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE app.entries
  SET status = p_to_status,
      remind_at = CASE WHEN p_to_status = 'waiting' THEN p_remind_at ELSE NULL END,
      last_actor_id = p_actor_user_id,
      last_action = p_action,
      last_action_at = now(),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
      updated_by = p_actor_user_id
  WHERE id = v_entry.id;

  INSERT INTO app.entry_events (
    tenant_id, entry_id, actor_user_id, action, from_status, to_status, note, metadata, created_by, updated_by
  )
  VALUES (
    p_tenant_id, v_entry.id, p_actor_user_id, p_action, v_entry.status, p_to_status, p_note,
    COALESCE(p_metadata, '{}'::jsonb), p_actor_user_id, p_actor_user_id
  );

  RETURN v_entry.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.apply_entry_action(
  p_tenant_id uuid,
  p_entry_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_remind_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS app.entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_entry app.entries%ROWTYPE;
  v_from_status text;
  v_to_status text;
BEGIN
  SELECT * INTO v_entry
  FROM app.entries
  WHERE id = p_entry_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = '02000';
  END IF;
  v_from_status := v_entry.status;

  IF p_action = 'open' THEN
    v_to_status := CASE WHEN v_entry.status = 'new' THEN 'opened' ELSE v_entry.status END;
  ELSIF p_action = 'start' THEN
    v_to_status := 'in_progress';
  ELSIF p_action = 'add_note' THEN
    v_to_status := CASE WHEN v_entry.status = 'new' THEN 'opened' ELSE v_entry.status END;
  ELSIF p_action = 'remind_later' THEN
    IF p_remind_at IS NULL OR p_remind_at <= now() THEN
      RAISE EXCEPTION 'future_remind_at_required' USING ERRCODE = '22023';
    END IF;
    v_to_status := 'waiting';
  ELSIF p_action = ANY(ARRAY['dismiss', 'ignore', 'mark_converted_manually']) THEN
    v_to_status := 'resolved';
  ELSIF p_action = 'reopen' THEN
    v_to_status := 'new';
  ELSE
    RAISE EXCEPTION 'unsupported_entry_action' USING ERRCODE = '22023';
  END IF;

  UPDATE app.entries
  SET status = v_to_status,
      remind_at = CASE WHEN v_to_status = 'waiting' THEN p_remind_at ELSE NULL END,
      priority_at = CASE WHEN p_action = 'reopen' THEN now() ELSE priority_at END,
      last_actor_id = p_actor_user_id,
      last_action = p_action,
      last_action_at = now(),
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
      updated_by = p_actor_user_id
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  INSERT INTO app.entry_events (
    tenant_id, entry_id, actor_user_id, action, from_status, to_status, note, metadata, created_by, updated_by
  )
  VALUES (
    p_tenant_id, p_entry_id, p_actor_user_id, p_action, v_from_status, v_to_status, p_note,
    COALESCE(p_metadata, '{}'::jsonb), p_actor_user_id, p_actor_user_id
  );

  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_entry_from_buyer(p_buyer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_buyer app.buyers%ROWTYPE;
  v_type text;
  v_priority timestamptz;
BEGIN
  SELECT * INTO v_buyer
  FROM app.buyers
  WHERE id = p_buyer_id
    AND deleted_at IS NULL;

  IF v_buyer.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_buyer.buyer_app_enabled, true) THEN
    PERFORM app.resolve_entries_for_source(v_buyer.tenant_id, 'business_approval', 'buyer', ARRAY[v_buyer.id], 'auto_resolved');
    PERFORM app.resolve_entries_for_source(v_buyer.tenant_id, 'new_user_login', 'buyer', ARRAY[v_buyer.id], 'auto_resolved');
    RETURN NULL;
  END IF;

  IF NOT (
    v_buyer.custom_fields->>'storefront_self_registered' = 'true'
    OR (v_buyer.created_by IS NULL AND v_buyer.external_ref IS NULL AND v_buyer.business_name ~ '^Customer [0-9+ -]+$')
  ) THEN
    RETURN NULL;
  END IF;

  v_type := CASE
    WHEN NULLIF(v_buyer.gstin, '') IS NOT NULL
      OR NULLIF(v_buyer.contact_name, '') IS NOT NULL
      OR v_buyer.business_name !~ '^Customer [0-9+ -]+$'
    THEN 'business_approval'
    ELSE 'new_user_login'
  END;
  v_priority := COALESCE(v_buyer.updated_at, v_buyer.created_at, now());

  RETURN app.upsert_entry(
    v_buyer.tenant_id,
    v_type,
    'storefront',
    'buyer',
    v_buyer.id,
    v_buyer.id,
    NULL,
    v_priority,
    jsonb_build_object(
      'business_name', v_buyer.business_name,
      'contact_name', v_buyer.contact_name,
      'phone', v_buyer.phone,
      'gstin', v_buyer.gstin,
      'has_business_details', v_type = 'business_approval'
    ),
    CASE WHEN v_type = 'business_approval' THEN 'pending' ELSE 'not_required' END,
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_entry_from_estimate(p_estimate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_est app.estimates%ROWTYPE;
BEGIN
  SELECT * INTO v_est
  FROM app.estimates
  WHERE id = p_estimate_id
    AND deleted_at IS NULL;

  IF v_est.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (
    COALESCE(v_est.is_buyer_app_estimate, false)
    OR v_est.source = ANY(ARRAY['buyer_app', 'manual'])
  ) OR NOT app.estimate_status_is_open(v_est.status) THEN
    PERFORM app.resolve_entries_for_source(v_est.tenant_id, 'new_enquiry', 'estimate', ARRAY[v_est.id], 'auto_resolved');
    RETURN NULL;
  END IF;

  RETURN app.upsert_entry(
    v_est.tenant_id,
    'new_enquiry',
    CASE WHEN COALESCE(v_est.is_buyer_app_estimate, false) OR v_est.source = 'buyer_app' THEN 'storefront' ELSE 'manual' END,
    'estimate',
    v_est.id,
    v_est.buyer_id,
    v_est.location_id,
    COALESCE(v_est.created_at, now()),
    jsonb_build_object(
      'estimate_number', v_est.estimate_number,
      'status', v_est.status,
      'amount', v_est.total_amount,
      'currency', v_est.currency,
      'valid_until', v_est.valid_until,
      'expires_at', v_est.expires_at
    ),
    'not_required',
    v_est.created_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_entry_from_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_order app.orders%ROWTYPE;
  v_entry_type text;
BEGIN
  SELECT * INTO v_order
  FROM app.orders
  WHERE id = p_order_id
    AND deleted_at IS NULL;

  IF v_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_order.status = 'received' THEN
    v_entry_type := 'new_order_confirmation';
    PERFORM app.resolve_entries_for_source(v_order.tenant_id, 'order_dispatch_needed', 'order', ARRAY[v_order.id], 'auto_resolved');
  ELSIF v_order.status = 'confirmed'
    AND COALESCE(v_order.confirmed_at, v_order.updated_at, v_order.created_at) < now() - interval '3 days' THEN
    v_entry_type := 'order_dispatch_needed';
    PERFORM app.resolve_entries_for_source(v_order.tenant_id, 'new_order_confirmation', 'order', ARRAY[v_order.id], 'auto_resolved');
  ELSE
    PERFORM app.resolve_entries_for_source(v_order.tenant_id, 'new_order_confirmation', 'order', ARRAY[v_order.id], 'auto_resolved');
    PERFORM app.resolve_entries_for_source(v_order.tenant_id, 'order_dispatch_needed', 'order', ARRAY[v_order.id], 'auto_resolved');
    RETURN NULL;
  END IF;

  RETURN app.upsert_entry(
    v_order.tenant_id,
    v_entry_type,
    CASE WHEN COALESCE(v_order.is_buyer_app_order, false) OR v_order.source = 'buyer_app' THEN 'storefront' ELSE 'backend' END,
    'order',
    v_order.id,
    v_order.buyer_id,
    v_order.location_id,
    CASE WHEN v_entry_type = 'new_order_confirmation'
      THEN COALESCE(v_order.placed_at, v_order.created_at, now())
      ELSE COALESCE(v_order.confirmed_at, v_order.updated_at, v_order.created_at, now())
    END,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'status', v_order.status,
      'amount', v_order.total_amount,
      'currency', v_order.currency,
      'has_backorder', v_order.has_backorder
    ),
    CASE WHEN v_entry_type = 'new_order_confirmation' THEN 'pending' ELSE 'not_required' END,
    v_order.created_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_entry_from_invoice(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_invoice app.invoices%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_due_day date;
  v_days integer;
  v_entry_type text;
  v_aging_tier text;
BEGIN
  SELECT * INTO v_invoice
  FROM app.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL;

  IF v_invoice.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT app.invoice_status_has_receivable(v_invoice.status, v_invoice.outstanding_balance)
    OR v_invoice.due_date IS NULL THEN
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_due', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_overdue', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    RETURN NULL;
  END IF;

  v_due_day := (v_invoice.due_date AT TIME ZONE 'Asia/Kolkata')::date;
  v_days := v_due_day - v_today;

  IF v_days BETWEEN 0 AND 7 THEN
    v_entry_type := 'invoice_due';
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_overdue', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
  ELSIF v_days < 0 THEN
    v_entry_type := 'invoice_overdue';
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_due', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
  ELSE
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_due', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    PERFORM app.resolve_entries_for_source(v_invoice.tenant_id, 'invoice_overdue', 'invoice', ARRAY[v_invoice.id], 'auto_resolved');
    RETURN NULL;
  END IF;

  v_aging_tier := CASE
    WHEN v_days >= 0 THEN 'due_soon'
    WHEN abs(v_days) <= 7 THEN '1-7d'
    WHEN abs(v_days) <= 15 THEN '8-15d'
    WHEN abs(v_days) <= 30 THEN '16-30d'
    ELSE '30d+'
  END;

  RETURN app.upsert_entry(
    v_invoice.tenant_id,
    v_entry_type,
    'backend',
    'invoice',
    v_invoice.id,
    v_invoice.buyer_id,
    v_invoice.location_id,
    COALESCE(v_invoice.due_date, v_invoice.created_at, now()),
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'status', v_invoice.status,
      'amount', v_invoice.outstanding_balance,
      'total_amount', v_invoice.total_amount,
      'currency', v_invoice.currency,
      'due_date', v_invoice.due_date,
      'days_from_due', v_days,
      'aging_tier', v_aging_tier,
      'last_reminder_at', v_invoice.last_reminder_at
    ),
    'not_required',
    v_invoice.created_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_credit_limit_entries_for_tenant(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  IF NOT app.entry_type_auto_generate_enabled(p_tenant_id, 'credit_limit_breach') THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT
      b.id AS buyer_id,
      b.business_name,
      b.credit_limit,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      ), 0)::numeric AS outstanding_balance,
      MAX(i.due_date) AS latest_due_date
    FROM app.buyers b
    LEFT JOIN app.invoices i
      ON i.tenant_id = b.tenant_id
      AND i.buyer_id = b.id
      AND i.deleted_at IS NULL
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND b.is_active = true
      AND COALESCE(b.credit_limit, 0) > 0
    GROUP BY b.id, b.business_name, b.credit_limit
    HAVING COALESCE(SUM(i.outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
    ), 0) > COALESCE(b.credit_limit, 0)
  LOOP
    PERFORM app.upsert_entry(
      p_tenant_id,
      'credit_limit_breach',
      'backend',
      'buyer',
      v_row.buyer_id,
      v_row.buyer_id,
      NULL,
      COALESCE(v_row.latest_due_date, now()),
      jsonb_build_object(
        'business_name', v_row.business_name,
        'credit_limit', v_row.credit_limit,
        'outstanding_balance', v_row.outstanding_balance,
        'over_limit_amount', v_row.outstanding_balance - v_row.credit_limit
      ),
      'not_required',
      NULL
    );
    v_count := v_count + 1;
  END LOOP;

  WITH active_over_limit AS (
    SELECT b.id
    FROM app.buyers b
    LEFT JOIN app.invoices i
      ON i.tenant_id = b.tenant_id
      AND i.buyer_id = b.id
      AND i.deleted_at IS NULL
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND b.is_active = true
      AND COALESCE(b.credit_limit, 0) > 0
    GROUP BY b.id, b.credit_limit
    HAVING COALESCE(SUM(i.outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
    ), 0) > COALESCE(b.credit_limit, 0)
  )
  UPDATE app.entries e
  SET status = 'resolved',
      remind_at = NULL,
      last_action = 'auto_resolved',
      last_action_at = now()
  WHERE e.tenant_id = p_tenant_id
    AND e.entry_type = 'credit_limit_breach'
    AND e.source_entity_type = 'buyer'
    AND e.status <> 'resolved'
    AND e.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM active_over_limit a WHERE a.id = e.source_entity_id);

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_entries_for_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_id uuid;
BEGIN
  UPDATE app.entries
  SET status = 'new',
      remind_at = NULL,
      priority_at = now(),
      last_action = 'reminder_due',
      last_action_at = now()
  WHERE tenant_id = p_tenant_id
    AND status = 'waiting'
    AND remind_at <= now()
    AND deleted_at IS NULL;

  v_count := 0;
  FOR v_id IN SELECT id FROM app.buyers WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = true LOOP
    IF app.sync_entry_from_buyer(v_id) IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('buyers', v_count);

  v_count := 0;
  FOR v_id IN
    SELECT id FROM app.estimates
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND (COALESCE(is_buyer_app_estimate, false) OR source = ANY(ARRAY['buyer_app', 'manual']))
  LOOP
    IF app.sync_entry_from_estimate(v_id) IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('estimates', v_count);

  v_count := 0;
  FOR v_id IN
    SELECT id FROM app.orders
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND status IN ('received', 'confirmed')
  LOOP
    IF app.sync_entry_from_order(v_id) IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('orders', v_count);

  v_count := 0;
  FOR v_id IN
    SELECT id FROM app.invoices
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
      AND due_date IS NOT NULL
      AND app.invoice_status_has_receivable(status, outstanding_balance)
      AND (due_date AT TIME ZONE 'Asia/Kolkata')::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date + 7
  LOOP
    IF app.sync_entry_from_invoice(v_id) IS NOT NULL THEN v_count := v_count + 1; END IF;
  END LOOP;
  v_counts := v_counts || jsonb_build_object('invoices', v_count);

  v_count := app.refresh_credit_limit_entries_for_tenant(p_tenant_id);
  v_counts := v_counts || jsonb_build_object('credit_limit_breaches', v_count);

  RETURN v_counts;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_entries_all_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tenant record;
  v_result jsonb := '{}'::jsonb;
BEGIN
  FOR v_tenant IN
    SELECT id FROM app.tenants WHERE deleted_at IS NULL ORDER BY created_at ASC
  LOOP
    v_result := v_result || jsonb_build_object(v_tenant.id::text, app.refresh_entries_for_tenant(v_tenant.id));
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app.list_entries(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_status_scope text DEFAULT 'active',
  p_entry_types text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_priority_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  entry_number bigint,
  tenant_id uuid,
  buyer_id uuid,
  buyer_name text,
  buyer_phone text,
  location_id uuid,
  entry_type text,
  status text,
  source_channel text,
  source_entity_type text,
  source_entity_id uuid,
  title text,
  summary text,
  amount numeric,
  currency text,
  priority_at timestamptz,
  remind_at timestamptz,
  created_at timestamptz,
  last_actor_id uuid,
  last_action text,
  last_action_at timestamptz,
  external_sync_status text,
  metadata jsonb,
  allowed_actions jsonb,
  time_bucket text,
  customer_entry_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH scoped AS (
    SELECT e.*, b.business_name, b.phone
    FROM app.entries e
    LEFT JOIN app.buyers b ON b.id = e.buyer_id AND b.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND (
        CASE
          WHEN p_status_scope = 'resolved' THEN e.status = 'resolved'
          WHEN p_status_scope = 'all' THEN true
          ELSE e.status <> 'resolved'
        END
      )
      AND (p_entry_types IS NULL OR e.entry_type = ANY(p_entry_types))
      AND (p_location_ids IS NULL OR e.location_id IS NULL OR e.location_id = ANY(p_location_ids))
      AND (
        p_search IS NULL
        OR p_search = ''
        OR b.business_name ILIKE '%' || p_search || '%'
        OR b.phone ILIKE '%' || p_search || '%'
        OR e.source_entity_id::text ILIKE '%' || p_search || '%'
        OR e.metadata::text ILIKE '%' || p_search || '%'
      )
      AND (
        p_cursor_priority_at IS NULL
        OR e.priority_at < p_cursor_priority_at
        OR (e.priority_at = p_cursor_priority_at AND e.id < p_cursor_id)
      )
  ),
  counted AS (
    SELECT scoped.*, COUNT(*) OVER (PARTITION BY scoped.buyer_id) AS customer_entry_count
    FROM scoped
  )
  SELECT
    c.id,
    c.entry_number,
    c.tenant_id,
    c.buyer_id,
    COALESCE(c.business_name, 'Unknown customer') AS buyer_name,
    c.phone AS buyer_phone,
    c.location_id,
    c.entry_type,
    c.status,
    c.source_channel,
    c.source_entity_type,
    c.source_entity_id,
    COALESCE(c.business_name, 'Unknown customer') AS title,
    CASE c.entry_type
      WHEN 'business_approval' THEN 'New business account'
      WHEN 'new_user_login' THEN 'New visitor, no business info yet'
      WHEN 'new_enquiry' THEN concat_ws(' · ', 'Open enquiry', c.metadata->>'amount')
      WHEN 'new_order_confirmation' THEN concat_ws(' · ', 'New order', c.metadata->>'amount')
      WHEN 'order_dispatch_needed' THEN 'Confirmed, not dispatched'
      WHEN 'invoice_due' THEN concat_ws(' · ', c.metadata->>'amount', 'due soon')
      WHEN 'invoice_overdue' THEN concat_ws(' · ', c.metadata->>'amount', 'overdue')
      WHEN 'credit_limit_breach' THEN concat_ws(' · ', c.metadata->>'over_limit_amount', 'over credit limit')
      ELSE c.entry_type
    END AS summary,
    COALESCE(NULLIF(c.metadata->>'amount', '')::numeric, NULLIF(c.metadata->>'over_limit_amount', '')::numeric) AS amount,
    c.metadata->>'currency' AS currency,
    c.priority_at,
    c.remind_at,
    c.created_at,
    c.last_actor_id,
    c.last_action,
    c.last_action_at,
    c.external_sync_status,
    c.metadata,
    app.entry_allowed_actions(c.entry_type, c.status, c.metadata) AS allowed_actions,
    app.entry_time_bucket(c.priority_at) AS time_bucket,
    c.customer_entry_count
  FROM counted c
  ORDER BY c.priority_at DESC, c.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION app.ensure_entries_daily_cron_scheduled()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public, extensions
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-entries-daily-refresh') THEN
    PERFORM cron.schedule(
      'inbox-entries-daily-refresh',
      '30 21 * * *',
      $job$SELECT app.refresh_entries_all_tenants();$job$
    );
  END IF;

  RETURN true;
END;
$$;

SELECT app.ensure_entries_daily_cron_scheduled();

REVOKE ALL ON FUNCTION app.entry_type_auto_generate_enabled(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.jwt_location_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.entry_allowed_actions(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.entry_time_bucket(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.upsert_entry(uuid, text, text, text, uuid, uuid, uuid, timestamptz, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.resolve_entries_for_source(uuid, text, text, uuid[], text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.touch_entries_for_source_action(uuid, text, text, uuid, text, text, uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.sync_entry_from_buyer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.sync_entry_from_estimate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.sync_entry_from_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.sync_entry_from_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.refresh_credit_limit_entries_for_tenant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.refresh_entries_for_tenant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.refresh_entries_all_tenants() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.list_entries(uuid, uuid[], text, text[], text, integer, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.ensure_entries_daily_cron_scheduled() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.entry_allowed_actions(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.jwt_location_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.entry_time_bucket(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app.upsert_entry(uuid, text, text, text, uuid, uuid, uuid, timestamptz, jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.resolve_entries_for_source(uuid, text, text, uuid[], text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.touch_entries_for_source_action(uuid, text, text, uuid, text, text, uuid, text, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app.apply_entry_action(uuid, uuid, uuid, text, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app.sync_entry_from_buyer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.sync_entry_from_estimate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.sync_entry_from_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.sync_entry_from_invoice(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.refresh_credit_limit_entries_for_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.refresh_entries_for_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.refresh_entries_all_tenants() TO service_role;
GRANT EXECUTE ON FUNCTION app.list_entries(uuid, uuid[], text, text[], text, integer, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.ensure_entries_daily_cron_scheduled() TO service_role;
