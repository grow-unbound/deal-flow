CREATE OR REPLACE FUNCTION app.enqueue_whatsapp_message(
  p_tenant_id uuid,
  p_buyer_id uuid DEFAULT NULL,
  p_recipient_phone text DEFAULT NULL,
  p_meta_category text DEFAULT NULL,
  p_trigger_source text DEFAULT NULL,
  p_send_payload jsonb DEFAULT '{}'::jsonb,
  p_whatsapp_broadcast_id uuid DEFAULT NULL,
  p_related_entity_type text DEFAULT NULL,
  p_related_entity_id uuid DEFAULT NULL,
  p_priority integer DEFAULT NULL,
  p_scheduled_send_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_template_id uuid;
  v_message_id uuid;
  v_existing_id uuid;
  v_priority integer;
BEGIN
  SELECT id
  INTO v_template_id
  FROM app.whatsapp_templates
  WHERE meta_template_name = p_send_payload->>'meta_template_name'
    AND approval_status = 'approved'
    AND tenant_id IS NULL
    AND deleted_at IS NULL
  LIMIT 1;

  v_priority := COALESCE(
    p_priority,
    CASE
      WHEN p_trigger_source IN ('otp_login', 'order_placed', 'enquiry_received', 'dispatch_notice') THEN 1
      ELSE 5
    END
  );

  BEGIN
    INSERT INTO app.whatsapp_messages (
      tenant_id,
      buyer_id,
      recipient_phone,
      whatsapp_template_id,
      whatsapp_broadcast_id,
      meta_category,
      trigger_source,
      status,
      send_payload,
      related_entity_type,
      related_entity_id
    )
    VALUES (
      p_tenant_id,
      p_buyer_id,
      p_recipient_phone,
      v_template_id,
      p_whatsapp_broadcast_id,
      p_meta_category,
      p_trigger_source,
      'queued',
      COALESCE(p_send_payload, '{}'::jsonb),
      p_related_entity_type,
      p_related_entity_id
    )
    RETURNING id INTO v_message_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_related_entity_id IS NULL THEN
        RAISE;
      END IF;

      SELECT id
      INTO v_existing_id
      FROM app.whatsapp_messages
      WHERE tenant_id = p_tenant_id
        AND trigger_source = p_trigger_source
        AND related_entity_id = p_related_entity_id
        AND recipient_phone = p_recipient_phone
        AND status <> 'failed'
      LIMIT 1;

      RETURN jsonb_build_object(
        'message_id', v_existing_id,
        'enqueued', false,
        'skipped', 'duplicate'
      );
  END;

  INSERT INTO app.whatsapp_send_queue (
    tenant_id,
    whatsapp_message_id,
    priority,
    scheduled_send_at
  )
  VALUES (
    p_tenant_id,
    v_message_id,
    v_priority,
    COALESCE(p_scheduled_send_at, now())
  );

  RETURN jsonb_build_object(
    'message_id', v_message_id,
    'enqueued', true
  );
END;
$$;

REVOKE ALL ON FUNCTION app.enqueue_whatsapp_message(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  uuid,
  integer,
  timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.enqueue_whatsapp_message(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  uuid,
  integer,
  timestamptz
) TO service_role;
