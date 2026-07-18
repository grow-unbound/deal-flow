create or replace function app.get_catalog_landing_metrics(
  p_tenant_id uuid,
  p_campaign_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date,
  p_include_orders boolean default true,
  p_include_estimates boolean default true,
  p_include_summary boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, app
set statement_timeout = '10s'
set lock_timeout = '2s'
as $function$
with campaign_base as (
  select
    c.id,
    c.name,
    c.scope_type,
    c.scope_value,
    c.valid_to,
    c.status,
    c.created_at,
    case c.scope_type
      when 'cohort' then coalesce(co.name, 'Unknown cohort')
      when 'buyer' then 'Selected buyers'
      when 'geography' then 'Geography filter'
      else 'All buyers'
    end as audience_label,
    case c.scope_type
      when 'cohort' then coalesce(co.cached_member_count, 0)::bigint
      when 'buyer' then case
        when jsonb_typeof(c.scope_value -> 'buyer_ids') = 'array'
          then jsonb_array_length(c.scope_value -> 'buyer_ids')::bigint
        when jsonb_typeof(c.scope_value -> 'buyer_id') = 'string' then 1::bigint
        else 0::bigint
      end
      when 'geography' then null::bigint
      else buyer_totals.active_count
    end as audience_count
  from app.campaigns c
  left join app.cohorts co
    on co.id = case
      when c.scope_type = 'cohort'
        and jsonb_typeof(c.scope_value -> 'cohort_id') = 'string'
        and (c.scope_value ->> 'cohort_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (c.scope_value ->> 'cohort_id')::uuid
      else null
    end
   and co.tenant_id = p_tenant_id
   and co.deleted_at is null
  cross join lateral (
    select count(*)::bigint as active_count
    from app.buyers b
    where b.tenant_id = p_tenant_id
      and b.is_active = true
      and b.deleted_at is null
  ) buyer_totals
  where c.tenant_id = p_tenant_id
    and c.deleted_at is null
    and (p_include_summary or c.id = any(coalesce(p_campaign_ids, array[]::uuid[])))
), page_item_counts as (
  select
    ci.campaign_id,
    count(distinct ci.tenant_product_id)::bigint as products_count,
    count(distinct tp.tenant_brand_id) filter (where tp.tenant_brand_id is not null)::bigint as brands_count
  from app.campaign_items ci
  join app.tenant_products tp
    on tp.id = ci.tenant_product_id
   and tp.tenant_id = p_tenant_id
   and tp.deleted_at is null
  where ci.campaign_id = any(coalesce(p_campaign_ids, array[]::uuid[]))
    and ci.deleted_at is null
  group by ci.campaign_id
), order_docs as (
  select
    o.campaign_id,
    count(*) filter (
      where app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        and app.metric_day_ist(o.order_date, o.created_at) < p_current_end_exclusive
    )::bigint as current_count,
    coalesce(sum(coalesce(o.total_amount, 0)) filter (
      where app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        and app.metric_day_ist(o.order_date, o.created_at) < p_current_end_exclusive
    ), 0)::numeric as current_gmv,
    coalesce(sum(coalesce(o.total_amount, 0)) filter (
      where app.metric_day_ist(o.order_date, o.created_at) >= p_previous_start
        and app.metric_day_ist(o.order_date, o.created_at) < p_previous_end_exclusive
    ), 0)::numeric as previous_gmv
  from app.orders o
  join campaign_base c on c.id = o.campaign_id
  where p_include_orders
    and o.tenant_id = p_tenant_id
    and o.deleted_at is null
    and app.order_status_in_flow(o.status)
    and coalesce(o.total_amount, 0) > 0
    and app.metric_day_ist(o.order_date, o.created_at) >= least(p_current_start, p_previous_start)
    and app.metric_day_ist(o.order_date, o.created_at) < greatest(p_current_end_exclusive, p_previous_end_exclusive)
  group by o.campaign_id
), estimate_docs as (
  select
    e.campaign_id,
    count(*) filter (
      where app.metric_day_ist(e.estimate_date, e.created_at) >= p_current_start
        and app.metric_day_ist(e.estimate_date, e.created_at) < p_current_end_exclusive
    )::bigint as current_count,
    coalesce(sum(coalesce(e.total_amount, 0)) filter (
      where app.metric_day_ist(e.estimate_date, e.created_at) >= p_current_start
        and app.metric_day_ist(e.estimate_date, e.created_at) < p_current_end_exclusive
    ), 0)::numeric as current_gmv,
    coalesce(sum(coalesce(e.total_amount, 0)) filter (
      where app.metric_day_ist(e.estimate_date, e.created_at) >= p_previous_start
        and app.metric_day_ist(e.estimate_date, e.created_at) < p_previous_end_exclusive
    ), 0)::numeric as previous_gmv
  from app.estimates e
  join campaign_base c on c.id = e.campaign_id
  where p_include_estimates
    and e.tenant_id = p_tenant_id
    and e.deleted_at is null
    and (app.estimate_status_is_open(e.status) or e.status = 'accepted')
    and e.converted_to_order_id is null
    and coalesce(e.total_amount, 0) > 0
    and app.metric_day_ist(e.estimate_date, e.created_at) >= least(p_current_start, p_previous_start)
    and app.metric_day_ist(e.estimate_date, e.created_at) < greatest(p_current_end_exclusive, p_previous_end_exclusive)
  group by e.campaign_id
), current_views as (
  select cv.campaign_id, count(distinct cv.buyer_id)::bigint as unique_viewers
  from app.campaign_views cv
  join campaign_base c on c.id = cv.campaign_id
  where cv.tenant_id = p_tenant_id
    and cv.deleted_at is null
    and (cv.viewed_at at time zone 'Asia/Kolkata')::date >= p_current_start
    and (cv.viewed_at at time zone 'Asia/Kolkata')::date < p_current_end_exclusive
  group by cv.campaign_id
), metrics as (
  select
    c.*,
    coalesce(o.current_count, 0)::bigint as order_count,
    coalesce(e.current_count, 0)::bigint as estimate_count,
    (coalesce(o.current_count, 0) + coalesce(e.current_count, 0))::bigint as conversions,
    (coalesce(o.current_gmv, 0) + coalesce(e.current_gmv, 0))::numeric as gmv,
    (coalesce(o.previous_gmv, 0) + coalesce(e.previous_gmv, 0))::numeric as previous_gmv,
    coalesce(v.unique_viewers, 0)::bigint as views,
    coalesce(pic.products_count, 0)::bigint as products_count,
    coalesce(pic.brands_count, 0)::bigint as brands_count
  from campaign_base c
  left join order_docs o on o.campaign_id = c.id
  left join estimate_docs e on e.campaign_id = c.id
  left join current_views v on v.campaign_id = c.id
  left join page_item_counts pic on pic.campaign_id = c.id
), decorated as (
  select
    m.*,
    case
      when m.status = 'draft' then 'Draft'
      when m.status = 'archived' or (m.valid_to is not null and m.valid_to < now()) then 'Ended'
      else 'Live'
    end as display_status,
    case
      when m.previous_gmv > 0 then round(((m.gmv - m.previous_gmv) / m.previous_gmv) * 100)::integer
      when m.gmv > 0 then 100
      else 0
    end as growth_pct,
    case when m.views > 0 then round((m.conversions::numeric / m.views) * 100, 1) else 0 end as conversion_pct,
    case
      when m.audience_count > 0 then round((m.views::numeric / m.audience_count) * 100, 1)
      else 0
    end as view_pct,
    case
      when m.valid_to is not null and m.status = 'published' and m.valid_to >= now()
      then greatest(0, ceil(extract(epoch from (m.valid_to - now())) / 86400))::integer
      else null
    end as days_left
  from metrics m
), page_metrics as (
  select coalesce(jsonb_object_agg(
    d.id::text,
    jsonb_build_object(
      'gmv', d.gmv,
      'previous_gmv', d.previous_gmv,
      'order_count', d.order_count,
      'estimate_count', d.estimate_count,
      'conversions', d.conversions,
      'views', d.views,
      'view_pct', d.view_pct,
      'conversion_pct', d.conversion_pct,
      'growth_pct', d.growth_pct,
      'products_count', d.products_count,
      'brands_count', d.brands_count,
      'audience_label', d.audience_label,
      'audience_count', d.audience_count
    )
  ) filter (where d.id = any(coalesce(p_campaign_ids, array[]::uuid[]))), '{}'::jsonb) as value
  from decorated d
), summary_kpis as (
  select jsonb_build_object(
    'live_catalogs', count(*) filter (where display_status = 'Live'),
    'draft_catalogs', count(*) filter (where display_status = 'Draft'),
    'ended_catalogs', count(*) filter (where display_status = 'Ended'),
    'expiring7d', count(*) filter (where display_status = 'Live' and days_left between 0 and 7),
    'gmv_mtd', coalesce(sum(gmv), 0),
    'gmv_prev_mtd', coalesce(sum(previous_gmv), 0),
    'gmv_growth_pct', case
      when coalesce(sum(previous_gmv), 0) > 0
        then round(((sum(gmv) - sum(previous_gmv)) / sum(previous_gmv)) * 100)::integer
      when coalesce(sum(gmv), 0) > 0 then 100
      else 0
    end,
    'avg_conversion_pct', coalesce(round(avg(conversion_pct) filter (where display_status = 'Live'), 1), 0),
    'orders_attributed_mtd', coalesce(sum(conversions), 0),
    'conversions_mtd', coalesce(sum(conversions), 0)
  ) as value
  from decorated
), callout_candidates as (
  select
    d.*,
    row_number() over (
      order by case when d.display_status in ('Draft', 'Ended') or d.days_left between 1 and 5 then 0 else 1 end,
               d.created_at desc
    ) as attention_rank,
    row_number() over (order by case when d.display_status = 'Live' then 0 else 1 end, d.gmv desc, d.created_at desc) as performer_rank,
    row_number() over (order by d.growth_pct desc, d.created_at desc) as riser_rank
  from decorated d
), callout_rows as (
  select
    c.*,
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'status', jsonb_build_object(
        'value', c.status,
        'label', c.display_status,
        'tone', case c.display_status when 'Live' then 'success' when 'Draft' then 'warning' else 'neutral' end
      ),
      'cohort_name', c.audience_label,
      'gmv', c.gmv,
      'conversions', c.conversions,
      'conversion_pct', c.conversion_pct,
      'valid_to', c.valid_to,
      'days_left', c.days_left,
      'growth_pct', c.growth_pct
    ) as payload
  from callout_candidates c
), summary_callouts as (
  select jsonb_build_object(
    'needs_attention', coalesce(jsonb_agg(c.payload order by c.attention_rank)
      filter (where (c.display_status in ('Draft', 'Ended') or c.days_left between 1 and 5) and c.attention_rank <= 3), '[]'::jsonb),
    'top_performers', coalesce(jsonb_agg(c.payload order by c.performer_rank)
      filter (where c.display_status = 'Live' and c.performer_rank <= 2), '[]'::jsonb),
    'top_risers', coalesce(jsonb_agg(c.payload order by c.riser_rank)
      filter (where c.riser_rank <= 2), '[]'::jsonb)
  ) as value
  from callout_rows c
)
select jsonb_build_object(
  'row_metrics', (select value from page_metrics),
  'summary', case when p_include_summary then jsonb_build_object(
    'kpis', (select value from summary_kpis),
    'todays_read', (select value from summary_callouts)
  ) else null end
);
$function$;

revoke all on function app.get_catalog_landing_metrics(uuid, uuid[], date, date, date, date, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function app.get_catalog_landing_metrics(uuid, uuid[], date, date, date, date, boolean, boolean, boolean) to service_role;
