DROP FUNCTION IF EXISTS app.find_existing_profiles_for_phone(text, uuid);

CREATE OR REPLACE FUNCTION app.find_existing_profiles_for_phone(
  p_phone text,
  p_exclude_tenant_id uuid
)
RETURNS TABLE (
  buyer_id uuid,
  tenant_id uuid,
  tenant_name text,
  tenant_logo_url text,
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

  v_normalized_phone := app.normalize_indian_phone(p_phone);

  IF v_normalized_phone = '' THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'phone_identity_mismatch' USING ERRCODE = '42501';
  END IF;

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
    COALESCE(
      NULLIF(t.logo_url, ''),
      NULLIF(ts.settings -> 'business' ->> 'logo_url', '')
    ) AS tenant_logo_url,
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
  LEFT JOIN app.tenant_settings ts ON ts.tenant_id = t.id
  WHERE app.normalize_indian_phone(b.phone) = v_normalized_phone
    AND (p_exclude_tenant_id IS NULL OR b.tenant_id <> p_exclude_tenant_id)
    AND b.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.find_existing_profiles_for_phone(text, uuid) TO service_role;
