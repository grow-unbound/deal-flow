-- Add full_name (app.tenant_users.full_name, already backfilled per
-- 20260727050540_tenant_users_add_full_name_and_seller_activation_flow.sql)
-- to the seller login-candidate lookup, so the account picker can show a
-- person's name instead of just the tenant name for every seller row.
DROP FUNCTION IF EXISTS "public"."find_seller_candidates_by_phone"("text");

CREATE FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text")
RETURNS TABLE("user_id" "uuid", "tenant_id" "uuid", "tenant_name" "text", "tenant_slug" "text", "role" "text", "location_ids" "uuid"[], "email" "text", "full_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'app'
    AS $$
  SELECT
    tu.user_id,
    tu.tenant_id,
    t.business_name AS tenant_name,
    t.slug           AS tenant_slug,
    tu.role,
    tu.location_ids,
    tu.email,
    tu.full_name
  FROM app.tenant_users tu
  JOIN app.tenants t ON t.id = tu.tenant_id
  WHERE tu.phone = p_phone
    AND tu.is_active = true;
$$;

ALTER FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "service_role";
