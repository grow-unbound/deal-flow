-- Fix: app.whatsapp_messages.send_payload retained the raw OTP text indefinitely
-- after send for meta_category = 'authentication' messages. RLS on this table
-- already restricts SELECT to a seller of the same tenant (whatsapp_messages_select,
-- prod_bootstrap.sql), so this isn't the wide-open cross-tenant hole otp_sessions
-- had — but it still means a seller_admin/seller_assistant can read the raw OTP
-- codes used to authenticate their own buyers, well past the 10-minute validity
-- window. The dispatch worker only needs the real payload at send time, so redact
-- it in the same transaction that marks the message sent — no separate call, no
-- added round trip beyond what complete_whatsapp_message_send already does.

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
  v_broadcast_id uuid;
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
        updated_at = now(),
        send_payload = CASE
          WHEN meta_category = 'authentication' THEN '{"redacted": true}'::jsonb
          ELSE send_payload
        END
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

    -- Credits were debited synchronously before the Meta call in
    -- prepare_whatsapp_message_for_send; a send that never reached Meta
    -- (or was rejected outright) must refund. Never let a refund bug block
    -- the status update above.
    BEGIN
      PERFORM app.refund_whatsapp_credits(p_message_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'refund_whatsapp_credits failed for message %: %', p_message_id, SQLERRM;
    END;
  END IF;

  SELECT whatsapp_broadcast_id
  INTO v_broadcast_id
  FROM app.whatsapp_messages
  WHERE id = p_message_id;

  PERFORM app.refresh_whatsapp_broadcast_rollup(v_broadcast_id);
END;
$$;

ALTER FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.complete_whatsapp_message_send(uuid, boolean, text, text) TO service_role;
