-- Task 11 review, Important #3: submit_buyer_intake's needs_more_info ->
-- reopen fix (20260912022710_fix_submit_buyer_intake_resubmission_reopen.sql)
-- read the entry's status AFTER calling app.sync_entry_from_buyer, but
-- sync_entry_from_buyer's very first branch is:
--
--   IF COALESCE(v_buyer.buyer_app_enabled, true) THEN
--     PERFORM app.resolve_entries_for_source(..., 'auto_resolved');
--     RETURN NULL;
--   END IF;
--
-- buyer_app_enabled stays true for a buyer who was already approved once
-- (app.apply_entry_action's 'approve' branch sets it true and nothing ever
-- flips it back to false for a still-enabled buyer) -- so the reachable
-- sequence "buyer approved -> seller reopens the (already-resolved) entry ->
-- seller requests more info again (e.g. an expired GST cert) -> buyer
-- resubmits" has buyer_app_enabled = true at resubmission time. In that
-- state, PERFORM app.sync_entry_from_buyer(p_buyer_id) auto-resolves the
-- 'waiting' entry BEFORE the old function's own reopen check ever runs, so
-- the check that follows re-reads the entry's status as 'resolved' (not
-- 'waiting') and skips the reopen entirely. The resubmission silently
-- auto-resolves instead of reopening -- the seller's Inbox loses it with no
-- trace.
--
-- Fix: capture the entry id/status BEFORE calling sync_entry_from_buyer,
-- while it still reflects the real pre-resubmission state (whatever
-- request_more_info left it as). The reopen decision is then made off that
-- captured status, not whatever sync_entry_from_buyer did to the row in the
-- interim. This is safe even when sync_entry_from_buyer's auto-resolve DOES
-- fire first: app.apply_entry_action's 'reopen' branch has no status
-- precondition (unlike approve/decline, which reject 'resolved'/'waiting'),
-- so calling reopen after an auto-resolve still correctly lands the entry on
-- 'new' with remind_at cleared and priority_at bumped, exactly as intended.
--
-- No other change to the function -- ACLs unchanged (anon: false,
-- authenticated: false, service_role: true), everything else in the body is
-- byte-identical to the current live definition, just reordered.

CREATE OR REPLACE FUNCTION app.submit_buyer_intake(
  p_buyer_id uuid,
  p_full_name text,
  p_email text,
  p_is_business boolean,
  p_business_name text,
  p_gstin text,
  p_geography jsonb,
  p_billing_address jsonb,
  p_document_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS app.buyers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_buyer app.buyers%ROWTYPE;
  v_old_onboarding_status text;
  v_entry_id uuid;
  v_entry_status text;
BEGIN
  SELECT * INTO v_buyer
  FROM app.buyers
  WHERE id = p_buyer_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_buyer.id IS NULL THEN
    RAISE EXCEPTION 'buyer_not_found' USING ERRCODE = '02000';
  END IF;

  v_old_onboarding_status := v_buyer.onboarding_status;

  -- Defense-in-depth: every claimed document id must exist, belong to this
  -- buyer, and not be soft-deleted. Prevents a client from claiming someone
  -- else's uploaded document id. Read-only check -- no writes here.
  IF p_document_ids IS NOT NULL AND array_length(p_document_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_document_ids) AS doc_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM app.buyer_documents bd
        WHERE bd.id = doc_id
          AND bd.buyer_id = p_buyer_id
          AND bd.deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'invalid_document_id' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE app.buyers
  SET contact_name = NULLIF(trim(p_full_name), ''),
      email = NULLIF(trim(p_email), ''),
      business_name = CASE
        WHEN p_is_business AND NULLIF(trim(p_business_name), '') IS NOT NULL
          THEN trim(p_business_name)
        ELSE COALESCE(NULLIF(trim(p_full_name), ''), business_name)
      END,
      gstin = NULLIF(trim(p_gstin), ''),
      geography = COALESCE(p_geography, geography),
      billing_address = COALESCE(p_billing_address, billing_address),
      custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object(
        'is_business', p_is_business,
        'intake_submitted_at', now()
      ),
      onboarding_status = CASE
        WHEN onboarding_status = 'needs_more_info' THEN 'pending_approval'
        ELSE onboarding_status
      END,
      updated_at = now(),
      updated_by = v_buyer.user_id
  WHERE id = p_buyer_id
  RETURNING * INTO v_buyer;

  -- Captured BEFORE sync_entry_from_buyer runs -- see the migration-level
  -- comment above for why this order matters.
  IF v_old_onboarding_status = 'needs_more_info' THEN
    SELECT e.id, e.status INTO v_entry_id, v_entry_status
    FROM app.entries e
    WHERE e.tenant_id = v_buyer.tenant_id
      AND e.source_entity_type = 'buyer'
      AND e.source_entity_id = v_buyer.id
      AND e.entry_type IN ('business_approval', 'new_user_login')
      AND e.deleted_at IS NULL
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1;
  END IF;

  PERFORM app.sync_entry_from_buyer(p_buyer_id);

  IF v_old_onboarding_status = 'needs_more_info'
     AND v_entry_id IS NOT NULL
     AND v_entry_status = 'waiting' THEN
    PERFORM app.apply_entry_action(v_buyer.tenant_id, v_entry_id, NULL, 'reopen');
  END IF;

  RETURN v_buyer;
END;
$function$;
