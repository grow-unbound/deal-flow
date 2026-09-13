-- Task 6 (Yukti_Public-Signup_Backend-Plan_v1.md §2.4, §2.5, §4): three new
-- read-only RPCs backing the buyer-approval signup flow's gated re-login
-- status pill, cross-tenant profile-resolution picker, and the lazy-consent
-- document-reuse offer. All three are SECURITY DEFINER, SET search_path =
-- app, public, and never trust a client-supplied tenant_id/buyer_id where a
-- JWT claim is available instead.
--
-- Lesson carried forward from the emergency fix in
-- 20260910121355_fix_apply_entry_action_review_findings.sql: CREATE OR
-- REPLACE does not restate GRANT/REVOKE, and a bare CREATE FUNCTION defaults
-- to PUBLIC EXECUTE. Every function below gets an explicit REVOKE ALL FROM
-- PUBLIC followed by a targeted GRANT immediately after its CREATE, so there
-- is never a window (even within this single migration) where the function
-- exists with default/public ACLs. These three are meant to be called
-- directly by an authenticated buyer session (buyer_pending / buyer_admin /
-- buyer_assistant all ride the Postgres `authenticated` role via Supabase's
-- JWT-to-role mapping), so EXECUTE is granted to `authenticated` and each
-- function scopes what the caller can see via its own internal claim/
-- identity checks -- never to `anon`.

-- =====================================================================
-- 1. app.get_buyer_onboarding_status()
--
-- Backs the buyer-facing gated re-login/status pill. Reads buyer_id/
-- tenant_id from the caller's JWT claims via the existing app.jwt_buyer_id()/
-- app.jwt_tenant_id() helpers (app/prod_bootstrap) rather than re-deriving
-- claim parsing. Returns a "no relationship" shape (has_relationship=false,
-- everything else null) instead of raising when the session has no buyer_id
-- claim at all -- verified live: app.jwt_buyer_id()/app.jwt_tenant_id()
-- return NULL (not an error) when there is no JWT context, e.g. called from
-- a service-role/postgres session with no request.jwt.claims GUC set. That
-- is exactly Case 2's first-ever-visit shape per the backend plan.
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
    ORDER BY e.created_at DESC
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

-- =====================================================================
-- 2. app.find_existing_profiles_for_phone(p_phone, p_exclude_tenant_id)
--
-- Backs the cross-tenant multi-profile picker. Verifies the caller's own
-- authenticated identity is actually associated with p_phone before
-- returning anything -- a mismatch raises rather than silently returning
-- empty, since a bare-phone lookup with no identity match is a bad/
-- malicious call, not a benign empty result.
--
-- The codebase's phone<->auth-user association is NOT auth.users.phone (buyer
-- auth users are provisioned with a synthetic email/password in
-- buyer-access.ts, not Supabase phone auth) and the JWT carries no phone
-- claim (see public.custom_access_token_hook, which only ever sets
-- tenant_id/user_role/buyer_id/location_ids/intake_submitted) -- it is
-- app.buyers.user_id / app.buyer_users.user_id, exactly the reverse
-- direction of findExistingAuthUserIdForPhone() in
-- src/lib/server/buyer-access.ts (which resolves phone -> user_id). So the
-- identity check here is: does auth.uid() own a buyers/buyer_users row
-- carrying this phone?
--
-- is_business classification reuses app.sync_entry_from_buyer's exact live
-- heuristic (confirmed via pg_get_functiondef against yukti-dev): prefer
-- custom_fields->>'is_business' when present, else fall back to
-- gstin/contact_name/the auto-generated "Customer <phone>" placeholder
-- regex.
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
  v_verified boolean;
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM app.buyers b
    WHERE b.user_id = v_uid AND b.phone = p_phone AND b.deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM app.buyer_users bu
    WHERE bu.user_id = v_uid AND bu.phone = p_phone AND bu.deleted_at IS NULL
  ) INTO v_verified;

  IF NOT v_verified THEN
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
    AND b.tenant_id != p_exclude_tenant_id
    AND b.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) TO authenticated;

-- =====================================================================
-- 3. app.check_document_reuse_candidate(p_gstin, p_phone)
--
-- Backs §4's lazy-consent document-reuse offer. Exactly one of p_gstin/
-- p_phone must be given. GSTIN path is a straightforward cross-tenant
-- business-scope lookup (no identity check needed -- GSTIN is not a secret
-- tied to the caller's own session, matching §4's "no phone involved" business
-- reuse rule). Phone path applies the same caller-owns-this-phone check as
-- function 2 above, then resolves all app.buyers.id for that phone across
-- tenants and looks up personal-scope documents for that set -- this is
-- also the fallback path for a no-GSTIN business buyer (§0b: a GST-less
-- business is treated as an individual for document-reuse purposes, scoped
-- by buyer_id/phone instead of GSTIN).
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
  v_verified boolean;
  v_document_ids uuid[];
  v_tenant_name text;
  v_found boolean;
BEGIN
  IF (p_gstin IS NULL) = (p_phone IS NULL) THEN
    RAISE EXCEPTION 'exactly_one_of_gstin_or_phone_required' USING ERRCODE = '22023';
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

    SELECT EXISTS (
      SELECT 1 FROM app.buyers b
      WHERE b.user_id = v_uid AND b.phone = p_phone AND b.deleted_at IS NULL
      UNION ALL
      SELECT 1 FROM app.buyer_users bu
      WHERE bu.user_id = v_uid AND bu.phone = p_phone AND bu.deleted_at IS NULL
    ) INTO v_verified;

    IF NOT v_verified THEN
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
