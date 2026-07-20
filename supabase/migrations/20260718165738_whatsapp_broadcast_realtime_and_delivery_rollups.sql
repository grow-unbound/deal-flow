ALTER TABLE app.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS sent_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS delivered_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS failed_count integer DEFAULT 0 NOT NULL;

CREATE OR REPLACE FUNCTION app.refresh_whatsapp_broadcast_rollup(p_broadcast_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_total integer := 0;
  v_sent integer := 0;
  v_delivered integer := 0;
  v_failed integer := 0;
  v_existing_status text;
  v_next_status text;
BEGIN
  IF p_broadcast_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status
  INTO v_existing_status
  FROM app.whatsapp_broadcasts
  WHERE id = p_broadcast_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read'))::integer,
    COUNT(*) FILTER (WHERE status IN ('delivered', 'read'))::integer,
    COUNT(*) FILTER (WHERE status IN ('failed', 'blocked_by_recipient', 'opted_out'))::integer
  INTO v_total, v_sent, v_delivered, v_failed
  FROM app.whatsapp_messages
  WHERE whatsapp_broadcast_id = p_broadcast_id
    AND deleted_at IS NULL;

  v_next_status := v_existing_status;

  IF v_total > 0 THEN
    IF v_delivered + v_failed = v_total THEN
      v_next_status := CASE WHEN v_failed > 0 THEN 'partially_failed' ELSE 'completed' END;
    ELSIF v_sent > 0 OR v_failed > 0 THEN
      v_next_status := 'sending';
    ELSIF v_existing_status NOT IN ('draft', 'pending_review', 'scheduled', 'cancelled') THEN
      v_next_status := 'sending';
    END IF;
  END IF;

  UPDATE app.whatsapp_broadcasts
  SET actual_recipient_count = CASE
        WHEN actual_recipient_count IS NULL OR actual_recipient_count < v_total THEN v_total
        ELSE actual_recipient_count
      END,
      sent_count = v_sent,
      delivered_count = v_delivered,
      failed_count = v_failed,
      status = v_next_status,
      updated_at = now()
  WHERE id = p_broadcast_id;
END;
$$;

ALTER FUNCTION app.refresh_whatsapp_broadcast_rollup(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.refresh_whatsapp_broadcast_rollup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_whatsapp_broadcast_rollup(uuid) TO service_role;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'app'
      AND tablename = 'whatsapp_broadcasts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE app.whatsapp_broadcasts';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'app'
      AND tablename = 'whatsapp_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE app.whatsapp_messages';
  END IF;
END;
$$;

DO $$
DECLARE
  v_broadcast_id uuid;
BEGIN
  FOR v_broadcast_id IN
    SELECT id
    FROM app.whatsapp_broadcasts
    WHERE deleted_at IS NULL
  LOOP
    PERFORM app.refresh_whatsapp_broadcast_rollup(v_broadcast_id);
  END LOOP;
END;
$$;
