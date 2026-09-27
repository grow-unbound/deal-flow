-- SECURITY FIX: otp_verified_phone / otp_verified_phone_at were stamped into
-- Supabase Auth's user_metadata (raw_user_meta_data), which is CLIENT-WRITABLE
-- via the public supabase.auth.updateUser({ data: {...} }) call using nothing
-- but the anon key and the caller's own session. Any authenticated user could
-- self-forge otp_verified_phone = <any phone> and have it persist server-side,
-- completely bypassing the OTP-anchor identity checks these two RPCs
-- (introduced in 20260911013323_fix_buyer_signup_rpcs_otp_anchor.sql) exist to
-- enforce -- no phone-column poisoning (the prior exploit class) even needed.
--
-- REAL FIX: move the anchor read from auth.jwt() -> 'user_metadata' to
-- auth.jwt() -> 'app_metadata'. app_metadata (raw_app_meta_data) is writable
-- only via the Admin API (supabaseAdmin.auth.admin.updateUserById), never via
-- the client SDK's updateUser() -- confirmed empirically on yukti-dev
-- (disposable test users, cleaned up): a client-side updateUser({data:...})
-- call only ever touches user_metadata; app_metadata is untouched by it. Also
-- confirmed empirically that app_metadata is present under the top-level
-- 'app_metadata' claim key in the issued JWT, structurally identical to how
-- user_metadata was read here, so this is a like-for-like key swap with no
-- other logic change. See the companion TS changes in this commit
-- (src/lib/server/buyer-access.ts and the six route read sites) and
-- .superpowers/sdd/otp-verified-phone-app-metadata-migration-report.md for
-- full empirical evidence (merge semantics, forgery-now-inert proof,
-- custom_access_token_hook / tenant-switching regression proof).
--
-- Only the metadata object read from changes -- no other logic in either
-- function is touched.

CREATE OR REPLACE FUNCTION app.find_existing_profiles_for_phone(
  p_phone text,
  p_exclude_tenant_id uuid
)
RETURNS TABLE (
  buyer_id uuid,
  tenant_id uuid,
  tenant_name text,
  business_name text,
  contact_name text,
  phone text,
  gstin text,
  is_business boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_phone text := auth.jwt() -> 'app_metadata' ->> 'otp_verified_phone';
  v_normalized_phone text;
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;

  -- Normalize once; use v_normalized_phone for both the identity check below
  -- and the data-lookup query, so the two can never disagree about what
  -- counts as "the same phone".
  v_normalized_phone := app.normalize_indian_phone(p_phone);

  IF v_normalized_phone = '' THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Identity anchor: the phone an actual WhatsApp OTP was verified against
  -- (stamped only by app/api/auth/phone-otp/verify/route.ts at the moment of
  -- verification, from the OTP store record -- never derived from
  -- app.buyers.phone/app.buyer_users.phone, which are mutable business
  -- columns a buyer_admin can rewrite via PATCH /api/buyer/me with no OTP
  -- re-check, and never re-derived by any session-remint path such as
  -- switch-buyer or workspaces/enter). Missing/blank claim fails closed.
  -- Read from app_metadata (Admin-API-only write), NOT user_metadata
  -- (client-writable via the public updateUser() call) -- see fix note above.
  IF v_jwt_phone IS NULL OR btrim(v_jwt_phone) = '' THEN
    RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  IF app.normalize_indian_phone(v_jwt_phone) <> v_normalized_phone THEN
    RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.tenant_id,
    t.business_name AS tenant_name,
    b.business_name,
    b.contact_name,
    b.phone,
    b.gstin,
    CASE
      WHEN b.custom_fields ? 'is_business' THEN (b.custom_fields ->> 'is_business')::boolean
      ELSE (
        NULLIF(b.gstin, '') IS NOT NULL
        OR NULLIF(b.contact_name, '') IS NOT NULL
        OR b.business_name !~ '^Customer [0-9+ -]+$'
      )
    END AS is_business
  FROM app.buyers b
  JOIN app.tenants t ON t.id = b.tenant_id
  WHERE app.normalize_indian_phone(b.phone) = v_normalized_phone
    AND (p_exclude_tenant_id IS NULL OR b.tenant_id <> p_exclude_tenant_id)
    AND b.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.check_document_reuse_candidate(
  p_gstin text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_jwt_phone text;
  v_normalized_phone text;
  v_document_ids uuid[];
  v_tenant_name text;
  v_found boolean;
BEGIN
  IF (p_gstin IS NULL) = (p_phone IS NULL) THEN
    RAISE EXCEPTION 'exactly_one_of_gstin_or_phone_required' USING ERRCODE = '22023';
  END IF;

  IF p_phone IS NOT NULL AND btrim(p_phone) = '' THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;

  IF p_gstin IS NOT NULL THEN
    SELECT array_agg(bd.id), (array_agg(t.business_name))[1]
    INTO v_document_ids, v_tenant_name
    FROM app.buyer_documents bd
    JOIN app.tenants t ON t.id = bd.tenant_id
    WHERE bd.subject_scope = 'business'
      AND bd.gstin = p_gstin
      AND bd.deleted_at IS NULL;
  ELSE
    -- Normalize once; use v_normalized_phone for both the identity check
    -- and the data-lookup query below.
    v_normalized_phone := app.normalize_indian_phone(p_phone);

    IF v_normalized_phone = '' THEN
      RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
    END IF;

    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
    END IF;

    -- Same OTP-anchor fix as find_existing_profiles_for_phone above -- read
    -- from app_metadata (Admin-API-only write), not user_metadata
    -- (client-writable).
    v_jwt_phone := auth.jwt() -> 'app_metadata' ->> 'otp_verified_phone';

    IF v_jwt_phone IS NULL OR btrim(v_jwt_phone) = '' THEN
      RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
    END IF;

    IF app.normalize_indian_phone(v_jwt_phone) <> v_normalized_phone THEN
      RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT array_agg(bd.id), (array_agg(t.business_name))[1]
    INTO v_document_ids, v_tenant_name
    FROM app.buyer_documents bd
    JOIN app.tenants t ON t.id = bd.tenant_id
    WHERE bd.subject_scope = 'personal'
      AND bd.buyer_id = ANY (
        SELECT b.id FROM app.buyers b
        WHERE app.normalize_indian_phone(b.phone) = v_normalized_phone AND b.deleted_at IS NULL
      )
      AND bd.deleted_at IS NULL;
  END IF;

  v_found := v_document_ids IS NOT NULL AND array_length(v_document_ids, 1) > 0;

  RETURN jsonb_build_object(
    'found', v_found,
    'tenant_name', CASE WHEN v_found THEN v_tenant_name ELSE NULL END,
    'document_ids', COALESCE(v_document_ids, ARRAY[]::uuid[])
  );
END;
$$;

REVOKE ALL ON FUNCTION app.check_document_reuse_candidate(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.check_document_reuse_candidate(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.check_document_reuse_candidate(text, text) TO service_role;
