-- Fixes review findings on Task 6's buyer-signup read RPCs
-- (20260910124338_buyer_signup_read_rpcs.sql, commit 9a8ad606).
--
-- CRITICAL: the identity check in app.find_existing_profiles_for_phone and
-- app.check_document_reuse_candidate's phone path verified the caller's
-- identity by checking whether auth.uid() owns an app.buyers/app.buyer_users
-- row carrying p_phone. But app.buyers.phone is a normal, mutable business
-- column any buyer_admin can rewrite via PATCH /api/buyer/me with no OTP
-- re-verification. This let an attacker PATCH their own buyers.phone to a
-- victim's phone number, then call these RPCs and have the identity check
-- pass, leaking the victim's business name, contact name, GSTIN, and which
-- distributor(s) they buy from, across every tenant. Demonstrated live on
-- yukti-dev by the Task 6 reviewer.
--
-- Fix: verify identity against auth.jwt() -> 'user_metadata' ->> 'phone'
-- instead. Every buyer session mint (createBuyerSessionForUser in
-- src/lib/server/buyer-access.ts, called from both mintBuyerSession and
-- mintBuyerHandoffLink) stamps user_metadata.phone = candidate.phone at the
-- moment of successful OTP verification, via supabaseAdmin.auth.admin.
-- updateUserById -- and this call REPLACES user_metadata on every login, so
-- the claim is always fresh for the session's actual verified phone. The
-- buyer-facing PATCH /api/buyer/me route never calls updateUserById /
-- touches auth.users at all (confirmed by grep -- it only writes
-- app.buyers/app.buyer_users), so an attacker cannot forge this claim
-- without actually completing a fresh OTP verification for the target
-- phone number.
--
-- Verified empirically on yukti-dev before writing this fix (not assumed):
--   1. Real buyer auth.users rows in the wild already carry
--      raw_user_meta_data.phone (e.g. user cab1acbe-...-4666f ->
--      meta_phone "9876541234").
--   2. `set local request.jwt.claims` with a user_metadata.phone key makes
--      `auth.jwt() -> 'user_metadata' ->> 'phone'` return it correctly.
--   3. The live public.custom_access_token_hook body (confirmed via
--      pg_get_functiondef and the migration history) only ever adds/removes
--      tenant_id/user_role/buyer_id/location_ids/is_platform_admin on the
--      claims object -- it never touches user_metadata, which Supabase Auth
--      populates independently from auth.users.raw_user_meta_data on every
--      token mint/refresh.
-- So this claim path is real and reliable for every session created via the
-- current mintBuyerSession/mintBuyerHandoffLink flow -- there is no known
-- code path that mints a buyer session without stamping it. Per the fail-
-- closed requirement, a missing/blank claim is treated as identity failure,
-- never as "check passed" (same pattern as the existing v_uid IS NULL
-- checks).
--
-- Also fixed in this migration (all four straightforward review findings):
--   2. GRANT EXECUTE ... TO service_role added alongside authenticated on
--      all three functions -- app/api/buyer/onboarding/intake/route.ts (the
--      established pattern for buyer-signup RPCs) calls via supabaseAdmin
--      (service role), and tasks 9/10/11 wiring these three RPCs into API
--      routes will very likely follow the same pattern.
--   3. find_existing_profiles_for_phone: `b.tenant_id != p_exclude_tenant_id`
--      silently returned zero rows whenever p_exclude_tenant_id was NULL.
--      Fixed to `(p_exclude_tenant_id IS NULL OR b.tenant_id <>
--      p_exclude_tenant_id)`.
--   4. get_buyer_onboarding_status: added `id DESC` tiebreak to the
--      missing_fields lookup's `ORDER BY created_at DESC LIMIT 1`.
--   5. check_document_reuse_candidate: added the same `btrim(p_phone) = ''`
--      early guard (raising phone_required, ERRCODE 22023) that
--      find_existing_profiles_for_phone already had, so passing an empty
--      string doesn't fall through to the less-clear identity-mismatch
--      branch.
--
-- Uses CREATE OR REPLACE FUNCTION throughout -- no signature changes are
-- needed for any of these fixes, and DROP FUNCTION would silently discard
-- the REVOKE/GRANT ACL state (the Task 4/5 lesson already documented in the
-- migration this one fixes).

-- =====================================================================
-- 0. Shared helper: normalize a phone number the same way
--    src/lib/phone.ts's normalizeIndianPhone() does, so SQL-side identity
--    comparisons match what the application layer considers "the same
--    phone" regardless of +91/0-prefix/formatting differences between the
--    JWT-stamped value and a caller-supplied p_phone.
-- =====================================================================
CREATE OR REPLACE FUNCTION app.normalize_indian_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  IF v_digits LIKE '91%' AND length(v_digits) > 10 THEN
    RETURN right(v_digits, 10);
  END IF;

  IF v_digits LIKE '0%' AND length(v_digits) > 10 THEN
    RETURN right(v_digits, 10);
  END IF;

  RETURN v_digits;
END;
$$;

REVOKE ALL ON FUNCTION app.normalize_indian_phone(text) FROM PUBLIC;

