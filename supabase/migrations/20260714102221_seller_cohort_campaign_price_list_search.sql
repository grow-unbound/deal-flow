CREATE OR REPLACE FUNCTION app.search_seller_landing_entities(
  p_tenant_id uuid,
  p_entity text,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_brand_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  total_count bigint,
  search_rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '10s'
AS $function$
  WITH normalized AS MATERIALIZED (
    SELECT
      NULLIF(btrim(p_query), '') AS query_text,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL::tsquery
        ELSE websearch_to_tsquery('english', btrim(p_query))
      END AS ts_query,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL::tsquery
        ELSE to_tsquery(
          'english',
          (
            SELECT string_agg(token || ':*', ' & ')
            FROM unnest(
              regexp_split_to_array(
                btrim(regexp_replace(lower(p_query), '[^[:alnum:]]+', ' ', 'g')),
                '\s+'
              )
            ) AS token
            WHERE token <> ''
          )
        )
      END AS prefix_ts_query,
      COALESCE(p_statuses, ARRAY[]::text[]) AS statuses,
      COALESCE(p_brand_ids, ARRAY[]::uuid[]) AS brand_ids,
      LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) AS row_limit,
      LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000) AS row_offset,
      statement_timestamp() AS now_at
  ), candidates AS MATERIALIZED (
    SELECT
      c.id,
      c.created_at AS sort_at,
      CASE WHEN n.ts_query IS NULL THEN 0::real ELSE GREATEST(ts_rank_cd(c.search_vector, n.ts_query), ts_rank_cd(c.search_vector, n.prefix_ts_query)) END AS search_rank
    FROM app.cohorts c
    CROSS JOIN normalized n
    WHERE p_entity = 'cohorts'
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (n.ts_query IS NULL OR c.search_vector @@ n.ts_query OR c.search_vector @@ n.prefix_ts_query)
      AND (cardinality(n.brand_ids) = 0 OR c.allowed_tenant_brand_ids && n.brand_ids)

    UNION ALL

    SELECT
      c.id,
      c.created_at AS sort_at,
      CASE WHEN n.ts_query IS NULL THEN 0::real ELSE GREATEST(ts_rank_cd(c.search_vector, n.ts_query), ts_rank_cd(c.search_vector, n.prefix_ts_query)) END AS search_rank
    FROM app.campaigns c
    CROSS JOIN normalized n
    WHERE p_entity = 'campaigns'
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND (n.ts_query IS NULL OR c.search_vector @@ n.ts_query OR c.search_vector @@ n.prefix_ts_query)
      AND (
        cardinality(n.statuses) = 0
        OR ('draft' = ANY(n.statuses) AND c.status = 'draft')
        OR ('live' = ANY(n.statuses) AND c.status = 'published' AND (c.valid_to IS NULL OR c.valid_to >= n.now_at))
        OR ('ended' = ANY(n.statuses) AND (c.status = 'archived' OR (c.status = 'published' AND c.valid_to < n.now_at)))
        OR ('expiring_soon' = ANY(n.statuses) AND c.status = 'published' AND c.valid_to > n.now_at AND c.valid_to <= n.now_at + interval '7 days')
      )

    UNION ALL

    SELECT
      p.id,
      p.updated_at AS sort_at,
      CASE WHEN n.ts_query IS NULL THEN 0::real ELSE GREATEST(ts_rank_cd(p.search_vector, n.ts_query), ts_rank_cd(p.search_vector, n.prefix_ts_query)) END AS search_rank
    FROM app.price_lists p
    CROSS JOIN normalized n
    WHERE p_entity = 'price_lists'
      AND p.tenant_id = p_tenant_id
      AND p.deleted_at IS NULL
      AND (n.ts_query IS NULL OR p.search_vector @@ n.ts_query OR p.search_vector @@ n.prefix_ts_query)
      AND (
        cardinality(n.statuses) = 0
        OR ('active' = ANY(n.statuses) AND p.is_active AND p.valid_from <= n.now_at AND (p.valid_to IS NULL OR p.valid_to >= n.now_at))
        OR ('draft' = ANY(n.statuses) AND (NOT p.is_active OR p.valid_from > n.now_at))
        OR ('expired' = ANY(n.statuses) AND p.valid_to < n.now_at)
      )
  ), totals AS MATERIALIZED (
    SELECT count(*) AS total_count FROM candidates
  ), page AS MATERIALIZED (
    SELECT
      candidates.id,
      candidates.search_rank,
      candidates.sort_at
    FROM candidates
    ORDER BY candidates.search_rank DESC, candidates.sort_at DESC, candidates.id
    LIMIT (SELECT row_limit FROM normalized)
    OFFSET (SELECT row_offset FROM normalized)
  )
  SELECT page.id, totals.total_count, COALESCE(page.search_rank, 0::real)
  FROM totals
  LEFT JOIN page ON true
  ORDER BY page.search_rank DESC, page.sort_at DESC, page.id;
$function$;

REVOKE ALL ON FUNCTION app.search_seller_landing_entities(uuid, text, text, text[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.search_seller_landing_entities(uuid, text, text, text[], uuid[], integer, integer) TO service_role;
