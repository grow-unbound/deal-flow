-- find_seller_candidates_by_phone previously joined auth.users to match on
-- raw_user_meta_data->>'phone' and read email. auth.users lookups are the
-- expensive path (system table, no useful index on a jsonb ->> expression,
-- plus the admin API calls this pattern encouraged elsewhere). app.tenant_users
-- already carries its own phone/email columns (backfilled per seller) — use
-- those exclusively so this candidate lookup never touches the auth schema.
DROP FUNCTION IF EXISTS "public"."find_seller_candidates_by_phone"("text");

CREATE FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text")
RETURNS TABLE("user_id" "uuid", "tenant_id" "uuid", "tenant_name" "text", "tenant_slug" "text", "role" "text", "location_ids" "uuid"[], "email" "text")
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
    tu.email
  FROM app.tenant_users tu
  JOIN app.tenants t ON t.id = tu.tenant_id
  WHERE tu.phone = p_phone
    AND tu.is_active = true;
$$;

ALTER FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "service_role";
