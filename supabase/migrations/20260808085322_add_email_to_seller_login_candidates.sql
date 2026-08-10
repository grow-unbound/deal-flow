-- Add email to find_seller_candidates_by_phone so the seller multi-account
-- login picker can disambiguate accounts that share a phone number.
-- DROP first: Postgres rejects CREATE OR REPLACE when the RETURNS TABLE
-- column set changes (even by addition).
DROP FUNCTION IF EXISTS "public"."find_seller_candidates_by_phone"("text");

CREATE FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text")
RETURNS TABLE("user_id" "uuid", "tenant_id" "uuid", "tenant_name" "text", "tenant_slug" "text", "role" "text", "location_ids" "uuid"[], "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'app', 'auth'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    tu.user_id,
    tu.tenant_id,
    t.business_name AS tenant_name,
    t.slug          AS tenant_slug,
    tu.role,
    tu.location_ids,
    u.email::text
  FROM app.tenant_users tu
  JOIN app.tenants t ON t.id = tu.tenant_id
  JOIN auth.users u  ON u.id = tu.user_id
  WHERE (u.raw_user_meta_data ->> 'phone') = p_phone
    AND tu.is_active = true;
END;
$$;

ALTER FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_seller_candidates_by_phone"("p_phone" "text") TO "service_role";
