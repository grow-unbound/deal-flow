-- Read-only dry run for buyer-app engagement backfill from enabled buyers'
-- estimates between 2026-04-01 and 2026-07-24 (inclusive).
--
-- Requested payload:
--   - event_source = 'route/estimate'
--   - qualified_for_engagement = 'yes'
--   - occurred_day = estimate_date
--   - emit 2 events per qualifying estimate:
--       * estimate_created
--       * catalog_viewed
--   - external_ref = estimate.external_ref
--
-- Reconciliation intent:
--   1. Start from buyer-app-enabled buyers.
--   2. Count how many of them have estimates in the window.
--   3. Count how many of those estimates have is_buyer_app_estimate = true.
--   4. Compare the trailing-90-day demand-buyer count with the dashboard's
--      "customers_submitting_app_demand" logic (union of buyer-app estimates
--      and buyer-app orders).
--
-- Important validation note:
--   The current app.buyer_app_activity table does NOT accept
--   event_source = 'route/estimate' (allowed values are route|estimate|order),
--   and external_ref is unique per tenant. Since this payload emits two rows per
--   estimate with the same external_ref, this file intentionally produces a
--   candidate set plus conflict diagnostics, not a direct INSERT.
--
-- Safe to run with:
--   npx supabase db query --linked --file scripts/sql/buyer-app-estimate-engagement-backfill-dry-run.sql

WITH params AS (
  SELECT
    DATE '2026-04-01' AS start_day,
    DATE '2026-07-24' AS end_day,
    DATE '2026-04-26' AS horizon_start
), enabled_buyers AS (
  SELECT
    b.tenant_id,
    b.id AS buyer_id
  FROM app.buyers b
  WHERE b.deleted_at IS NULL
    AND b.is_active
    AND b.buyer_app_enabled
), qualifying_estimates AS (
  SELECT
    e.id AS estimate_id,
    e.tenant_id,
    e.buyer_id,
    e.location_id,
    e.estimate_number,
    e.external_ref,
    e.estimate_date,
    e.created_at,
    e.source,
    e.is_buyer_app_estimate
  FROM app.estimates e
  JOIN enabled_buyers eb
    ON eb.tenant_id = e.tenant_id
   AND eb.buyer_id = e.buyer_id
  CROSS JOIN params p
  WHERE e.deleted_at IS NULL
    AND e.buyer_id IS NOT NULL
    AND e.estimate_date BETWEEN p.start_day AND p.end_day
    AND e.is_buyer_app_estimate
), requested_events AS (
  SELECT
    qe.tenant_id,
    qe.buyer_id,
    qe.location_id,
    ev.event_name,
    'route/estimate'::text AS event_source,
    'yes'::text AS qualified_for_engagement,
    qe.estimate_date AS occurred_day,
    qe.external_ref,
    qe.estimate_id,
    qe.estimate_number,
    qe.created_at,
    qe.source,
    qe.is_buyer_app_estimate
  FROM qualifying_estimates qe
  CROSS JOIN (
    VALUES ('estimate_created'::text), ('catalog_viewed'::text)
  ) AS ev(event_name)
), duplicate_requested_external_refs AS (
  SELECT
    tenant_id,
    external_ref,
    COUNT(*) AS row_count
  FROM requested_events
  WHERE external_ref IS NOT NULL
  GROUP BY tenant_id, external_ref
  HAVING COUNT(*) > 1
), existing_external_ref_conflicts AS (
  SELECT
    re.tenant_id,
    re.external_ref,
    COUNT(*) AS requested_rows,
    COUNT(baa.id) AS existing_rows
  FROM requested_events re
  JOIN app.buyer_app_activity baa
    ON baa.tenant_id = re.tenant_id
   AND baa.external_ref = re.external_ref
  WHERE re.external_ref IS NOT NULL
  GROUP BY re.tenant_id, re.external_ref
), enabled_buyers_with_any_estimate AS (
  SELECT DISTINCT
    e.tenant_id,
    e.buyer_id
  FROM app.estimates e
  JOIN enabled_buyers eb
    ON eb.tenant_id = e.tenant_id
   AND eb.buyer_id = e.buyer_id
  CROSS JOIN params p
  WHERE e.deleted_at IS NULL
    AND e.estimate_date BETWEEN p.start_day AND p.end_day
), enabled_buyers_with_buyer_app_estimate AS (
  SELECT DISTINCT
    qe.tenant_id,
    qe.buyer_id
  FROM qualifying_estimates qe
), demand_buyers_90d AS (
  SELECT DISTINCT
    demand.tenant_id,
    demand.buyer_id
  FROM (
    SELECT
      o.tenant_id,
      o.buyer_id
    FROM app.orders o
    CROSS JOIN params p
    WHERE o.deleted_at IS NULL
      AND o.is_buyer_app_order
      AND o.order_date BETWEEN p.horizon_start AND p.end_day

    UNION

    SELECT
      e.tenant_id,
      e.buyer_id
    FROM app.estimates e
    CROSS JOIN params p
    WHERE e.deleted_at IS NULL
      AND e.is_buyer_app_estimate
      AND e.estimate_date BETWEEN p.horizon_start AND p.end_day
  ) AS demand
  JOIN enabled_buyers eb
    ON eb.tenant_id = demand.tenant_id
   AND eb.buyer_id = demand.buyer_id
), engagement_buyers_90d AS (
  SELECT DISTINCT
    a.tenant_id,
    a.buyer_id
  FROM app.buyer_app_activity a
  CROSS JOIN params p
  WHERE a.deleted_at IS NULL
    AND a.qualifies_for_engagement
    AND a.occurred_day BETWEEN p.horizon_start AND p.end_day
)
SELECT
  tenant_ids.tenant_id,
  (SELECT COUNT(*) FROM enabled_buyers eb WHERE eb.tenant_id = tenant_ids.tenant_id) AS enabled_buyers,
  (SELECT COUNT(*) FROM enabled_buyers_with_any_estimate awae WHERE awae.tenant_id = tenant_ids.tenant_id) AS enabled_buyers_with_any_estimate_since_apr1,
  (SELECT COUNT(*) FROM enabled_buyers_with_buyer_app_estimate awab WHERE awab.tenant_id = tenant_ids.tenant_id) AS enabled_buyers_with_buyer_app_estimate_since_apr1,
  (SELECT COUNT(*) FROM demand_buyers_90d db90 WHERE db90.tenant_id = tenant_ids.tenant_id) AS enabled_buyers_submitting_app_demand_90d,
  (SELECT COUNT(*) FROM engagement_buyers_90d eb90 WHERE eb90.tenant_id = tenant_ids.tenant_id) AS buyers_with_engagement_activity_90d,
  (SELECT COUNT(*) FROM qualifying_estimates qe WHERE qe.tenant_id = tenant_ids.tenant_id) AS buyer_app_estimate_rows_since_apr1,
  (SELECT COUNT(*) FROM qualifying_estimates qe CROSS JOIN params p WHERE qe.tenant_id = tenant_ids.tenant_id AND qe.estimate_date >= p.horizon_start) AS buyer_app_estimate_rows_90d,
  (SELECT COUNT(*) FROM qualifying_estimates qe WHERE qe.tenant_id = tenant_ids.tenant_id AND qe.external_ref IS NULL) AS buyer_app_estimate_rows_with_null_external_ref,
  (SELECT COUNT(*) FROM duplicate_requested_external_refs drer WHERE drer.tenant_id = tenant_ids.tenant_id) AS duplicate_requested_external_ref_keys,
  (SELECT COUNT(*) FROM existing_external_ref_conflicts eerc WHERE eerc.tenant_id = tenant_ids.tenant_id) AS existing_external_ref_conflict_keys,
  (SELECT COUNT(*) FROM requested_events re WHERE re.tenant_id = tenant_ids.tenant_id) AS candidate_event_count,
  (SELECT COUNT(*) FROM requested_events re WHERE re.tenant_id = tenant_ids.tenant_id) AS rows_rejected_by_event_source_check
