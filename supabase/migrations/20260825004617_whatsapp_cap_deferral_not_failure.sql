-- app.prepare_whatsapp_message_for_send currently marks a message 'failed'
-- (terminal, never retried) the moment the tenant's daily broadcast cap is
-- hit. That conflates "hasn't had its turn yet" with a real delivery
-- failure, and gives a capped-out broadcast no way to finish across
-- multiple days without a seller manually re-launching it.
--
-- Fix: reschedule the queue row to the next day instead of failing it, and
-- leave app.whatsapp_messages untouched (stays 'queued'). Combined with the
-- sweep cron from 20260825004554_whatsapp_broadcast_queue_sweep.sql, a
-- capped-out broadcast now drains itself across days automatically.
--
-- This is a surgical change to one branch of the function introduced in
-- 20260713055448_synchronous-whatsapp-dispatch.sql — every other branch is
-- reproduced unchanged.

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
      -- Deferred, not failed: leave whatsapp_messages untouched ('queued')
      -- and push this queue row to ~9am IST the next day — computed via
      -- Asia/Kolkata wall-clock, not server time, since date_trunc('day',
      -- now()) + 9 hours would land at 9am UTC (~2:30pm IST), defeating the
      -- point of avoiding a midnight/off-hours burst for Indian buyers. The
      -- once-daily whatsapp-queue-sweep cron (03:35 UTC ≈ 9:05am IST, see
      -- 20260825004554_whatsapp_broadcast_queue_sweep.sql) picks this up —
      -- no seller action needed to finish a broadcast that spans multiple
      -- days under a conservative daily cap.
      UPDATE app.whatsapp_send_queue
      SET status = 'pending',
          scheduled_send_at = (
            date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
            + interval '1 day 9 hours'
          ) AT TIME ZONE 'Asia/Kolkata',
          failure_reason = format(
            'deferred: tenant daily broadcast cap reached (%s/%s), retry after reschedule',
            v_sent_today,
            v_cap
          ),
          updated_at = now()
      WHERE id = v_queue_row.id;

      RETURN jsonb_build_object(
        'ready', false,
        'skipped', 'daily_cap_deferred',
        'message_id', p_message_id,
        'queue_id', v_queue_row.id
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
