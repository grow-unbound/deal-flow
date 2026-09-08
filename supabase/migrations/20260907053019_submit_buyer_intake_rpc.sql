-- app.submit_buyer_intake: persists the self-registration intake form
-- (Yukti_Inbox_Feature-Spec_v1.md §7.1 #1/#2) for a pending
-- (buyer_app_enabled = false) app.buyers row, then re-syncs its inbox entry
-- so it's classified deterministically instead of by heuristic.
--
-- Authorization is enforced by the caller (the Next.js API route, which
-- only invokes this via the service-role client after checking the
-- session's own buyer_id claim against p_buyer_id) — same pattern as
-- app.apply_entry_action / app.list_entries in the entries migration.
-- EXECUTE is granted to service_role only, matching every other entries RPC.
CREATE OR REPLACE FUNCTION app.submit_buyer_intake(
  p_buyer_id uuid,
  p_full_name text,
  p_email text,
  p_is_business boolean,
  p_business_name text,
  p_gstin text,
  p_geography jsonb,
  p_billing_address jsonb
) RETURNS app.buyers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_buyer app.buyers%ROWTYPE;
BEGIN
  SELECT * INTO v_buyer
  FROM app.buyers
  WHERE id = p_buyer_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_buyer.id IS NULL THEN
    RAISE EXCEPTION 'buyer_not_found' USING ERRCODE = '02000';
  END IF;

  UPDATE app.buyers
  SET contact_name = NULLIF(trim(p_full_name), ''),
      email = NULLIF(trim(p_email), ''),
      business_name = CASE
        WHEN p_is_business AND NULLIF(trim(p_business_name), '') IS NOT NULL
          THEN trim(p_business_name)
        ELSE business_name
      END,
      gstin = NULLIF(trim(p_gstin), ''),
      geography = COALESCE(p_geography, geography),
      billing_address = COALESCE(p_billing_address, billing_address),
      custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object(
        'is_business', p_is_business,
        'intake_submitted_at', now()
      ),
      updated_at = now(),
      updated_by = v_buyer.user_id
  WHERE id = p_buyer_id
  RETURNING * INTO v_buyer;

  PERFORM app.sync_entry_from_buyer(p_buyer_id);

  RETURN v_buyer;
END;
$$;

REVOKE ALL ON FUNCTION app.submit_buyer_intake(uuid, text, text, boolean, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.submit_buyer_intake(uuid, text, text, boolean, text, text, jsonb, jsonb) TO service_role;

-- Prefer the explicit is_business signal written by submit_buyer_intake over
-- the GSTIN/contact-name heuristic. Buyers created before this migration (or
-- that never completed intake) have no 'is_business' key and keep falling
-- back to the heuristic exactly as before.
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

  IF v_buyer.custom_fields ? 'is_business' THEN
    v_type := CASE WHEN (v_buyer.custom_fields->>'is_business')::boolean
      THEN 'business_approval'
      ELSE 'new_user_login'
    END;
  ELSE
    v_type := CASE
      WHEN NULLIF(v_buyer.gstin, '') IS NOT NULL
        OR NULLIF(v_buyer.contact_name, '') IS NOT NULL
        OR v_buyer.business_name !~ '^Customer [0-9+ -]+$'
      THEN 'business_approval'
      ELSE 'new_user_login'
    END;
  END IF;

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
