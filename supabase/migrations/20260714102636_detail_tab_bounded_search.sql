set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function app.search_brand_buyers(
  p_tenant_id uuid,
  p_brand_id uuid,
  p_query text default null,
  p_segment text default null,
  p_sort text default 'spend_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  buyer_id uuid,
  buyer_name text,
  city text,
  cohort_label text,
  is_active boolean,
  spend numeric,
  orders bigint,
  last_order_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
  with query_terms as materialized (
    select
      case when nullif(btrim(p_query), '') is null then null
           else websearch_to_tsquery('english', btrim(p_query)) end as exact_query,
      case when prefix_text is null then null else to_tsquery('english', prefix_text) end as prefix_query
    from (
      select string_agg(quote_literal(lexeme) || ':*', ' & ' order by lexeme) as prefix_text
      from unnest(tsvector_to_array(to_tsvector('english', coalesce(nullif(btrim(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), candidate_buyers as materialized (
    select b.id, b.business_name, b.geography, b.tier, b.is_active
    from app.buyers b
    cross join query_terms q
    where b.tenant_id = p_tenant_id
      and b.deleted_at is null
      and (q.exact_query is null or b.search_vector @@ q.exact_query or b.search_vector @@ q.prefix_query)
      and (
        nullif(p_segment, '') is null
        or (p_segment = 'active' and b.is_active)
        or (p_segment like 'tier_%' and lower(coalesce(b.tier, '')) = substr(p_segment, 6))
      )
  ), metrics as materialized (
    select
      o.buyer_id,
      sum(coalesce(oi.line_total, coalesce(oi.qty, 0) * coalesce(oi.unit_price, 0)))::numeric as spend,
      count(distinct o.id)::bigint as orders,
      max(coalesce(o.order_date, o.placed_at, o.created_at)) as last_order_at
    from app.tenant_products tp
    join app.order_items oi
      on oi.tenant_product_id = tp.id
     and oi.deleted_at is null
    join app.orders o
      on o.id = oi.order_id
     and o.tenant_id = p_tenant_id
     and o.deleted_at is null
     and o.status <> 'cancelled'
    join candidate_buyers b on b.id = o.buyer_id
    where tp.tenant_id = p_tenant_id
      and tp.tenant_brand_id = p_brand_id
      and tp.deleted_at is null
    group by o.buyer_id
  ), filtered as materialized (
    select
      b.id as buyer_id,
      b.business_name as buyer_name,
      coalesce(b.geography ->> 'city', b.geography ->> 'state', '') as city,
      case when b.tier is null then '—' else 'Tier ' || b.tier end as cohort_label,
      b.is_active,
      m.spend,
      m.orders,
      m.last_order_at
    from metrics m
    join candidate_buyers b on b.id = m.buyer_id
  )
  select
    f.buyer_id,
    f.buyer_name,
    f.city,
    f.cohort_label,
    f.is_active,
    f.spend,
    f.orders,
    f.last_order_at,
    count(*) over ()::bigint as total_count
  from filtered f
  order by
    case when p_sort = 'spend_asc' then f.spend end asc,
    case when p_sort = 'orders_desc' then f.orders end desc,
    case when p_sort not in ('spend_asc', 'orders_desc') then f.spend end desc,
    f.buyer_name asc,
    f.buyer_id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function app.search_catalog_buyers(
  p_tenant_id uuid,
  p_catalog_id uuid,
  p_query text default null,
  p_status text default null,
  p_sort text default 'gmv_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  buyer_id uuid,
  buyer_name text,
  city text,
  cohort_label text,
  opened_status text,
  spend numeric,
  conversions bigint,
  last_opened_at timestamptz,
  last_conversion_at timestamptz,
  total_count bigint,
  opens_count bigint,
  converted_count bigint,
  attributed_gmv numeric
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
  with query_terms as materialized (
    select
      case when nullif(btrim(p_query), '') is null then null
           else websearch_to_tsquery('english', btrim(p_query)) end as exact_query,
      case when prefix_text is null then null else to_tsquery('english', prefix_text) end as prefix_query
    from (
      select string_agg(quote_literal(lexeme) || ':*', ' & ' order by lexeme) as prefix_text
      from unnest(tsvector_to_array(to_tsvector('english', coalesce(nullif(btrim(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), catalog as materialized (
    select c.id, c.scope_type, c.scope_value
    from app.campaigns c
    where c.id = p_catalog_id
      and c.tenant_id = p_tenant_id
      and c.deleted_at is null
  ), audience_ids as materialized (
    select b.id
    from catalog c
    join app.buyers b
      on b.tenant_id = p_tenant_id
     and b.deleted_at is null
    cross join query_terms q
    where (c.scope_type <> 'all' or b.is_active)
      and (q.exact_query is null or b.search_vector @@ q.exact_query or b.search_vector @@ q.prefix_query)
      and (c.scope_type = 'all'
       or (c.scope_type = 'buyer' and (
         b.id::text = c.scope_value ->> 'buyer_id'
         or b.id::text in (select jsonb_array_elements_text(coalesce(c.scope_value -> 'buyer_ids', '[]'::jsonb)))
       ))
       or (c.scope_type = 'geography' and (
         coalesce(b.geography ->> 'city', '') = coalesce(c.scope_value ->> 'city', c.scope_value ->> 'value', '')
         or coalesce(b.geography ->> 'state', '') = coalesce(c.scope_value ->> 'state', c.scope_value ->> 'value', '')
       )))
    union
    select cm.buyer_id
    from catalog c
    join app.cohort_members cm
      on cm.cohort_id::text = c.scope_value ->> 'cohort_id'
    join app.buyers b
      on b.id = cm.buyer_id
     and b.tenant_id = p_tenant_id
     and b.deleted_at is null
    cross join query_terms q
    where c.scope_type = 'cohort'
      and (q.exact_query is null or b.search_vector @@ q.exact_query or b.search_vector @@ q.prefix_query)
  ), views as materialized (
    select cv.buyer_id, max(cv.viewed_at) as last_opened_at
    from app.campaign_views cv
    join audience_ids a on a.id = cv.buyer_id
    where cv.tenant_id = p_tenant_id
      and cv.campaign_id = p_catalog_id
      and cv.deleted_at is null
    group by cv.buyer_id
  ), conversions as materialized (
    select x.buyer_id,
           count(*)::bigint as conversions,
           sum(x.amount)::numeric as spend,
           max(x.converted_at) as last_conversion_at
    from (
      select o.id, o.buyer_id,
             sum(coalesce(oi.line_total, coalesce(oi.qty, 0) * coalesce(oi.unit_price, 0)))::numeric as amount,
             max(coalesce(o.order_date, o.placed_at, o.created_at)) as converted_at
      from app.orders o
      join audience_ids a on a.id = o.buyer_id
      join app.order_items oi on oi.order_id = o.id and oi.deleted_at is null
      join app.campaign_items ci on ci.campaign_id = p_catalog_id and ci.tenant_product_id = oi.tenant_product_id and ci.deleted_at is null
      where o.tenant_id = p_tenant_id and o.campaign_id = p_catalog_id
        and o.deleted_at is null and o.status <> 'cancelled'
      group by o.id, o.buyer_id
      union all
      select e.id, e.buyer_id,
             sum(coalesce(ei.line_total, coalesce(ei.qty, 0) * coalesce(ei.unit_price, 0)))::numeric as amount,
             max(coalesce(e.estimate_date, e.created_at)) as converted_at
      from app.estimates e
      join audience_ids a on a.id = e.buyer_id
      join app.estimate_items ei on ei.estimate_id = e.id and ei.deleted_at is null
      join app.campaign_items ci on ci.campaign_id = p_catalog_id and ci.tenant_product_id = ei.tenant_product_id and ci.deleted_at is null
      where e.tenant_id = p_tenant_id and e.campaign_id = p_catalog_id
        and e.deleted_at is null and e.status not in ('pending', 'void')
        and e.converted_to_order_id is null
      group by e.id, e.buyer_id
    ) x
    group by x.buyer_id
  ), scoped as materialized (
    select
      b.id as buyer_id,
      b.business_name as buyer_name,
      coalesce(b.geography ->> 'city', b.geography ->> 'state', '') as city,
      coalesce(ch.name, case when c.scope_type = 'all' then 'All buyers' else 'Targeted buyers' end) as cohort_label,
      case when coalesce(cv.conversions, 0) > 0 then 'Converted'
           when v.last_opened_at is not null then 'Opened'
           else 'Not yet' end as opened_status,
      coalesce(cv.spend, 0)::numeric as spend,
      coalesce(cv.conversions, 0)::bigint as conversions,
      v.last_opened_at,
      cv.last_conversion_at
    from audience_ids a
    join app.buyers b on b.id = a.id
    cross join catalog c
    left join app.cohorts ch on ch.id::text = c.scope_value ->> 'cohort_id' and ch.deleted_at is null
    left join views v on v.buyer_id = b.id
    left join conversions cv on cv.buyer_id = b.id
  ), filtered as materialized (
    select * from scoped
    where nullif(p_status, '') is null or lower(replace(opened_status, ' ', '_')) = p_status
  ), totals as materialized (
    select
      count(*) filter (where opened_status <> 'Not yet')::bigint as opens_count,
      count(*) filter (where opened_status = 'Converted')::bigint as converted_count,
      coalesce(sum(spend), 0)::numeric as attributed_gmv
    from filtered
  )
  select
    f.buyer_id, f.buyer_name, f.city, f.cohort_label, f.opened_status,
    f.spend, f.conversions, f.last_opened_at, f.last_conversion_at,
    count(*) over ()::bigint, t.opens_count, t.converted_count, t.attributed_gmv
  from filtered f
  cross join totals t
  order by
    case when p_sort = 'conversions_desc' then f.conversions end desc,
    case when p_sort = 'recently_opened' then f.last_opened_at end desc nulls last,
    case when p_sort = 'name_asc' then f.buyer_name end asc,
    case when p_sort not in ('conversions_desc', 'recently_opened', 'name_asc') then f.spend end desc,
    f.buyer_name asc,
    f.buyer_id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function app.search_warehouse_stock(
  p_tenant_id uuid,
  p_warehouse_id uuid,
  p_query text default null,
  p_statuses text[] default null,
  p_sort text default 'product_asc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  tenant_product_id uuid,
  sku text,
  product_name text,
  brand_name text,
  qty_available numeric,
  qty_reserved numeric,
  sellable_units numeric,
  reorder_point numeric,
  stock_status text,
  last_updated timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
  with query_terms as materialized (
    select
      case when nullif(btrim(p_query), '') is null then null
           else websearch_to_tsquery('english', btrim(p_query)) end as exact_query,
      case when prefix_text is null then null else to_tsquery('english', prefix_text) end as prefix_query
    from (
      select string_agg(quote_literal(lexeme) || ':*', ' & ' order by lexeme) as prefix_text
      from unnest(tsvector_to_array(to_tsvector('english', coalesce(nullif(btrim(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), hydrated as materialized (
    select
      tp.id as tenant_product_id,
      tp.internal_sku as sku,
      coalesce(nullif(tp.name_override, ''), cp.name, tp.internal_sku) as product_name,
      coalesce(nullif(tb.display_name_override, ''), cb.name, '—') as brand_name,
      coalesce(i.qty_available, 0)::numeric as qty_available,
      coalesce(i.qty_reserved, 0)::numeric as qty_reserved,
      greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0)::numeric as sellable_units,
      i.reorder_point::numeric,
      case when greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0) <= 0 then 'out_of_stock'
           when i.reorder_point is not null and greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0) <= i.reorder_point then 'low_stock'
           else 'clear' end as stock_status,
      i.updated_at as last_updated
    from app.tenant_inventory i
    join app.tenant_products tp
      on tp.id = i.tenant_product_id
     and tp.tenant_id = p_tenant_id
     and tp.deleted_at is null
    left join catalog.products cp on cp.id = tp.master_product_id
    left join app.tenant_brands tb on tb.id = tp.tenant_brand_id and tb.deleted_at is null
    left join catalog.brands cb on cb.id = tb.master_brand_id
    cross join query_terms q
    where i.warehouse_id = p_warehouse_id
      and i.deleted_at is null
      and (q.exact_query is null or tp.search_vector @@ q.exact_query or tp.search_vector @@ q.prefix_query)
      and exists (
        select 1 from app.warehouses w
        where w.id = p_warehouse_id and w.tenant_id = p_tenant_id and w.deleted_at is null
      )
  ), filtered as materialized (
    select h.* from hydrated h
    where coalesce(cardinality(p_statuses), 0) = 0 or h.stock_status = any(p_statuses)
  )
  select
    f.tenant_product_id, f.sku, f.product_name, f.brand_name,
    f.qty_available, f.qty_reserved, f.sellable_units, f.reorder_point,
    f.stock_status, f.last_updated, count(*) over ()::bigint
  from filtered f
  order by
    case when p_sort = 'on_hand_desc' then f.qty_available end desc,
    case when p_sort = 'reserved_desc' then f.qty_reserved end desc,
    case when p_sort = 'sellable_desc' then f.sellable_units end desc,
    case when p_sort = 'reorder_asc' then f.reorder_point end asc nulls last,
    case when p_sort not in ('on_hand_desc', 'reserved_desc', 'sellable_desc', 'reorder_asc') then f.product_name end asc,
    f.tenant_product_id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function app.search_brand_buyers(uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function app.search_catalog_buyers(uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function app.search_warehouse_stock(uuid, uuid, text, text[], text, integer, integer) from public, anon, authenticated;
grant execute on function app.search_brand_buyers(uuid, uuid, text, text, text, integer, integer) to service_role;
grant execute on function app.search_catalog_buyers(uuid, uuid, text, text, text, integer, integer) to service_role;
grant execute on function app.search_warehouse_stock(uuid, uuid, text, text[], text, integer, integer) to service_role;
