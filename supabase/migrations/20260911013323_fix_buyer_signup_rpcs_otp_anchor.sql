-- Third fix round on Task 6's buyer-signup read RPCs. Prior fixes:
--   20260910124338_buyer_signup_read_rpcs.sql (commit 9a8ad606) — original RPCs.
--   20260911011048_fix_buyer_signup_rpcs_phone_oracle.sql (commit 8d88c36d) —
--   anchored the identity check on auth.jwt() -> 'user_metadata' ->> 'phone'
--   instead of the mutable app.buyers.phone column, closing the direct
--   PATCH-your-own-phone exploit.
--
-- SECOND REVIEW FINDING (this migration fixes): the `phone` user_metadata
-- claim used as the anchor is ALSO forgeable, in two steps, with zero fresh
-- OTP:
--   1. PATCH /api/buyer/me rewrites the attacker's own app.buyers.phone to
--      the victim's phone (same-tenant-only uniqueness check, no global
--      unique index).
--   2. POST /api/auth/switch-buyer (or /api/auth/workspaces/enter) re-mints
--      the attacker's session for their own buyer_id. Both eventually call
--      createBuyerSessionForUser() in src/lib/server/buyer-access.ts, which
--      re-stamps user_metadata.phone = candidate.phone via
--      supabaseAdmin.auth.admin.updateUserById -- and candidate.phone is
--      sourced from the now-attacker-controlled app.buyers.phone column, not
--      from any actual OTP verification. The attacker's session now carries
--      user_metadata.phone = <victim's number> with no fresh OTP involved,
--      re-opening the RPC leak through the very claim meant to close it.
--
-- REAL FIX: introduce a SEPARATE metadata key, otp_verified_phone, stamped
-- ONLY at the moment a real WhatsApp OTP was verified for that literal phone
-- number (app/api/auth/phone-otp/verify/route.ts, using
-- buyerOtpStore record.phone -- the one value in this system that is
-- genuinely proof of a completed OTP challenge, independent of any mutable
-- database column). The existing `phone` claim is left untouched everywhere
-- (other code reads it for display) -- this migration only changes which
-- claim the two RPCs check.
--
-- Every session-mint/remint path that is NOT the real OTP-verify flow
-- (switch-buyer, workspaces/enter, the switch-context "verified" picker
-- shortcut, mintBuyerHandoffLink used from those non-OTP paths) must never
-- set or derive otp_verified_phone -- see the companion TS changes in this
-- commit (src/lib/server/buyer-access.ts, src/lib/server/buyer-otp-store.ts,
-- app/api/auth/phone-otp/verify/route.ts, app/api/auth/phone-otp/select-context/route.ts)
-- for how that's enforced. Empirically confirmed on yukti-dev (disposable
-- test users, cleaned up) that this project's @supabase/supabase-js@^2.39.0
-- + GoTrue backend MERGES user_metadata on updateUserById (unknown keys not
-- included in a given call's payload survive), so call sites that never
-- reference otp_verified_phone in their payload cannot wipe it -- this
-- differs from the "full replace" assumption in the review brief; see the
-- fix report for the exact repro. A missing/blank otp_verified_phone claim
-- still fails closed in the RPCs below, matching the existing pattern (a
-- session that never went through a real OTP verify, e.g. seller-only users
-- or accounts predating this fix, simply gets phone_identity_mismatch).
--
-- Also fixes the two Important/Minor normalization findings from the same
-- review round:
--   - The identity check normalized both sides for comparison, but the
--     data-lookup query still did raw `b.phone = p_phone` equality -- a
--     non-normalized p_phone could pass the identity gate yet match zero
--     rows downstream. p_phone is now normalized once into a local variable
--     and that normalized value is used consistently for BOTH the identity
--     check and the data-lookup query (normalizing the stored b.phone
--     column too, since it is not guaranteed to already be in normalized
--     form).
--   - app.normalize_indian_phone collapses any all-non-digit input (e.g.
--     '-', 'unknown') to '' , so two garbage values could spuriously compare
--     equal. p_phone's normalized form is now explicitly rejected as
--     phone_required (22023) when it normalizes to '', before it ever
--     reaches a comparison.

-- =====================================================================
-- 0. app.otp_sessions: track whether a 'verified' handoff record was
--    produced by an actual OTP-verify flow, or by the no-fresh-OTP
--    switch-context shortcut (writeVerifiedCandidatesRecord is shared by
--    both). select-context needs this to decide whether it may stamp
--    otp_verified_phone on session mint. Defaults to false so every
--    pre-existing row (all switch-context-originated, since 'pending'
--    records don't use this column at all) is treated as untrusted.
-- =====================================================================
ALTER TABLE "app"."otp_sessions" ADD COLUMN IF NOT EXISTS "otp_verified" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "app"."otp_sessions"."otp_verified" IS
  'True only for a verified-kind record written immediately after a real OTP hash check succeeded (phone-otp/verify route). False for records written by the switch-context shortcut, which derives phone from a mutable app.buyers.phone lookup, not a fresh OTP. select-context uses this to gate whether otp_verified_phone may be stamped at mint time.';

-- =====================================================================
-- 1. app.find_existing_profiles_for_phone -- OTP-anchor + normalization
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
  v_jwt_phone text := auth.jwt() -> 'user_metadata' ->> 'otp_verified_phone';
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

-- =====================================================================
-- 2. app.check_document_reuse_candidate -- OTP-anchor + normalization
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

    -- Same OTP-anchor fix as find_existing_profiles_for_phone above.
    v_jwt_phone := auth.jwt() -> 'user_metadata' ->> 'otp_verified_phone';

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
