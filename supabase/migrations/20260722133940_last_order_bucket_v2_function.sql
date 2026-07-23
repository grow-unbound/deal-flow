-- 4-way last-sale bucket for the new fixed buyer filters (Cohorts, Campaign-buyers).
-- Distinct from app.derive_last_order_bucket, which conflates "never ordered" (NULL) and
-- "dormant 90+ days" into one bucket. Do not edit the original in place -- other call sites
-- (dashboards, existing cohort rule evaluation) depend on its current 3-way shape; only the
-- new v2 automatic-membership evaluation functions call this one.

CREATE OR REPLACE FUNCTION "app"."derive_last_order_bucket_v2"("p_last_order_at" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_last_order_at IS NULL                       THEN 'never_ordered'
    WHEN p_last_order_at >= now() - INTERVAL '30 days'  THEN 'within_30_days'
    WHEN p_last_order_at >= now() - INTERVAL '90 days'  THEN 'within_90_days'
    ELSE 'dormant_90_plus_days'
  END;
$$;

ALTER FUNCTION "app"."derive_last_order_bucket_v2"(timestamp with time zone) OWNER TO "postgres";

-- Sales-90d bucket for the fixed buyer filter: reuses derive_gmv_90d_bucket's boundaries,
-- relabeled to the None/Low/Medium/High scale requested for the buyer-filter UI.
CREATE OR REPLACE FUNCTION "app"."derive_sales_90d_level"("p_gmv" numeric) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE "app"."derive_gmv_90d_bucket"(p_gmv)
    WHEN 'gmv_0' THEN 'none'
    WHEN 'gmv_1_50000' THEN 'low'
    WHEN 'gmv_50001_200000' THEN 'medium'
    ELSE 'high'
  END;
$$;

ALTER FUNCTION "app"."derive_sales_90d_level"(numeric) OWNER TO "postgres";

-- Buyer App status bucket for the fixed buyer filter, per the locked-in rule:
-- is_active=false -> inactive; is_active=true & buyer_app_enabled=true -> enabled;
-- is_active=true & buyer_app_enabled=false -> not_enabled. Free-text `status` column ignored.
CREATE OR REPLACE FUNCTION "app"."derive_buyer_app_status"("p_is_active" boolean, "p_buyer_app_enabled" boolean) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN NOT COALESCE(p_is_active, false) THEN 'inactive'
    WHEN COALESCE(p_buyer_app_enabled, false) THEN 'enabled'
    ELSE 'not_enabled'
  END;
$$;

ALTER FUNCTION "app"."derive_buyer_app_status"(boolean, boolean) OWNER TO "postgres";
