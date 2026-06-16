-- Bridges auth.users phone metadata → tenant_users without a denormalised column.
-- Called by supabaseAdmin (service_role) only; never by end-user sessions.
CREATE OR REPLACE FUNCTION public.find_seller_candidates_by_phone(p_phone text)
RETURNS TABLE (
  user_id      uuid,
  tenant_id    uuid,
  tenant_name  text,
  tenant_slug  text,
  role         text,
  location_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tu.user_id,
    tu.tenant_id,
    t.business_name AS tenant_name,
    t.slug          AS tenant_slug,
    tu.role,
    tu.location_ids
  FROM app.tenant_users tu
  JOIN app.tenants t ON t.id = tu.tenant_id
  JOIN auth.users u  ON u.id = tu.user_id
  WHERE (u.raw_user_meta_data ->> 'phone') = p_phone
    AND tu.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_seller_candidates_by_phone(text) TO service_role;
