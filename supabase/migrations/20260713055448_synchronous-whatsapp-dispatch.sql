-- Keep WhatsApp dispatch explicit and synchronous:
-- enqueue RPC creates durable rows, callers invoke the Edge sender with the
-- returned message ids, and the DB only performs row locking/guardrails/debit.
-- No pg_net dispatch trigger, no dispatch cron, no response polling.

DROP TRIGGER IF EXISTS whatsapp_send_queue_dispatch_trigger ON app.whatsapp_send_queue;
DROP FUNCTION IF EXISTS app.notify_whatsapp_dispatch();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('whatsapp-dispatch-backstop');
    EXCEPTION
      WHEN OTHERS THEN
        -- The job may not exist in all environments; do not block deploy.
        NULL;
    END;
  END IF;
END;
$$;

UPDATE app.whatsapp_templates
SET variables = '[
    {"key":"buyer_name","description":"Buyer contact or business name"},
    {"key":"seller_name","description":"Seller business name"},
    {"key":"campaign_title","description":"Name of the campaign"},
    {"key":"buyer_note","description":"Seller''s note to the buyer for the campaign"},
    {"key":"seller_phone_number","description":"Contact number of the seller"}
  ]'::jsonb,
    updated_at = now()
WHERE meta_template_name = 'campaign_published_buyer'
  AND tenant_id IS NULL
  AND deleted_at IS NULL
  AND NOT (variables @> '[{"key":"seller_name"}]'::jsonb);

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
    RETURN jsonb_build_object(
      'ready', false,
      'failed', true,
      'failure_reason', 'message_id required'
    );
  END IF;

  SELECT *
  INTO v_queue_row
  FROM app.whatsapp_send_queue
  WHERE whatsapp_message_id = p_message_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE app.whatsapp_messages
    SET status = 'failed',
        failure_reason = 'whatsapp_send_queue row not found',
        updated_at = now()
    WHERE id = p_message_id
      AND status NOT IN ('sent', 'delivered', 'read');

    RETURN jsonb_build_object(
      'ready', false,
      'failed', true,
      'failure_reason', 'whatsapp_send_queue row not found'
    );
  END IF;

  IF v_queue_row.status = 'sent' THEN
    RETURN jsonb_build_object(
      'ready', false,
      'skipped', 'already_sent',
      'message_id', p_message_id,
      'queue_id', v_queue_row.id
    );
  END IF;

  IF v_queue_row.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ready', false,
      'skipped', 'not_pending',
      'message_id', p_message_id,
      'queue_id', v_queue_row.id,
      'queue_status', v_queue_row.status
    );
  END IF;

  IF v_queue_row.scheduled_send_at > now() THEN
    RETURN jsonb_build_object(
      'ready', false,
      'skipped', 'scheduled_for_future',
      'message_id', p_message_id,
      'queue_id', v_queue_row.id,
      'scheduled_send_at', v_queue_row.scheduled_send_at
    );
  END IF;

  SELECT *
  INTO v_message
  FROM app.whatsapp_messages
  WHERE id = v_queue_row.whatsapp_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE app.whatsapp_send_queue
    SET status = 'failed',
        failure_reason = 'whatsapp_message row not found',
        attempt_count = COALESCE(attempt_count, 0) + 1,
        updated_at = now()
    WHERE id = v_queue_row.id;

    RETURN jsonb_build_object(
      'ready', false,
      'failed', true,
      'message_id', p_message_id,
      'queue_id', v_queue_row.id,
      'failure_reason', 'whatsapp_message row not found'
    );
  END IF;

  IF v_message.status IN ('sent', 'delivered', 'read') THEN
    UPDATE app.whatsapp_send_queue
    SET status = 'sent',
        updated_at = now()
    WHERE id = v_queue_row.id;

    RETURN jsonb_build_object(
      'ready', false,
      'skipped', 'already_sent',
      'message_id', p_message_id,
      'queue_id', v_queue_row.id
    );
  END IF;

  SELECT *
  INTO v_config
  FROM app.whatsapp_platform_config
  WHERE id = 1;

  IF v_queue_row.priority > 1
     AND (COALESCE(v_config.broadcast_sending_paused, false)
          OR COALESCE(v_config.quality_rating_state, 'green') = 'red')
  THEN
    RETURN jsonb_build_object(
      'ready', false,
      'skipped', 'broadcast_paused',
      'message_id', p_message_id,
      'queue_id', v_queue_row.id
    );
  END IF;

  IF v_message.whatsapp_template_id IS NOT NULL THEN
    SELECT approval_status
    INTO v_template_status
    FROM app.whatsapp_templates
    WHERE id = v_message.whatsapp_template_id;

    IF v_template_status IS DISTINCT FROM 'approved' THEN
      v_failure_reason := format(
        'template not approved (status=%s)',
        COALESCE(v_template_status, 'unknown')
      );

      UPDATE app.whatsapp_send_queue
      SET status = 'failed',
          failure_reason = v_failure_reason,
          attempt_count = COALESCE(attempt_count, 0) + 1,
          updated_at = now()
      WHERE id = v_queue_row.id;

      UPDATE app.whatsapp_messages
      SET status = 'failed',
          failure_reason = v_failure_reason,
          updated_at = now()
      WHERE id = v_message.id;

      RETURN jsonb_build_object(
        'ready', false,
        'failed', true,
        'message_id', p_message_id,
        'queue_id', v_queue_row.id,
        'failure_reason', v_failure_reason
      );
    END IF;
  END IF;

  IF v_queue_row.priority > 1 THEN
    SELECT daily_broadcast_cap
    INTO v_cap
    FROM app.tenant_broadcast_limits
    WHERE tenant_id = v_queue_row.tenant_id;

    v_cap := COALESCE(v_cap, 100);

    SELECT count(*)
    INTO v_sent_today
    FROM app.whatsapp_messages m
    JOIN app.whatsapp_send_queue q ON q.whatsapp_message_id = m.id
    WHERE m.tenant_id = v_queue_row.tenant_id
      AND q.priority > 1
      AND m.status = 'sent'
      AND m.sent_at >= date_trunc('day', now());

    IF v_sent_today >= v_cap THEN
      v_failure_reason := format(
        'tenant daily broadcast cap reached (%s/%s)',
        v_sent_today,
        v_cap
      );

      UPDATE app.whatsapp_send_queue
      SET status = 'failed',
          failure_reason = v_failure_reason,
          attempt_count = COALESCE(attempt_count, 0) + 1,
          updated_at = now()
      WHERE id = v_queue_row.id;

      UPDATE app.whatsapp_messages
      SET status = 'failed',
          failure_reason = v_failure_reason,
          updated_at = now()
      WHERE id = v_message.id;

      RETURN jsonb_build_object(
        'ready', false,
        'failed', true,
        'message_id', p_message_id,
        'queue_id', v_queue_row.id,
        'failure_reason', v_failure_reason
      );
    END IF;
  END IF;

  IF v_message.meta_category = 'marketing' AND v_message.buyer_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_marketing_today
    FROM app.whatsapp_messages m
    WHERE m.buyer_id = v_message.buyer_id
      AND m.meta_category = 'marketing'
      AND m.status IN ('sent', 'delivered', 'read')
      AND m.sent_at >= now() - interval '24 hours';

    IF v_marketing_today >= 1 THEN
      v_failure_reason := 'recipient already received a marketing message in the last 24h';

      UPDATE app.whatsapp_send_queue
      SET status = 'failed',
          failure_reason = v_failure_reason,
          attempt_count = COALESCE(attempt_count, 0) + 1,
          updated_at = now()
      WHERE id = v_queue_row.id;

      UPDATE app.whatsapp_messages
      SET status = 'failed',
          failure_reason = v_failure_reason,
          updated_at = now()
      WHERE id = v_message.id;

      RETURN jsonb_build_object(
        'ready', false,
        'failed', true,
        'message_id', p_message_id,
        'queue_id', v_queue_row.id,
        'failure_reason', v_failure_reason
      );
    END IF;
  END IF;

  UPDATE app.whatsapp_send_queue
  SET status = 'processing',
      attempt_count = COALESCE(attempt_count, 0) + 1,
      failure_reason = NULL,
      updated_at = now()
  WHERE id = v_queue_row.id;

  BEGIN
    PERFORM app.debit_whatsapp_credits(v_message.id);
  EXCEPTION
    WHEN OTHERS THEN
      v_failure_reason := format('credit debit failed: %s', SQLERRM);

      UPDATE app.whatsapp_send_queue
      SET status = 'failed',
          failure_reason = v_failure_reason,
          updated_at = now()
      WHERE id = v_queue_row.id;

      UPDATE app.whatsapp_messages
      SET status = 'failed',
          failure_reason = v_failure_reason,
          updated_at = now()
      WHERE id = v_message.id;

      RETURN jsonb_build_object(
        'ready', false,
        'failed', true,
        'message_id', p_message_id,
        'queue_id', v_queue_row.id,
        'failure_reason', v_failure_reason
      );
  END;

  RETURN jsonb_build_object(
    'ready', true,
    'message_id', v_message.id,
    'queue_id', v_queue_row.id,
    'recipient_phone', v_message.recipient_phone,
    'send_payload', v_message.send_payload
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.complete_whatsapp_message_send(
  p_message_id uuid,
  p_success boolean,
  p_provider_message_id text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_queue_id uuid;
  v_reason text := NULLIF(p_failure_reason, '');
BEGIN
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'message_id required' USING ERRCODE = '22023';
  END IF;

  SELECT id
  INTO v_queue_id
  FROM app.whatsapp_send_queue
  WHERE whatsapp_message_id = p_message_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF p_success THEN
    UPDATE app.whatsapp_messages
    SET status = 'sent',
        provider_message_id = p_provider_message_id,
        failure_reason = NULL,
        sent_at = COALESCE(sent_at, now()),
        updated_at = now()
    WHERE id = p_message_id;

    IF v_queue_id IS NOT NULL THEN
      UPDATE app.whatsapp_send_queue
      SET status = 'sent',
          failure_reason = NULL,
          updated_at = now()
      WHERE id = v_queue_id;
    END IF;
  ELSE
    UPDATE app.whatsapp_messages
    SET status = 'failed',
        failure_reason = COALESCE(v_reason, 'WhatsApp send failed'),
        updated_at = now()
    WHERE id = p_message_id
      AND status NOT IN ('sent', 'delivered', 'read');

    IF v_queue_id IS NOT NULL THEN
      UPDATE app.whatsapp_send_queue
      SET status = 'failed',
          failure_reason = COALESCE(v_reason, 'WhatsApp send failed'),
          updated_at = now()
      WHERE id = v_queue_id
        AND status <> 'sent';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.prepare_whatsapp_message_for_send(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.prepare_whatsapp_message_for_send(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) TO service_role;
