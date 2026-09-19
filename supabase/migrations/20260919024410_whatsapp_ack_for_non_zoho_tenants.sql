-- Buyer-app estimate/order WhatsApp acknowledgements for tenants WITHOUT an
-- active Zoho integration.
--
-- Before: app.notify_zoho_push() always called push-{order,estimate}-to-zoho,
-- and those edge functions only sent the WhatsApp acknowledgement after the
-- Zoho push (or on its failure). Non-Zoho tenants returned 'no_integration'
-- and never got a message; Zoho tenants got nothing either whenever the
-- x-push-secret header was rejected (401).
--
-- After: the trigger branches in SQL.
--   * tenant has an active Zoho integration -> unchanged: POST to the push
--     edge function (secret read from Vault via get_integrations_dispatch_secret).
--   * otherwise -> app.enqueue_transactional_ack() builds the same buyer/seller
--     payloads as supabase/functions/_shared/transactional-whatsapp.ts, enqueues
--     them through app.enqueue_whatsapp_message() and asks
--     whatsapp-dispatch-worker (no secret required) to send them.
--
-- The ack path can never block or fail the order/estimate insert.

CREATE OR REPLACE FUNCTION app.tenant_has_active_zoho(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
  -- Mirrors lookupTenantZohoIntegration(): ZOHO_INTEGRATION_TYPE_IDS and
  -- OUTBOUND_PUSH_TENANT_INTEGRATION_STATUSES in src/lib/integrations/contracts.ts.
  SELECT EXISTS (
    SELECT 1
    FROM app.tenant_integrations ti
    WHERE ti.tenant_id = p_tenant_id
      AND ti.integration_type_id IN ('zoho_books', 'zoho_inventory')
      AND ti.status IN ('connected', 'syncing', 'sync_failed')
      AND ti.deleted_at IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION app.normalize_indian_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN d LIKE '91%' AND length(d) > 10 THEN right(d, 10)
    WHEN d LIKE '0%' AND length(d) > 10 THEN right(d, 10)
    ELSE d
  END
  FROM (SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') AS d) s;
$function$;

CREATE OR REPLACE FUNCTION app.enqueue_transactional_ack(
  p_kind text,            -- 'order' | 'estimate'
  p_entity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_is_order boolean := (p_kind = 'order');
  v_record record;
  v_tenant record;
  v_buyer record;
  v_location record;
  v_warehouse record;
  v_settings jsonb;
  v_notif jsonb;
  v_business jsonb;
  v_buyer_app jsonb;
  v_seller_name text;
  v_tenant_seller_phone text;
  v_seller_phone text;
  v_buyer_phone text;
  v_seller_location text;
  v_buyer_facing_seller text;
  v_buyer_name text;
  v_number_text text;
  v_item_count integer;
  v_location_count integer;
  v_total integer;
  v_eta text;
  v_trigger_source text := CASE WHEN v_is_order THEN 'order_placed' ELSE 'enquiry_received' END;
  v_entity_type text := CASE WHEN v_is_order THEN 'orders' ELSE 'estimates' END;
  v_buyer_payload jsonb;
  v_seller_payload jsonb;
  v_buyer_res jsonb;
  v_seller_res jsonb;
  v_message_ids uuid[] := ARRAY[]::uuid[];
  v_acked boolean := false;
BEGIN
  IF p_kind NOT IN ('order', 'estimate') THEN
    RAISE EXCEPTION 'unknown kind %', p_kind USING ERRCODE = '22023';
  END IF;

  IF v_is_order THEN
    SELECT o.id, o.tenant_id, o.buyer_id, o.location_id, o.total_amount, o.source,
           o.sent_at, o.status, o.order_number AS doc_number
    INTO v_record
    FROM app.orders o
    WHERE o.id = p_entity_id AND o.deleted_at IS NULL;
  ELSE
    SELECT e.id, e.tenant_id, e.buyer_id, e.location_id, e.total_amount, e.source,
           e.sent_at, e.status, e.estimate_number AS doc_number
    INTO v_record
    FROM app.estimates e
    WHERE e.id = p_entity_id AND e.deleted_at IS NULL;
  END IF;

  IF NOT FOUND THEN RETURN jsonb_build_object('skipped', 'not_found'); END IF;
  IF v_record.source IS DISTINCT FROM 'buyer_app' THEN RETURN jsonb_build_object('skipped', 'not_buyer_app'); END IF;
  IF v_record.sent_at IS NOT NULL THEN RETURN jsonb_build_object('skipped', 'already_sent'); END IF;
  IF v_record.location_id IS NULL THEN RETURN jsonb_build_object('skipped', 'no_location'); END IF;
  IF v_is_order AND v_record.status = 'draft' THEN RETURN jsonb_build_object('skipped', 'draft'); END IF;

  SELECT business_name, settings INTO v_tenant FROM app.tenants WHERE id = v_record.tenant_id;
  SELECT phone, contact_name, business_name INTO v_buyer FROM app.buyers WHERE id = v_record.buyer_id;
  SELECT name, phone_number INTO v_location FROM app.locations WHERE id = v_record.location_id;
  IF v_tenant IS NULL OR v_buyer IS NULL OR v_location IS NULL THEN
    RETURN jsonb_build_object('skipped', 'missing_context');
  END IF;

  SELECT name, phone_number INTO v_warehouse
  FROM app.warehouses
  WHERE location_id = v_record.location_id AND deleted_at IS NULL
  LIMIT 1;

  v_settings := COALESCE(v_tenant.settings, '{}'::jsonb);
  v_notif := COALESCE(v_settings #> '{notifications,whatsapp}', '{}'::jsonb);
  v_business := COALESCE(v_settings -> 'business', '{}'::jsonb);
  v_buyer_app := COALESCE(v_settings -> 'buyer_app', '{}'::jsonb);

  -- Seller toggle: notifications.whatsapp.{order_placed|enquiry_received} = false disables.
  IF (v_notif -> v_trigger_source) = 'false'::jsonb THEN
    RETURN jsonb_build_object('skipped', 'disabled_by_tenant');
  END IF;

  v_eta := CASE
    WHEN jsonb_typeof(v_notif -> 'response_eta_hours') = 'number' THEN v_notif ->> 'response_eta_hours'
    ELSE '24'
  END;

  v_seller_name := COALESCE(
    NULLIF(btrim(v_buyer_app ->> 'whatsapp_display_name'), ''),
    NULLIF(btrim(v_business ->> 'company_name'), ''),
    NULLIF(btrim(v_tenant.business_name), ''),
    'Your business'
  );
  v_tenant_seller_phone := COALESCE(
    NULLIF(btrim(v_buyer_app ->> 'whatsapp_number'), ''),
    NULLIF(btrim(v_business ->> 'phone'), ''),
    ''
  );
  v_seller_phone := app.normalize_indian_phone(COALESCE(
    NULLIF(v_warehouse.phone_number, ''),
    NULLIF(v_location.phone_number, ''),
    NULLIF(btrim(v_business ->> 'phone'), ''),
    v_tenant_seller_phone
  ));
  v_buyer_phone := app.normalize_indian_phone(v_buyer.phone);

  SELECT count(*) INTO v_location_count
  FROM app.locations WHERE tenant_id = v_record.tenant_id AND deleted_at IS NULL;

  v_seller_location := COALESCE(NULLIF(v_warehouse.name, ''), NULLIF(v_location.name, ''), v_seller_name);
  v_buyer_facing_seller := CASE
    WHEN v_location_count > 1 AND btrim(COALESCE(v_seller_location, '')) <> ''
      THEN v_seller_name || ' (' || btrim(v_seller_location) || ')'
    ELSE v_seller_name
  END;
  v_buyer_name := COALESCE(v_buyer.contact_name, v_buyer.business_name, 'there');

  IF v_is_order THEN
    SELECT count(*) INTO v_item_count FROM app.order_items WHERE order_id = p_entity_id AND deleted_at IS NULL;
  ELSE
    SELECT count(*) INTO v_item_count FROM app.estimate_items WHERE estimate_id = p_entity_id AND deleted_at IS NULL;
  END IF;

  v_total := round(COALESCE(v_record.total_amount, 0))::integer;
  v_number_text := COALESCE(NULLIF(btrim(v_record.doc_number), ''), 'will be created soon');

  IF v_is_order THEN
    v_seller_payload := jsonb_build_object(
      'meta_template_name', 'order_received_seller',
      'locale', 'en_IN',
      'body_params', jsonb_build_array(
        jsonb_build_object('text', v_seller_location, 'parameter_name', 'seller_location'),
        jsonb_build_object('text', v_buyer_name, 'parameter_name', 'buyer_name'),
        jsonb_build_object('text', COALESCE(v_buyer.phone, ''), 'parameter_name', 'buyer_phone_number'),
        jsonb_build_object('text', v_number_text, 'parameter_name', 'order_number'),
        jsonb_build_object('text', v_total::text, 'parameter_name', 'total_amount'),
        jsonb_build_object('text', v_item_count::text, 'parameter_name', 'item_count'),
        jsonb_build_object('text', v_eta, 'parameter_name', 'eta')
      ),
      'button_params', jsonb_build_array(jsonb_build_object('type', 'url', 'index', '0', 'text', p_entity_id::text))
    );
    v_buyer_payload := jsonb_build_object(
      'meta_template_name', 'order_received_buyer',
      'locale', 'en_IN',
      'body_params', jsonb_build_array(
        jsonb_build_object('text', v_buyer_name, 'parameter_name', 'buyer_name'),
        jsonb_build_object('text', v_item_count::text, 'parameter_name', 'item_count'),
        jsonb_build_object('text', v_number_text, 'parameter_name', 'order_number'),
        jsonb_build_object('text', v_total::text, 'parameter_name', 'total_amount'),
        jsonb_build_object('text', v_buyer_facing_seller, 'parameter_name', 'seller_name'),
        jsonb_build_object('text', v_eta, 'parameter_name', 'eta')
      ),
      'button_params', jsonb_build_array(jsonb_build_object('type', 'url', 'index', '0', 'text', p_entity_id::text))
    );
  ELSE
    v_seller_payload := jsonb_build_object(
      'meta_template_name', 'request_received_seller',
      'locale', 'en',
      'body_params', jsonb_build_array(
        jsonb_build_object('text', v_seller_location, 'parameter_name', 'seller_location'),
        jsonb_build_object('text', v_buyer_name, 'parameter_name', 'buyer_name'),
        jsonb_build_object('text', COALESCE(v_buyer.phone, ''), 'parameter_name', 'buyer_phone_number'),
        jsonb_build_object('text', v_number_text, 'parameter_name', 'request_number'),
        jsonb_build_object('text', v_total::text, 'parameter_name', 'total_amount'),
        jsonb_build_object('text', v_item_count::text, 'parameter_name', 'item_count'),
        jsonb_build_object('text', v_eta, 'parameter_name', 'eta')
      ),
      'button_params', jsonb_build_array(jsonb_build_object('type', 'url', 'index', '0', 'text', p_entity_id::text))
    );
    v_buyer_payload := jsonb_build_object(
      'meta_template_name', 'request_received_buyer',
      'locale', 'en',
      'body_params', jsonb_build_array(
        jsonb_build_object('text', v_buyer_name, 'parameter_name', 'buyer_name'),
        jsonb_build_object('text', v_item_count::text, 'parameter_name', 'item_count'),
        jsonb_build_object('text', v_number_text, 'parameter_name', 'estimate_number'),
        jsonb_build_object('text', v_total::text, 'parameter_name', 'total_amount'),
        jsonb_build_object('text', v_buyer_facing_seller, 'parameter_name', 'seller_name'),
        jsonb_build_object('text', v_eta, 'parameter_name', 'eta')
      ),
      'button_params', jsonb_build_array(jsonb_build_object('type', 'url', 'index', '0', 'text', p_entity_id::text))
    );
  END IF;

  IF length(v_buyer_phone) >= 10 THEN
    v_buyer_res := app.enqueue_whatsapp_message(
      p_tenant_id := v_record.tenant_id, p_buyer_id := v_record.buyer_id,
      p_recipient_phone := '91' || v_buyer_phone, p_meta_category := 'utility',
      p_trigger_source := v_trigger_source, p_send_payload := v_buyer_payload,
      p_related_entity_type := v_entity_type, p_related_entity_id := p_entity_id
    );
    IF (v_buyer_res ->> 'enqueued')::boolean THEN
      v_message_ids := v_message_ids || (v_buyer_res ->> 'message_id')::uuid;
    END IF;
    v_acked := v_acked OR (v_buyer_res ->> 'enqueued')::boolean OR (v_buyer_res ->> 'skipped') = 'duplicate';
  END IF;

  IF length(v_seller_phone) >= 10 THEN
    v_seller_res := app.enqueue_whatsapp_message(
      p_tenant_id := v_record.tenant_id, p_buyer_id := v_record.buyer_id,
      p_recipient_phone := '91' || v_seller_phone, p_meta_category := 'utility',
      p_trigger_source := v_trigger_source, p_send_payload := v_seller_payload,
      p_related_entity_type := v_entity_type, p_related_entity_id := p_entity_id
    );
    IF (v_seller_res ->> 'enqueued')::boolean THEN
      v_message_ids := v_message_ids || (v_seller_res ->> 'message_id')::uuid;
    END IF;
    v_acked := v_acked OR (v_seller_res ->> 'enqueued')::boolean OR (v_seller_res ->> 'skipped') = 'duplicate';
  END IF;

  IF array_length(v_message_ids, 1) > 0 THEN
    -- pg_net queues the request and sends it after this transaction commits,
    -- so the message/queue rows are visible to the worker. whatsapp-dispatch-worker
    -- is verify_jwt=false and takes only message ids: no shared secret involved.
    PERFORM net.http_post(
      url := app.get_functions_base_url() || '/whatsapp-dispatch-worker',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('message_ids', to_jsonb(v_message_ids)),
      timeout_milliseconds := 5000
    );
  END IF;

  IF v_acked THEN
    IF v_is_order THEN
      UPDATE app.orders SET sent_at = now(), sent_channel = 'whatsapp'
      WHERE id = p_entity_id AND sent_at IS NULL;
    ELSE
      UPDATE app.estimates SET sent_at = now(), sent_channel = 'whatsapp'
      WHERE id = p_entity_id AND sent_at IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object('enqueued', COALESCE(array_length(v_message_ids, 1), 0), 'acked', v_acked);
END;
$function$;

REVOKE ALL ON FUNCTION app.enqueue_transactional_ack(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enqueue_transactional_ack(text, uuid) TO service_role;
REVOKE ALL ON FUNCTION app.tenant_has_active_zoho(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tenant_has_active_zoho(uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.notify_zoho_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE
  v_secret text;
  v_path   text := CASE TG_TABLE_NAME
    WHEN 'estimates' THEN 'push-estimate-to-zoho'
    WHEN 'orders' THEN 'push-order-to-zoho'
  END;
BEGIN
  -- Non-Zoho tenant: skip the Zoho flow entirely and acknowledge over WhatsApp.
  IF NOT app.tenant_has_active_zoho(NEW.tenant_id) THEN
    BEGIN
      PERFORM app.enqueue_transactional_ack(
        CASE TG_TABLE_NAME WHEN 'orders' THEN 'order' ELSE 'estimate' END,
        NEW.id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_zoho_push: whatsapp ack failed for % %: %', TG_TABLE_NAME, NEW.id, SQLERRM;
    END;
    RETURN NEW;
  END IF;

  v_secret := app.get_integrations_dispatch_secret();
  IF v_secret = '' THEN
    RAISE WARNING 'notify_zoho_push: missing app.integrations_dispatch_secret (vault + GUC empty)';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := app.get_functions_base_url() || '/' || v_path,
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'x-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.notify_zoho_push() FROM PUBLIC;
GRANT ALL ON FUNCTION app.notify_zoho_push() TO service_role;
