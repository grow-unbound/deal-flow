-- Task 5: app.submit_buyer_intake — two fixes.
--
-- 1. Non-business business_name fix: when p_is_business = false, the function
--    previously left `business_name` untouched (kept whatever placeholder was
--    already there, e.g. 'Customer <phone>' from acquireBuyerForStorefront).
--    Per backend plan §7 item 1 / §0b addendum, reuse the submitted contact
--    name as business_name for non-business buyers, falling back to the
--    existing value only when the trimmed name is empty.
--
-- 2. New trailing parameter p_document_ids uuid[] DEFAULT NULL — defense in
--    depth validation that any document ids the client claims belong to this
--    buyer actually do (exist in app.buyer_documents, buyer_id = p_buyer_id,
--    not soft-deleted). Read-only check; no further writes to buyer_documents
--    (a separate upload-confirm flow sets buyer_id on those rows at creation).
--
-- IMPORTANT — DROP FUNCTION is used here deliberately, not CREATE OR REPLACE
-- alone. Task 4's fix report (supabase/migrations/20260910121355) documented
-- that a bare DROP FUNCTION silently discards the function's REVOKE/GRANT ACL,
-- which created a live security hole for app.apply_entry_action. We verified
-- empirically (throwaway public.__task5_sig_test function, 2026-09-10) that
-- appending a new trailing DEFAULT-valued parameter via CREATE OR REPLACE
-- FUNCTION does NOT replace the function in place — Postgres treats the new
-- arg-count signature as a distinct overload, which produces "function ... is
-- not unique" ambiguity errors for existing named-argument callers (the
-- intake route calls this via supabase-js named RPC params). So a DROP is
-- unavoidable here. To avoid repeating Task 4's mistake, we captured the
-- exact pre-existing ACL below and explicitly re-apply it after the DROP +
-- CREATE OR REPLACE, verified via has_function_privilege before and after:
--
--   anon           EXECUTE -> false  (unchanged)
--   authenticated  EXECUTE -> false  (unchanged)
--   service_role   EXECUTE -> true   (unchanged)
--   postgres       EXECUTE -> true   (owner; unchanged, implicit)
--
-- No PUBLIC grant existed before, so none is (re)granted after.

DROP FUNCTION IF EXISTS app.submit_buyer_intake(uuid, text, text, boolean, text, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION app.submit_buyer_intake(
  p_buyer_id uuid,
  p_full_name text,
  p_email text,
  p_is_business boolean,
  p_business_name text,
  p_gstin text,
  p_geography jsonb,
  p_billing_address jsonb,
  p_document_ids uuid[] DEFAULT NULL
)
 RETURNS app.buyers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
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

  -- Defense-in-depth: every claimed document id must exist, belong to this
  -- buyer, and not be soft-deleted. Prevents a client from claiming someone
  -- else's uploaded document id. Read-only check — no writes here.
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
      updated_at = now(),
      updated_by = v_buyer.user_id
  WHERE id = p_buyer_id
  RETURNING * INTO v_buyer;

  PERFORM app.sync_entry_from_buyer(p_buyer_id);

  RETURN v_buyer;
END;
$function$;

REVOKE ALL ON FUNCTION app.submit_buyer_intake(uuid, text, text, boolean, text, text, jsonb, jsonb, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.submit_buyer_intake(uuid, text, text, boolean, text, text, jsonb, jsonb, uuid[]) TO service_role;
