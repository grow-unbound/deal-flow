-- Fix: app.sync_entry_from_buyer created a business_approval / new_user_login
-- entry for EVERY buyer with the buyer app off, not just self-registered ones.
--
-- The self-registration guard was
--   IF NOT (custom_fields->>'storefront_self_registered' = 'true' OR (...)) THEN RETURN NULL;
-- For a buyer without the storefront_self_registered key the first operand is
-- NULL, so the OR is NULL (or FALSE, then NULL OR FALSE = NULL), NOT NULL is
-- NULL, and plpgsql treats an IF on NULL as false -- the early RETURN never ran.
-- The first daily inbox sweep after the public-signup release therefore
-- generated one bogus approval entry per imported buyer.
--
-- 1) Re-create the function with a NULL-safe guard (no other behaviour change).
-- 2) Soft-delete the bogus entries the sweep already generated: untouched
--    ('new', never acted on) storefront buyer-approval entries whose buyer is
--    not self-registered / a placeholder signup and never submitted intake
--    (no custom_fields.is_business). Their 'generated' events are soft-deleted
--    with them so buyer history stays clean.

CREATE OR REPLACE FUNCTION app.sync_entry_from_buyer(p_buyer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
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

  IF NOT COALESCE(
    v_buyer.custom_fields->>'storefront_self_registered' = 'true'
    OR (v_buyer.created_by IS NULL AND v_buyer.external_ref IS NULL AND v_buyer.business_name ~ '^Customer [0-9+ -]+$'),
    false
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
$function$;

WITH bogus AS (
  SELECT e.id
  FROM app.entries e
  JOIN app.buyers b ON b.id = e.source_entity_id
  WHERE e.entry_type IN ('business_approval', 'new_user_login')
    AND e.source_channel = 'storefront'
    AND e.source_entity_type = 'buyer'
    AND e.deleted_at IS NULL
    AND e.status = 'new'
    AND e.last_action IS NULL
    AND NOT COALESCE(
      b.custom_fields->>'storefront_self_registered' = 'true'
      OR (b.created_by IS NULL AND b.external_ref IS NULL AND b.business_name ~ '^Customer [0-9+ -]+$'),
      false
    )
    AND NOT (COALESCE(b.custom_fields, '{}'::jsonb) ? 'is_business')
),
del_events AS (
  UPDATE app.entry_events ev
  SET deleted_at = now()
  FROM bogus
  WHERE ev.entry_id = bogus.id
    AND ev.deleted_at IS NULL
    AND ev.action = 'generated'
  RETURNING ev.id
)
UPDATE app.entries e
SET deleted_at = now()
FROM bogus
WHERE e.id = bogus.id;
