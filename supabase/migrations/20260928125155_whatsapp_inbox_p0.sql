-- WhatsApp Inbox P0: inbound buyer messages as Today entries.

ALTER TABLE app.entries
  DROP CONSTRAINT IF EXISTS entries_entry_type_check;
ALTER TABLE app.entries
  ADD CONSTRAINT entries_entry_type_check CHECK (
    entry_type = ANY (ARRAY[
      'business_approval',
      'new_user_login',
      'new_enquiry',
      'new_order_confirmation',
      'order_dispatch_needed',
      'invoice_due',
      'invoice_overdue',
      'credit_limit_breach',
      'whatsapp_buyer_message'
    ])
  );

ALTER TABLE app.entries
  DROP CONSTRAINT IF EXISTS entries_source_entity_type_check;
ALTER TABLE app.entries
  ADD CONSTRAINT entries_source_entity_type_check CHECK (
    source_entity_type = ANY (ARRAY['buyer', 'estimate', 'order', 'invoice', 'whatsapp_thread'])
  );

ALTER TABLE app.entry_type_settings
  DROP CONSTRAINT IF EXISTS entry_type_settings_entry_type_check;
ALTER TABLE app.entry_type_settings
  ADD CONSTRAINT entry_type_settings_entry_type_check CHECK (
    entry_type = ANY (ARRAY[
      'business_approval',
      'new_user_login',
      'new_enquiry',
      'new_order_confirmation',
      'order_dispatch_needed',
      'invoice_due',
      'invoice_overdue',
      'credit_limit_breach',
      'whatsapp_buyer_message'
    ])
  );

ALTER TABLE app.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_related_entity_type_check;
ALTER TABLE app.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_related_entity_type_check CHECK (
    related_entity_type IS NULL
    OR related_entity_type = ANY (ARRAY['estimates'::text, 'orders'::text, 'invoices'::text, 'whatsapp_thread'::text])
  );

CREATE TABLE IF NOT EXISTS app.whatsapp_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid REFERENCES app.buyers(id) ON DELETE RESTRICT,
  sender_phone text NOT NULL,
  recipient_phone_number_id text NOT NULL,
  recipient_display_phone text,
  status text NOT NULL DEFAULT 'active',
  resolution_status text NOT NULL DEFAULT 'unknown',
  buyer_contact_kind text,
  buyer_contact_role text,
  ambiguity_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_inbound_message_at timestamptz,
  last_outbound_message_at timestamptz,
  service_window_opened_at timestamptz,
  service_window_expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT whatsapp_threads_status_check CHECK (status = ANY (ARRAY['active', 'closed'])),
  CONSTRAINT whatsapp_threads_resolution_status_check CHECK (resolution_status = ANY (ARRAY['matched', 'unknown', 'ambiguous'])),
  CONSTRAINT whatsapp_threads_sender_phone_check CHECK (sender_phone ~ '^[0-9]{6,15}$')
);