FROM (
  SELECT DISTINCT tenant_id FROM enabled_buyers
) AS tenant_ids
ORDER BY tenant_ids.tenant_id;

WITH params AS (
  SELECT
    DATE '2026-04-01' AS start_day,
    DATE '2026-07-24' AS end_day
), enabled_buyers AS (
  SELECT
    b.tenant_id,
    b.id AS buyer_id
  FROM app.buyers b
  WHERE b.deleted_at IS NULL
    AND b.is_active
    AND b.buyer_app_enabled
), qualifying_estimates AS (
  SELECT
    e.id AS estimate_id,
    e.tenant_id,
    e.buyer_id,
    e.location_id,
    e.estimate_number,
    e.external_ref,
    e.estimate_date,
    e.created_at,
    e.source,
    e.is_buyer_app_estimate
  FROM app.estimates e
  JOIN enabled_buyers eb
    ON eb.tenant_id = e.tenant_id
   AND eb.buyer_id = e.buyer_id
  CROSS JOIN params p
  WHERE e.deleted_at IS NULL
    AND e.buyer_id IS NOT NULL
    AND e.estimate_date BETWEEN p.start_day AND p.end_day
    AND e.is_buyer_app_estimate
), requested_events AS (
  SELECT
    qe.tenant_id,
    qe.buyer_id,
    qe.location_id,
    ev.event_name,
    'route/estimate'::text AS event_source,
    'yes'::text AS qualified_for_engagement,
    qe.estimate_date AS occurred_day,
    qe.external_ref,
    qe.estimate_id,
    qe.estimate_number,
    qe.created_at,
    qe.source,
    qe.is_buyer_app_estimate
  FROM qualifying_estimates qe
  CROSS JOIN (
    VALUES ('estimate_created'::text), ('catalog_viewed'::text)
  ) AS ev(event_name)
)
SELECT
  re.tenant_id,
  re.buyer_id,
  re.location_id,
  re.event_name,
  re.event_source,
  re.qualified_for_engagement,
  re.occurred_day,
  re.external_ref,
  re.estimate_id,
  re.estimate_number,
  re.created_at,
  re.source,
  re.is_buyer_app_estimate
FROM requested_events re
ORDER BY re.tenant_id, re.buyer_id, re.occurred_day DESC, re.estimate_id, re.event_name;
