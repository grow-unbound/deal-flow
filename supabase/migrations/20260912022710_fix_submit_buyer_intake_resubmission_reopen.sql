-- Task 11: app.submit_buyer_intake never reopened an entry stuck in
-- 'waiting' (post seller "request more info") and never flipped
-- onboarding_status back from 'needs_more_info'. Root cause, confirmed live
-- on yukti-dev before this fix: app.upsert_entry's ON CONFLICT DO UPDATE
-- only resets status from 'resolved' -> 'new' ('waiting' is left
-- untouched), and submit_buyer_intake never wrote onboarding_status at all.
-- A buyer who resubmitted after a request-more-info stayed stuck showing
-- needs_more_info/stale missing_fields to both themselves and the seller
-- forever. This mirrors the design note already left inside
-- app.apply_entry_action's 'approve'/'decline' branches, which flagged this
-- exact "buyer resubmitted after more-info-requested" gap as unresolved.
--
-- Fix: when the buyer's onboarding_status was 'needs_more_info' at the start
-- of this call, flip it to 'pending_approval' as part of the same UPDATE,
-- and explicitly call app.apply_entry_action(..., 'reopen') on the
-- associated entry (found the same way app.get_buyer_onboarding_status
-- locates it) when that entry is still 'waiting'. apply_entry_action's
-- existing 'reopen' branch already does the right thing here: status ->
-- 'new', remind_at cleared, priority_at bumped to now() so it resurfaces at
-- the top of the seller's Inbox. No new entry-status transition was needed.
CREATE OR REPLACE FUNCTION app.submit_buyer_intake(p_buyer_id uuid, p_full_name text, p_email text, p_is_business boolean, p_business_name text, p_gstin text, p_geography jsonb, p_billing_address jsonb, p_document_ids uuid[] DEFAULT NULL::uuid[])
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

  PERFORM app.sync_entry_from_buyer(p_buyer_id);

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

    IF v_entry_id IS NOT NULL AND v_entry_status = 'waiting' THEN
      PERFORM app.apply_entry_action(v_buyer.tenant_id, v_entry_id, NULL, 'reopen');
    END IF;
  END IF;

  RETURN v_buyer;
END;
$function$;

REVOKE ALL ON FUNCTION app.submit_buyer_intake(uuid, text, text, boolean, text, text, jsonb, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.submit_buyer_intake(uuid, text, text, boolean, text, text, jsonb, jsonb, uuid[]) TO service_role;