-- =====================================================================
-- 1. app.get_buyer_onboarding_status() -- tiebreak fix + service_role grant
-- =====================================================================
CREATE OR REPLACE FUNCTION app.get_buyer_onboarding_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_buyer_id uuid := app.jwt_buyer_id();
  v_tenant_id uuid := app.jwt_tenant_id();
  v_buyer app.buyers%ROWTYPE;
  v_tenant_name text;
  v_whatsapp_number text;
  v_whatsapp_display_name text;
  v_missing_fields jsonb := NULL;
BEGIN
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object(
      'has_relationship', false,
      'onboarding_status', NULL,
      'declined_reason', NULL,
      'missing_fields', NULL,
      'tenant_name', NULL,
      'tenant_whatsapp_number', NULL,
      'tenant_whatsapp_display_name', NULL
    );
  END IF;

  SELECT * INTO v_buyer
  FROM app.buyers b
  WHERE b.id = v_buyer_id
    AND (v_tenant_id IS NULL OR b.tenant_id = v_tenant_id)
    AND b.deleted_at IS NULL;

  IF v_buyer.id IS NULL THEN
    RETURN jsonb_build_object(
      'has_relationship', false,
      'onboarding_status', NULL,
      'declined_reason', NULL,
      'missing_fields', NULL,
      'tenant_name', NULL,
      'tenant_whatsapp_number', NULL,
      'tenant_whatsapp_display_name', NULL
    );
  END IF;

  SELECT t.business_name INTO v_tenant_name
  FROM app.tenants t
  WHERE t.id = v_buyer.tenant_id;

  SELECT ts.settings -> 'buyer_app' ->> 'whatsapp_number',
         ts.settings -> 'buyer_app' ->> 'whatsapp_display_name'
  INTO v_whatsapp_number, v_whatsapp_display_name
  FROM app.tenant_settings ts
  WHERE ts.tenant_id = v_buyer.tenant_id;

  IF v_buyer.onboarding_status = 'needs_more_info' THEN
    SELECT e.metadata -> 'missing_fields'
    INTO v_missing_fields
    FROM app.entries e
    WHERE e.tenant_id = v_buyer.tenant_id
      AND e.source_entity_type = 'buyer'
      AND e.source_entity_id = v_buyer.id
      AND e.entry_type IN ('business_approval', 'new_user_login')
      AND e.deleted_at IS NULL
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'has_relationship', true,
    'onboarding_status', v_buyer.onboarding_status,
    'declined_reason', CASE WHEN v_buyer.onboarding_status = 'declined' THEN v_buyer.declined_reason ELSE NULL END,
    'missing_fields', v_missing_fields,
    'tenant_name', v_tenant_name,
    'tenant_whatsapp_number', v_whatsapp_number,
    'tenant_whatsapp_display_name', v_whatsapp_display_name
  );
END;
$$;

REVOKE ALL ON FUNCTION app.get_buyer_onboarding_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_buyer_onboarding_status() TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_buyer_onboarding_status() TO service_role;

-- =====================================================================
-- 2. app.find_existing_profiles_for_phone(p_phone, p_exclude_tenant_id)
--    -- phone-oracle fix, NULL-exclude fix, service_role grant
-- =====================================================================
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
  v_jwt_phone text := auth.jwt() -> 'user_metadata' ->> 'phone';
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Identity anchor: the OTP-verified phone stamped onto auth.users.
  -- user_metadata at session-mint time (createBuyerSessionForUser in
  -- src/lib/server/buyer-access.ts), NOT app.buyers.phone/app.buyer_users.
  -- phone -- those are mutable business columns a buyer_admin can rewrite
  -- via PATCH /api/buyer/me without any OTP re-verification, which is
  -- exactly the cross-tenant phone-enumeration oracle this fix closes.
  -- Missing/blank claim fails closed, matching the v_uid IS NULL pattern.
  IF v_jwt_phone IS NULL OR btrim(v_jwt_phone) = '' THEN
    RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  IF app.normalize_indian_phone(v_jwt_phone) <> app.normalize_indian_phone(p_phone) THEN
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
  WHERE b.phone = p_phone
    AND (p_exclude_tenant_id IS NULL OR b.tenant_id <> p_exclude_tenant_id)
    AND b.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) TO service_role;

-- =====================================================================
-- 3. app.check_document_reuse_candidate(p_gstin, p_phone) -- phone-oracle
--    fix, empty-phone guard, service_role grant
-- =====================================================================
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
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
    END IF;

    -- Same phone-oracle fix as find_existing_profiles_for_phone above:
    -- identity is anchored to the OTP-verified auth.jwt() ->
    -- 'user_metadata' ->> 'phone' claim, never to the mutable
    -- app.buyers.phone / app.buyer_users.phone columns.
    v_jwt_phone := auth.jwt() -> 'user_metadata' ->> 'phone';

    IF v_jwt_phone IS NULL OR btrim(v_jwt_phone) = '' THEN
      RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
    END IF;

    IF app.normalize_indian_phone(v_jwt_phone) <> app.normalize_indian_phone(p_phone) THEN
      RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT array_agg(bd.id), (array_agg(t.business_name))[1]
    INTO v_document_ids, v_tenant_name
    FROM app.buyer_documents bd
    JOIN app.tenants t ON t.id = bd.tenant_id
    WHERE bd.subject_scope = 'personal'
      AND bd.buyer_id = ANY (
        SELECT b.id FROM app.buyers b
        WHERE b.phone = p_phone AND b.deleted_at IS NULL
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