CREATE TABLE IF NOT EXISTS app.whatsapp_thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  thread_id uuid NOT NULL REFERENCES app.whatsapp_threads(id) ON DELETE RESTRICT,
  direction text NOT NULL,
  provider_message_id text,
  whatsapp_message_id uuid REFERENCES app.whatsapp_messages(id) ON DELETE RESTRICT,
  sender_phone text,
  recipient_phone text,
  message_type text NOT NULL DEFAULT 'text',
  text_body text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_by_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  received_at timestamptz,
  sent_at timestamptz,
  processing_status text NOT NULL DEFAULT 'processed',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT whatsapp_thread_messages_direction_check CHECK (direction = ANY (ARRAY['inbound', 'outbound'])),
  CONSTRAINT whatsapp_thread_messages_processing_status_check CHECK (processing_status = ANY (ARRAY['processed', 'duplicate', 'failed'])),
  CONSTRAINT whatsapp_thread_messages_type_check CHECK (message_type = ANY (ARRAY['text', 'button']))
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_threads_tenant_active_sender_uk
  ON app.whatsapp_threads (tenant_id, recipient_phone_number_id, sender_phone)
  WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS whatsapp_threads_tenant_buyer_idx
  ON app.whatsapp_threads (tenant_id, buyer_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_thread_messages_provider_uk
  ON app.whatsapp_thread_messages (tenant_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS whatsapp_thread_messages_thread_created_idx
  ON app.whatsapp_thread_messages (thread_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_thread_messages_whatsapp_message_uk
  ON app.whatsapp_thread_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS whatsapp_threads_updated_at ON app.whatsapp_threads;
CREATE TRIGGER whatsapp_threads_updated_at
  BEFORE UPDATE ON app.whatsapp_threads
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

DROP TRIGGER IF EXISTS whatsapp_thread_messages_updated_at ON app.whatsapp_thread_messages;
CREATE TRIGGER whatsapp_thread_messages_updated_at
  BEFORE UPDATE ON app.whatsapp_thread_messages
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.whatsapp_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.whatsapp_thread_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller members can read whatsapp threads" ON app.whatsapp_threads;
CREATE POLICY "seller members can read whatsapp threads"
  ON app.whatsapp_threads FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "seller members can read whatsapp thread messages" ON app.whatsapp_thread_messages;
CREATE POLICY "seller members can read whatsapp thread messages"
  ON app.whatsapp_thread_messages FOR SELECT
  TO authenticated
  USING (
    tenant_id = (select app.jwt_tenant_id())
    AND (select app.is_seller())
    AND deleted_at IS NULL
  );

REVOKE ALL ON TABLE app.whatsapp_threads FROM anon, authenticated;
REVOKE ALL ON TABLE app.whatsapp_thread_messages FROM anon, authenticated;
GRANT SELECT ON TABLE app.whatsapp_threads TO authenticated;
GRANT SELECT ON TABLE app.whatsapp_thread_messages TO authenticated;
GRANT ALL ON TABLE app.whatsapp_threads TO service_role;
GRANT ALL ON TABLE app.whatsapp_thread_messages TO service_role;

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
      WHEN 'whatsapp_buyer_message' THEN
        RETURN jsonb_build_array('reopen', 'view_details', 'view_buyer');
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
      WHEN 'whatsapp_buyer_message' THEN
        RETURN jsonb_build_array('reopen', 'add_note', 'view_details', 'view_buyer');
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
      RETURN jsonb_build_array('send_reminder', 'adjust_limit', 'view_account', 'view_details', 'view_buyer', 'remind_later', 'add_note');
    WHEN 'whatsapp_buyer_message' THEN
      RETURN jsonb_build_array('reply_whatsapp', 'view_details', 'view_buyer', 'remind_later', 'add_note', 'dismiss');
    ELSE
      RETURN jsonb_build_array('view_details', 'view_buyer', 'add_note');
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION app.process_whatsapp_inbound_message(
  p_provider_message_id text,
  p_sender_phone text,
  p_recipient_phone_number_id text,
  p_recipient_display_phone text,
  p_message_type text,
  p_text_body text,
  p_received_at timestamptz,
  p_raw_payload jsonb DEFAULT '{}'::jsonb,
  p_platform_phone_number_id text DEFAULT NULL,
  p_platform_tenant_id uuid DEFAULT NULL,
  p_feature_enabled boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tenant_id uuid;
  v_sender_phone text := regexp_replace(COALESCE(p_sender_phone, ''), '\D', '', 'g');
  v_received_at timestamptz := COALESCE(p_received_at, now());
  v_thread_id uuid;
  v_message_id uuid;
  v_buyer_id uuid;
  v_resolution_status text := 'unknown';
  v_contact_kind text;
  v_contact_role text;
  v_candidate_count integer := 0;
  v_ambiguity jsonb := '{}'::jsonb;
  v_entry_id uuid;
  v_recent_messages jsonb;
  v_sanitized_payload jsonb := COALESCE(p_raw_payload, '{}'::jsonb) - 'text' - 'button';
BEGIN
  IF COALESCE(p_feature_enabled, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('processed', false, 'skipped', 'feature_disabled');
  END IF;
  IF NULLIF(trim(COALESCE(p_provider_message_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('processed', false, 'skipped', 'missing_provider_message_id');
  END IF;
  IF NULLIF(trim(COALESCE(p_recipient_phone_number_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('processed', false, 'skipped', 'missing_recipient_phone_number_id');
  END IF;
  IF v_sender_phone = '' THEN
    RETURN jsonb_build_object('processed', false, 'skipped', 'missing_sender_phone');
  END IF;
  IF COALESCE(p_message_type, 'text') NOT IN ('text', 'button') THEN
    RETURN jsonb_build_object('processed', false, 'skipped', 'unsupported_message_type');
  END IF;
  IF NULLIF(trim(COALESCE(p_text_body, '')), '') IS NULL THEN
    RETURN jsonb_build_object('processed', false, 'skipped', 'empty_text_body');
  END IF;

  SELECT ti.tenant_id
  INTO v_tenant_id
  FROM app.tenant_integrations ti
  WHERE ti.integration_type_id = 'whatsapp_business'
    AND ti.status = 'connected'
    AND ti.deleted_at IS NULL
    AND ti.config->>'phone_number_id' = p_recipient_phone_number_id
  ORDER BY ti.connected_at DESC NULLS LAST, ti.created_at DESC
  LIMIT 1;

  IF v_tenant_id IS NULL
     AND p_platform_tenant_id IS NOT NULL
     AND NULLIF(trim(COALESCE(p_platform_phone_number_id, '')), '') = p_recipient_phone_number_id
  THEN
    v_tenant_id := p_platform_tenant_id;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('processed', false, 'skipped', 'tenant_not_resolved');
  END IF;

  SELECT m.id
  INTO v_message_id
  FROM app.whatsapp_thread_messages m
  WHERE m.tenant_id = v_tenant_id
    AND m.provider_message_id = p_provider_message_id
    AND m.deleted_at IS NULL
  LIMIT 1;
  IF v_message_id IS NOT NULL THEN
    RETURN jsonb_build_object('processed', true, 'duplicate', true, 'message_id', v_message_id);
  END IF;

  WITH candidates AS (
    SELECT *
    FROM app.find_buyer_login_candidates(v_sender_phone)
    WHERE tenant_id = v_tenant_id
      AND buyer_is_active = true
      AND buyer_deleted_at IS NULL
  )
  SELECT count(*), min(buyer_id), min(kind), min(role),
         COALESCE(jsonb_agg(jsonb_build_object(
           'kind', kind,
           'buyer_id', buyer_id,
           'role', role,
           'business_name', business_name,
           'buyer_app_enabled', buyer_app_enabled
         )), '[]'::jsonb)
  INTO v_candidate_count, v_buyer_id, v_contact_kind, v_contact_role, v_ambiguity
  FROM candidates;

  IF v_candidate_count = 1 THEN
    v_resolution_status := 'matched';
    v_ambiguity := '{}'::jsonb;
  ELSIF v_candidate_count > 1 THEN
    v_buyer_id := NULL;
    v_resolution_status := 'ambiguous';
    v_contact_kind := NULL;
    v_contact_role := NULL;
    v_ambiguity := jsonb_build_object('candidate_count', v_candidate_count, 'candidates', v_ambiguity);
  ELSE
    SELECT b.id
    INTO v_buyer_id
    FROM app.buyers b
    WHERE b.tenant_id = v_tenant_id
      AND b.phone = right(v_sender_phone, 10)
      AND b.deleted_at IS NULL
    ORDER BY b.created_at DESC
    LIMIT 1;

    IF v_buyer_id IS NULL AND length(v_sender_phone) >= 10 THEN
      INSERT INTO app.buyers (
        tenant_id,
        business_name,
        contact_name,
        phone,
        buyer_app_enabled,
        is_active,
        custom_fields,
        external_ref
      )
      VALUES (
        v_tenant_id,
        'Customer ' || right(v_sender_phone, 10),
        NULL,
        right(v_sender_phone, 10),
        false,
        true,
        jsonb_build_object(
          'source', 'whatsapp_inbox',
          'storefront_self_registered', false,
          'whatsapp_unknown_sender', true
        ),
        'whatsapp_unknown:' || v_tenant_id::text || ':' || right(v_sender_phone, 10)
      )
      ON CONFLICT (tenant_id, external_ref)
      DO UPDATE SET updated_at = now()
      RETURNING id INTO v_buyer_id;
    END IF;
    v_resolution_status := 'unknown';
  END IF;

  INSERT INTO app.whatsapp_threads (
    tenant_id,
    buyer_id,
    sender_phone,
    recipient_phone_number_id,
    recipient_display_phone,
    status,
    resolution_status,
    buyer_contact_kind,
    buyer_contact_role,
    ambiguity_metadata,
    last_inbound_message_at,
    service_window_opened_at,
    service_window_expires_at,
    metadata,
    external_ref
  )
  VALUES (
    v_tenant_id,
    v_buyer_id,
    v_sender_phone,
    p_recipient_phone_number_id,
    p_recipient_display_phone,
    'active',
    v_resolution_status,
    v_contact_kind,
    v_contact_role,
    COALESCE(v_ambiguity, '{}'::jsonb),
    v_received_at,
    v_received_at,
    v_received_at + interval '24 hours',
    jsonb_build_object('last_provider_message_id', p_provider_message_id),
    'whatsapp_thread:' || v_tenant_id::text || ':' || p_recipient_phone_number_id || ':' || v_sender_phone
  )
  ON CONFLICT (tenant_id, recipient_phone_number_id, sender_phone) WHERE deleted_at IS NULL AND status = 'active'
  DO UPDATE SET
    buyer_id = COALESCE(EXCLUDED.buyer_id, app.whatsapp_threads.buyer_id),
    recipient_display_phone = COALESCE(EXCLUDED.recipient_display_phone, app.whatsapp_threads.recipient_display_phone),
    resolution_status = EXCLUDED.resolution_status,
    buyer_contact_kind = EXCLUDED.buyer_contact_kind,
    buyer_contact_role = EXCLUDED.buyer_contact_role,
    ambiguity_metadata = EXCLUDED.ambiguity_metadata,
    last_inbound_message_at = EXCLUDED.last_inbound_message_at,
    service_window_opened_at = EXCLUDED.service_window_opened_at,
    service_window_expires_at = EXCLUDED.service_window_expires_at,
    metadata = app.whatsapp_threads.metadata || EXCLUDED.metadata
  RETURNING id INTO v_thread_id;

  INSERT INTO app.whatsapp_thread_messages (
    tenant_id,
    thread_id,
    direction,
    provider_message_id,
    sender_phone,
    recipient_phone,
    message_type,
    text_body,
    raw_payload,
    received_at,
    processing_status,
    external_ref
  )
  VALUES (
    v_tenant_id,
    v_thread_id,
    'inbound',
    p_provider_message_id,
    v_sender_phone,
    p_recipient_phone_number_id,
    COALESCE(p_message_type, 'text'),
    left(p_text_body, 4000),
    v_sanitized_payload,
    v_received_at,
    'processed',
    'whatsapp_inbound:' || p_provider_message_id
  )
  ON CONFLICT (tenant_id, provider_message_id) WHERE provider_message_id IS NOT NULL AND deleted_at IS NULL
  DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    RETURN jsonb_build_object('processed', true, 'duplicate', true, 'thread_id', v_thread_id);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', sub.id,
    'direction', sub.direction,
    'text_body', sub.text_body,
    'created_at', sub.created_at,
    'provider_message_id', sub.provider_message_id
  ) ORDER BY sub.created_at), '[]'::jsonb)
  INTO v_recent_messages
  FROM (
    SELECT id, direction, text_body, created_at, provider_message_id
    FROM app.whatsapp_thread_messages
    WHERE thread_id = v_thread_id
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  ) sub;

  v_entry_id := app.upsert_entry(
    v_tenant_id,
    'whatsapp_buyer_message',
    'whatsapp',
    'whatsapp_thread',
    v_thread_id,
    v_buyer_id,
    NULL,
    v_received_at,
    jsonb_build_object(
      'thread_id', v_thread_id,
      'sender_phone', v_sender_phone,
      'recipient_phone_number_id', p_recipient_phone_number_id,
      'recipient_display_phone', p_recipient_display_phone,
      'resolution_status', v_resolution_status,
      'buyer_contact_kind', v_contact_kind,
      'buyer_contact_role', v_contact_role,
      'ambiguity', COALESCE(v_ambiguity, '{}'::jsonb),
      'last_inbound_text', left(p_text_body, 500),
      'last_inbound_at', v_received_at,
      'service_window_opened_at', v_received_at,
      'service_window_expires_at', v_received_at + interval '24 hours',
      'message_bundle', v_recent_messages
    ),
    'not_required',
    NULL
  );

  INSERT INTO app.entry_events (
    tenant_id,
    entry_id,
    action,
    to_status,
    metadata
  )
  VALUES (
    v_tenant_id,
    v_entry_id,
    'whatsapp_inbound_received',
    'new',
    jsonb_build_object('thread_id', v_thread_id, 'thread_message_id', v_message_id, 'provider_message_id', p_provider_message_id)
  );

  RETURN jsonb_build_object(
    'processed', true,
    'duplicate', false,
    'tenant_id', v_tenant_id,
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'entry_id', v_entry_id,
    'resolution_status', v_resolution_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.record_whatsapp_thread_outbound_reply(
  p_tenant_id uuid,
  p_entry_id uuid,
  p_actor_user_id uuid,
  p_reply_text text,
  p_whatsapp_message_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_entry app.entries%ROWTYPE;
  v_thread app.whatsapp_threads%ROWTYPE;
  v_message_id uuid;
BEGIN
  IF NULLIF(trim(COALESCE(p_reply_text, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reply_text_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry
  FROM app.entries
  WHERE id = p_entry_id
    AND tenant_id = p_tenant_id
    AND entry_type = 'whatsapp_buyer_message'
    AND source_entity_type = 'whatsapp_thread'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = '02000';
  END IF;

  SELECT * INTO v_thread
  FROM app.whatsapp_threads
  WHERE id = v_entry.source_entity_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_thread.id IS NULL THEN
    RAISE EXCEPTION 'thread_not_found' USING ERRCODE = '02000';
  END IF;

  INSERT INTO app.whatsapp_thread_messages (
    tenant_id,
    thread_id,
    direction,
    whatsapp_message_id,
    sender_phone,
    recipient_phone,
    message_type,
    text_body,
    sent_by_user_id,
    sent_at,
    processing_status,
    created_by,
    updated_by
  )
  VALUES (
    p_tenant_id,
    v_thread.id,
    'outbound',
    p_whatsapp_message_id,
    v_thread.recipient_phone_number_id,
    v_thread.sender_phone,
    'text',
    left(p_reply_text, 4000),
    p_actor_user_id,
    now(),
    'processed',
    p_actor_user_id,
    p_actor_user_id
  )
  ON CONFLICT (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL AND deleted_at IS NULL
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_message_id;

  UPDATE app.whatsapp_threads
  SET last_outbound_message_at = now(),
      updated_by = p_actor_user_id
  WHERE id = v_thread.id;

  UPDATE app.entries
  SET status = 'in_progress',
      last_actor_id = p_actor_user_id,
      last_action = 'reply_whatsapp',
      last_action_at = now(),
      metadata = metadata || jsonb_build_object(
        'last_outbound_at', now(),
        'last_outbound_preview', left(p_reply_text, 160)
      ),
      updated_by = p_actor_user_id
  WHERE id = p_entry_id;

  INSERT INTO app.entry_events (
    tenant_id,
    entry_id,
    actor_user_id,
    action,
    from_status,
    to_status,
    metadata,
    created_by,
    updated_by
  )
  VALUES (
    p_tenant_id,
    p_entry_id,
    p_actor_user_id,
    'reply_whatsapp',
    v_entry.status,
    'in_progress',
    jsonb_build_object('thread_id', v_thread.id, 'thread_message_id', v_message_id, 'whatsapp_message_id', p_whatsapp_message_id),
    p_actor_user_id,
    p_actor_user_id
  );

  RETURN jsonb_build_object('thread_id', v_thread.id, 'thread_message_id', v_message_id);
END;
$$;

CREATE OR REPLACE FUNCTION app.prepare_whatsapp_message_for_send(
  p_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_config app.whatsapp_platform_config%ROWTYPE;
  v_queue_row app.whatsapp_send_queue%ROWTYPE;
  v_message app.whatsapp_messages%ROWTYPE;
  v_cap integer;
  v_sent_today integer;
  v_marketing_today integer;
  v_template_status text;
  v_failure_reason text;
BEGIN
  IF p_message_id IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'failed', true, 'failure_reason', 'message_id required');
  END IF;

  SELECT * INTO v_queue_row
  FROM app.whatsapp_send_queue
  WHERE whatsapp_message_id = p_message_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE app.whatsapp_messages
    SET status = 'failed', failure_reason = 'whatsapp_send_queue row not found', updated_at = now()
    WHERE id = p_message_id AND status NOT IN ('sent', 'delivered', 'read');
    RETURN jsonb_build_object('ready', false, 'failed', true, 'failure_reason', 'whatsapp_send_queue row not found');
  END IF;

  IF v_queue_row.status = 'sent' THEN
    RETURN jsonb_build_object('ready', false, 'skipped', 'already_sent', 'message_id', p_message_id, 'queue_id', v_queue_row.id);
  END IF;
  IF v_queue_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ready', false, 'skipped', 'not_pending', 'message_id', p_message_id, 'queue_id', v_queue_row.id, 'queue_status', v_queue_row.status);
  END IF;
  IF v_queue_row.scheduled_send_at > now() THEN
    RETURN jsonb_build_object('ready', false, 'skipped', 'scheduled_for_future', 'message_id', p_message_id, 'queue_id', v_queue_row.id, 'scheduled_send_at', v_queue_row.scheduled_send_at);
  END IF;

  SELECT * INTO v_message
  FROM app.whatsapp_messages
  WHERE id = v_queue_row.whatsapp_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE app.whatsapp_send_queue
    SET status = 'failed', failure_reason = 'whatsapp_message row not found', attempt_count = COALESCE(attempt_count, 0) + 1, updated_at = now()
    WHERE id = v_queue_row.id;
    RETURN jsonb_build_object('ready', false, 'failed', true, 'message_id', p_message_id, 'queue_id', v_queue_row.id, 'failure_reason', 'whatsapp_message row not found');
  END IF;

  IF v_message.status IN ('sent', 'delivered', 'read') THEN
    UPDATE app.whatsapp_send_queue SET status = 'sent', updated_at = now() WHERE id = v_queue_row.id;
    RETURN jsonb_build_object('ready', false, 'skipped', 'already_sent', 'message_id', p_message_id, 'queue_id', v_queue_row.id);
  END IF;

  SELECT * INTO v_config FROM app.whatsapp_platform_config WHERE id = 1;

  IF v_queue_row.priority > 1
     AND (COALESCE(v_config.broadcast_sending_paused, false)
          OR COALESCE(v_config.quality_rating_state, 'green') = 'red')
  THEN
    RETURN jsonb_build_object('ready', false, 'skipped', 'broadcast_paused', 'message_id', p_message_id, 'queue_id', v_queue_row.id);
  END IF;

  IF v_message.whatsapp_template_id IS NOT NULL THEN
    SELECT approval_status INTO v_template_status
    FROM app.whatsapp_templates
    WHERE id = v_message.whatsapp_template_id;

    IF v_template_status IS DISTINCT FROM 'approved' THEN
      v_failure_reason := format('template not approved (status=%s)', COALESCE(v_template_status, 'unknown'));
      UPDATE app.whatsapp_send_queue
      SET status = 'failed', failure_reason = v_failure_reason, attempt_count = COALESCE(attempt_count, 0) + 1, updated_at = now()
      WHERE id = v_queue_row.id;
      UPDATE app.whatsapp_messages
      SET status = 'failed', failure_reason = v_failure_reason, updated_at = now()
      WHERE id = v_message.id;
      RETURN jsonb_build_object('ready', false, 'failed', true, 'message_id', p_message_id, 'queue_id', v_queue_row.id, 'failure_reason', v_failure_reason);
    END IF;
  END IF;

  IF v_queue_row.priority > 1 THEN
    SELECT daily_broadcast_cap INTO v_cap
    FROM app.tenant_broadcast_limits
    WHERE tenant_id = v_queue_row.tenant_id;

    v_cap := COALESCE(v_cap, 100);
    SELECT count(*) INTO v_sent_today
    FROM app.whatsapp_messages m
    JOIN app.whatsapp_send_queue q ON q.whatsapp_message_id = m.id
    WHERE m.tenant_id = v_queue_row.tenant_id
      AND q.priority > 1
      AND m.status = 'sent'
      AND m.sent_at >= date_trunc('day', now());

    IF v_sent_today >= v_cap THEN
      UPDATE app.whatsapp_send_queue
      SET status = 'pending',
          scheduled_send_at = (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 day 9 hours') AT TIME ZONE 'Asia/Kolkata',
          failure_reason = format('deferred: tenant daily broadcast cap reached (%s/%s), retry after reschedule', v_sent_today, v_cap),
          updated_at = now()
      WHERE id = v_queue_row.id;
      RETURN jsonb_build_object('ready', false, 'skipped', 'daily_cap_deferred', 'message_id', p_message_id, 'queue_id', v_queue_row.id);
    END IF;
  END IF;

  IF v_message.meta_category = 'marketing' AND v_message.buyer_id IS NOT NULL THEN
    SELECT count(*) INTO v_marketing_today
    FROM app.whatsapp_messages m
    WHERE m.buyer_id = v_message.buyer_id
      AND m.meta_category = 'marketing'
      AND m.status IN ('sent', 'delivered', 'read')
      AND m.sent_at >= now() - interval '24 hours';

    IF v_marketing_today >= 1 THEN
      v_failure_reason := 'recipient already received a marketing message in the last 24h';
      UPDATE app.whatsapp_send_queue
      SET status = 'failed', failure_reason = v_failure_reason, attempt_count = COALESCE(attempt_count, 0) + 1, updated_at = now()
      WHERE id = v_queue_row.id;
      UPDATE app.whatsapp_messages
      SET status = 'failed', failure_reason = v_failure_reason, updated_at = now()
      WHERE id = v_message.id;
      RETURN jsonb_build_object('ready', false, 'failed', true, 'message_id', p_message_id, 'queue_id', v_queue_row.id, 'failure_reason', v_failure_reason);
    END IF;
  END IF;

  UPDATE app.whatsapp_send_queue
  SET status = 'processing',
      attempt_count = COALESCE(attempt_count, 0) + 1,
      failure_reason = NULL,
      updated_at = now()
  WHERE id = v_queue_row.id;

  IF v_message.meta_category <> 'service' THEN
    BEGIN
      PERFORM app.debit_whatsapp_credits(v_message.id);
    EXCEPTION
      WHEN OTHERS THEN
        v_failure_reason := format('credit debit failed: %s', SQLERRM);
        UPDATE app.whatsapp_send_queue
        SET status = 'failed', failure_reason = v_failure_reason, updated_at = now()
        WHERE id = v_queue_row.id;
        UPDATE app.whatsapp_messages
        SET status = 'failed', failure_reason = v_failure_reason, updated_at = now()
        WHERE id = v_message.id;
        RETURN jsonb_build_object('ready', false, 'failed', true, 'message_id', p_message_id, 'queue_id', v_queue_row.id, 'failure_reason', v_failure_reason);
    END;
  END IF;

  RETURN jsonb_build_object(
    'ready', true,
    'message_id', v_message.id,
    'queue_id', v_queue_row.id,
    'tenant_id', v_message.tenant_id,
    'recipient_phone', v_message.recipient_phone,
    'send_payload', v_message.send_payload
  );
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
  p_cursor_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
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
  customer_entry_count bigint,
  external_sync_error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH actor AS (
    SELECT app.entry_actor_is_seller_admin(p_tenant_id, p_actor_user_id) AS is_admin
  ),
  scoped AS (
    SELECT e.*, b.business_name, b.phone
    FROM app.entries e
    LEFT JOIN app.buyers b ON b.id = e.buyer_id AND b.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND (
        e.entry_type NOT IN ('business_approval', 'new_user_login')
        OR (SELECT is_admin FROM actor)
      )
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
      WHEN 'whatsapp_buyer_message' THEN COALESCE(NULLIF(c.metadata->>'last_inbound_text', ''), 'WhatsApp buyer message')
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
    c.customer_entry_count,
    c.external_sync_error
  FROM counted c
  ORDER BY c.priority_at DESC, c.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION app.process_whatsapp_inbound_message(text, text, text, text, text, text, timestamptz, jsonb, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.process_whatsapp_inbound_message(text, text, text, text, text, text, timestamptz, jsonb, text, uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION app.record_whatsapp_thread_outbound_reply(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.record_whatsapp_thread_outbound_reply(uuid, uuid, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION app.prepare_whatsapp_message_for_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prepare_whatsapp_message_for_send(uuid) TO service_role;
REVOKE ALL ON FUNCTION app.list_entries(uuid, uuid[], text, text[], text, integer, timestamptz, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.list_entries(uuid, uuid[], text, text[], text, integer, timestamptz, uuid, uuid) TO service_role;
