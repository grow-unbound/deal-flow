-- v1 lineage found while auditing metrics_product_snapshot's readers
-- (outside the original "v2/v3" sunset scope, same dead-code shape).
-- Confirmed dead via the same four checks as the v2 sweep: no app/src
-- caller, no other live app.* function calls it, no pg_cron job, no
-- enabled trigger.

DROP FUNCTION IF EXISTS app.get_seller_category_landing_page_metrics_v1(p_tenant_id uuid, p_category_ids uuid[], p_current_start date, p_current_end_exclusive date, p_previous_start date, p_previous_end_exclusive date, p_velocity_start date);
DROP FUNCTION IF EXISTS app.get_seller_category_landing_summary_v1(p_tenant_id uuid, p_current_start date, p_current_end_exclusive date, p_previous_start date, p_previous_end_exclusive date);
