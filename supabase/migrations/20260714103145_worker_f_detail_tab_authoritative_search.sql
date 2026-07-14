set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function app.search_brand_products_detail(
  p_tenant_id uuid,
  p_brand_id uuid,
  p_query text default null,
  p_stock text default null,
  p_sort text default 'gmv_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  tenant_product_id uuid, product_name text, sku text, category_name text,
  mrp numeric, base_selling_price numeric, cost_price numeric,
  on_hand numeric, days_cover numeric, units_mtd bigint, gmv_mtd numeric,
  growth_pct numeric, total_count bigint
)
language sql stable security definer
set search_path = '' set statement_timeout = '10s'
as $$
  with query_terms as materialized (
    select case when nullif(btrim(p_query), '') is null then null else websearch_to_tsquery('english', btrim(p_query)) end exact_query,
           case when prefix_text is null then null else to_tsquery('english', prefix_text) end prefix_query
    from (select string_agg(quote_literal(lexeme) || ':*', ' & ' order by lexeme) prefix_text
          from unnest(tsvector_to_array(to_tsvector('english', coalesce(nullif(btrim(p_query), ''), '')))) x(lexeme)) p
  ), inventory as materialized (
    select i.tenant_product_id, sum(greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0))::numeric on_hand,
           sum(coalesce(i.reorder_point, 0))::numeric reorder_point
    from app.tenant_inventory i
    join app.tenant_products inventory_product
     on inventory_product.id = i.tenant_product_id
     and inventory_product.tenant_id = p_tenant_id
     and inventory_product.tenant_brand_id = p_brand_id
     and inventory_product.deleted_at is null
    where i.deleted_at is null
    group by i.tenant_product_id
  ), metrics as materialized (
    select k.tenant_product_id,
      coalesce(sum(k.units_sold) filter (where k.day >= date_trunc('month', current_date)::date), 0)::bigint units_mtd,
      coalesce(sum(k.revenue) filter (where k.day >= date_trunc('month', current_date)::date), 0)::numeric gmv_mtd,
      coalesce(sum(k.revenue) filter (where k.day >= (date_trunc('month', current_date) - interval '1 month')::date and k.day < date_trunc('month', current_date)::date), 0)::numeric gmv_prev
    from app.kpi_product_daily k
    join app.tenant_products metric_product
      on metric_product.id = k.tenant_product_id
     and metric_product.tenant_id = p_tenant_id
     and metric_product.tenant_brand_id = p_brand_id
     and metric_product.deleted_at is null
    where k.tenant_id = p_tenant_id and k.deleted_at is null
      and k.day >= (date_trunc('month', current_date) - interval '1 month')::date
    group by k.tenant_product_id
  ), filtered as materialized (
    select tp.id, coalesce(nullif(tp.name_override, ''), cp.name, tp.internal_sku) product_name,
      tp.internal_sku sku, coalesce(nullif(tc.name, ''), cc.name, 'Uncategorized') category_name,
      tp.mrp, tp.base_selling_price, tp.cost_price, coalesce(i.on_hand, 0) on_hand,
      case when coalesce(m.units_mtd, 0) > 0 then round(coalesce(i.on_hand, 0) / (m.units_mtd / greatest(extract(day from current_date)::numeric, 1)), 1) else 0 end days_cover,
      coalesce(m.units_mtd, 0) units_mtd, coalesce(m.gmv_mtd, 0) gmv_mtd,
      case when coalesce(m.gmv_prev, 0) = 0 then 0 else round(((m.gmv_mtd - m.gmv_prev) / m.gmv_prev) * 100, 1) end growth_pct,
      ts_rank_cd(tp.search_vector, coalesce(q.exact_query, q.prefix_query)) rank
    from app.tenant_products tp
    cross join query_terms q
    left join catalog.products cp on cp.id = tp.master_product_id
    left join app.tenant_categories tc on tc.id = tp.tenant_category_id and tc.deleted_at is null
    left join catalog.categories cc on cc.id = tc.master_category_id
    left join inventory i on i.tenant_product_id = tp.id
    left join metrics m on m.tenant_product_id = tp.id
    where tp.tenant_id = p_tenant_id and tp.tenant_brand_id = p_brand_id and tp.deleted_at is null
      and (q.exact_query is null or tp.search_vector @@ q.exact_query or tp.search_vector @@ q.prefix_query)
      and (nullif(p_stock, '') is null
        or (p_stock = 'low_stock' and coalesce(i.on_hand, 0) > 0 and coalesce(i.on_hand, 0) <= greatest(coalesce(i.reorder_point, 0), 0))
        or (p_stock = 'out_of_stock' and coalesce(i.on_hand, 0) <= 0)
        or (p_stock = 'in_stock' and coalesce(i.on_hand, 0) > 0))
  )
  select f.id, f.product_name, f.sku, f.category_name, f.mrp, f.base_selling_price, f.cost_price,
    f.on_hand, f.days_cover, f.units_mtd, f.gmv_mtd, f.growth_pct, count(*) over ()::bigint
  from filtered f
  order by case when nullif(btrim(p_query), '') is not null then f.rank end desc,
    case when p_sort = 'gmv_asc' then f.gmv_mtd end asc,
    case when p_sort = 'growth_desc' then f.growth_pct end desc,
    case when p_sort = 'on_hand_asc' then f.on_hand end asc,
    case when p_sort not in ('gmv_asc', 'growth_desc', 'on_hand_asc') then f.gmv_mtd end desc,
    f.product_name, f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function app.search_brand_catalogs_detail(
  p_tenant_id uuid, p_brand_id uuid, p_query text default null, p_status text default null,
  p_sort text default 'sent_desc', p_limit integer default 50, p_offset integer default 0
)
returns table (campaign_id uuid, campaign_name text, cohort_name text, status text, sent_at timestamptz, gmv numeric, orders bigint, total_count bigint)
language sql stable security definer set search_path = '' set statement_timeout = '10s'
as $$
  with query_terms as materialized (
    select case when nullif(btrim(p_query), '') is null then null else websearch_to_tsquery('english', btrim(p_query)) end exact_query,
      case when prefix_text is null then null else to_tsquery('english', prefix_text) end prefix_query
    from (select string_agg(quote_literal(lexeme) || ':*', ' & ' order by lexeme) prefix_text
      from unnest(tsvector_to_array(to_tsvector('english', coalesce(nullif(btrim(p_query), ''), '')))) x(lexeme)) p
  ), scoped as materialized (
    select distinct c.id, c.name, c.scope_type, c.scope_value, c.status, coalesce(c.valid_from, c.updated_at, c.created_at) sent_at, c.search_vector
    from app.campaigns c
    join app.campaign_items ci on ci.campaign_id = c.id and ci.deleted_at is null
    join app.tenant_products tp on tp.id = ci.tenant_product_id and tp.tenant_id = p_tenant_id and tp.tenant_brand_id = p_brand_id and tp.deleted_at is null
    where c.tenant_id = p_tenant_id and c.deleted_at is null
  ), metrics as materialized (
    select o.campaign_id, count(distinct o.id)::bigint orders,
      coalesce(sum(coalesce(oi.line_total, coalesce(oi.qty,0) * coalesce(oi.unit_price,0))), 0)::numeric gmv
    from app.orders o join app.order_items oi on oi.order_id = o.id and oi.deleted_at is null
    join app.tenant_products tp on tp.id = oi.tenant_product_id and tp.tenant_id = p_tenant_id
      and tp.tenant_brand_id = p_brand_id and tp.deleted_at is null
    where o.tenant_id = p_tenant_id and o.deleted_at is null and o.status <> 'cancelled' and o.campaign_id is not null
      and coalesce(o.order_date, o.created_at) >= date_trunc('month', current_date)
    group by o.campaign_id
  ), filtered as materialized (
    select s.*, coalesce(ch.name, case when s.scope_type = 'all' then 'All buyers' else 'Targeted buyers' end) cohort_name,
      coalesce(m.gmv,0) gmv, coalesce(m.orders,0) orders, ts_rank_cd(s.search_vector, coalesce(q.exact_query,q.prefix_query)) rank
    from scoped s cross join query_terms q
    left join app.cohorts ch on ch.id::text = s.scope_value ->> 'cohort_id' and ch.deleted_at is null
    left join metrics m on m.campaign_id = s.id
    where (q.exact_query is null or s.search_vector @@ q.exact_query or s.search_vector @@ q.prefix_query)
      and (nullif(p_status,'') is null or s.status = p_status)
  )
  select f.id, f.name, f.cohort_name, f.status, f.sent_at, f.gmv, f.orders, count(*) over ()::bigint
  from filtered f order by case when nullif(btrim(p_query),'') is not null then f.rank end desc,
    case when p_sort='sent_asc' then f.sent_at end asc, case when p_sort='gmv_desc' then f.gmv end desc,
    case when p_sort='orders_desc' then f.orders end desc, case when p_sort not in ('sent_asc','gmv_desc','orders_desc') then f.sent_at end desc,
    f.name, f.id
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function app.search_catalog_products_detail(
  p_tenant_id uuid, p_catalog_id uuid, p_query text default null, p_stock text default null,
  p_sort text default 'catalog_order', p_limit integer default 50, p_offset integer default 0
)
returns table (tenant_product_id uuid, product_name text, sku text, brand_name text, mrp numeric, base_selling_price numeric,
  override_price numeric, catalog_order integer, on_hand numeric, days_cover numeric, catalog_units_sold bigint, catalog_gmv numeric,
  item_tag text, total_count bigint)
language sql stable security definer set search_path = '' set statement_timeout = '10s'
as $$
  with query_terms as materialized (
    select case when nullif(btrim(p_query),'') is null then null else websearch_to_tsquery('english',btrim(p_query)) end exact_query,
      case when prefix_text is null then null else to_tsquery('english',prefix_text) end prefix_query
    from (select string_agg(quote_literal(lexeme)||':*',' & ' order by lexeme) prefix_text
      from unnest(tsvector_to_array(to_tsvector('english',coalesce(nullif(btrim(p_query),''),'')))) x(lexeme)) p
  ), inventory as materialized (
    select i.tenant_product_id, sum(greatest(coalesce(i.qty_available,0)-coalesce(i.qty_reserved,0),0))::numeric on_hand,
      sum(coalesce(i.reorder_point,0))::numeric reorder_point
    from app.tenant_inventory i
    join app.tenant_products inventory_product
     on inventory_product.id=i.tenant_product_id
     and inventory_product.tenant_id=p_tenant_id
     and inventory_product.deleted_at is null
    join app.campaign_items inventory_item
      on inventory_item.tenant_product_id=i.tenant_product_id
     and inventory_item.campaign_id=p_catalog_id
     and inventory_item.deleted_at is null
    join app.campaigns inventory_campaign
      on inventory_campaign.id=inventory_item.campaign_id
     and inventory_campaign.tenant_id=p_tenant_id
     and inventory_campaign.deleted_at is null
    where i.deleted_at is null group by i.tenant_product_id
  ), sales as materialized (
    select oi.tenant_product_id, coalesce(sum(oi.qty),0)::bigint units, coalesce(sum(coalesce(oi.line_total,coalesce(oi.qty,0)*coalesce(oi.unit_price,0))),0)::numeric gmv
    from app.orders o join app.order_items oi on oi.order_id=o.id and oi.deleted_at is null
    where o.tenant_id=p_tenant_id and o.campaign_id=p_catalog_id and o.deleted_at is null and o.status<>'cancelled'
      and coalesce(o.order_date,o.created_at)>=date_trunc('month',current_date)
    group by oi.tenant_product_id
  ), filtered as materialized (
    select tp.id, coalesce(nullif(tp.name_override,''),cp.name,tp.internal_sku) product_name, tp.internal_sku sku,
      coalesce(nullif(tb.display_name_override,''),cb.name,'—') brand_name, tp.mrp, tp.base_selling_price, ci.price_override,
      coalesce(ci.display_order,2147483647) catalog_order, coalesce(i.on_hand,0) on_hand,
      case when coalesce(s.units,0)>0 then round(coalesce(i.on_hand,0)/(s.units/greatest(extract(day from current_date)::numeric,1)),1) else 0 end days_cover,
      coalesce(s.units,0) units, coalesce(s.gmv,0) gmv,
      case when ci.is_featured then 'new' when coalesce(i.on_hand,0)>0 and ci.created_at::date=current_date then 'new_stock'
           when coalesce(i.on_hand,0)>0 and coalesce(i.on_hand,0)<=greatest(coalesce(i.reorder_point,0),0) then 'old_stock' else 'none' end item_tag,
      ts_rank_cd(tp.search_vector,coalesce(q.exact_query,q.prefix_query)) rank
    from app.campaign_items ci join app.campaigns c on c.id=ci.campaign_id and c.tenant_id=p_tenant_id and c.deleted_at is null
    join app.tenant_products tp on tp.id=ci.tenant_product_id and tp.tenant_id=p_tenant_id and tp.deleted_at is null
    cross join query_terms q left join catalog.products cp on cp.id=tp.master_product_id
    left join app.tenant_brands tb on tb.id=tp.tenant_brand_id and tb.deleted_at is null left join catalog.brands cb on cb.id=tb.master_brand_id
    left join inventory i on i.tenant_product_id=tp.id left join sales s on s.tenant_product_id=tp.id
    where ci.campaign_id=p_catalog_id and ci.deleted_at is null
      and (q.exact_query is null or tp.search_vector@@q.exact_query or tp.search_vector@@q.prefix_query)
      and (nullif(p_stock,'') is null or (p_stock='in_stock' and coalesce(i.on_hand,0)>0)
        or (p_stock='low_stock' and coalesce(i.on_hand,0)>0 and coalesce(i.on_hand,0)<=greatest(coalesce(i.reorder_point,0),0))
        or (p_stock='out_of_stock' and coalesce(i.on_hand,0)<=0))
  )
  select f.id,f.product_name,f.sku,f.brand_name,f.mrp,f.base_selling_price,f.price_override,f.catalog_order,f.on_hand,f.days_cover,
    f.units,f.gmv,f.item_tag,count(*) over ()::bigint from filtered f
  order by case when nullif(btrim(p_query),'') is not null then f.rank end desc,
    case when p_sort='brand_asc' then f.brand_name end, case when p_sort='units_desc' then f.units end desc,
    case when p_sort='days_cover_asc' then f.days_cover end, case when p_sort not in ('brand_asc','units_desc','days_cover_asc') then f.catalog_order end,
    f.product_name,f.id
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function app.search_cohort_buyers_detail(
  p_tenant_id uuid, p_cohort_id uuid, p_query text default null, p_activity text default null,
  p_sort text default 'spend_desc', p_limit integer default 50, p_offset integer default 0
)
returns table (buyer_id uuid,business_name text,contact_name text,external_ref text,geography_label text,tier text,
  mtd_spend numeric,orders_mtd bigint,aov numeric,credit_used numeric,last_order_at timestamptz,total_count bigint)
language sql stable security definer set search_path='' set statement_timeout='10s'
as $$
  with query_terms as materialized (
    select case when nullif(btrim(p_query),'') is null then null else websearch_to_tsquery('english',btrim(p_query)) end exact_query,
      case when prefix_text is null then null else to_tsquery('english',prefix_text) end prefix_query
    from (select string_agg(quote_literal(lexeme)||':*',' & ' order by lexeme) prefix_text
      from unnest(tsvector_to_array(to_tsvector('english',coalesce(nullif(btrim(p_query),''),'')))) x(lexeme)) p
  ), mtd as materialized (
    select k.buyer_id, sum(k.orders_gmv)::numeric spend, sum(k.orders_count)::bigint orders
    from app.kpi_buyers_daily k
    join app.cohort_members metric_member on metric_member.buyer_id=k.buyer_id and metric_member.cohort_id=p_cohort_id
    join app.cohorts metric_cohort on metric_cohort.id=metric_member.cohort_id and metric_cohort.tenant_id=p_tenant_id and metric_cohort.deleted_at is null
    where k.tenant_id=p_tenant_id and k.scope='tenant' and k.location_id is null
      and k.day>=date_trunc('month',current_date)::date group by k.buyer_id
  ), filtered as materialized (
    select b.id,b.business_name,b.contact_name,b.external_ref,coalesce(b.geography->>'city',b.geography->>'state','—') geography_label,b.tier,
      coalesce(m.spend,0) spend,coalesce(m.orders,0) orders,
      case when coalesce(m.orders,0)>0 then round(m.spend/m.orders,2) else 0 end aov,
      coalesce(bs.outstanding_dues,0) credit_used,bs.last_order_at,
      ts_rank_cd(b.search_vector,coalesce(q.exact_query,q.prefix_query)) rank
    from app.cohort_members cm join app.cohorts c on c.id=cm.cohort_id and c.tenant_id=p_tenant_id and c.deleted_at is null
    join app.buyers b on b.id=cm.buyer_id and b.tenant_id=p_tenant_id and b.deleted_at is null cross join query_terms q
    left join mtd m on m.buyer_id=b.id left join app.buyers_snapshot bs on bs.tenant_id=p_tenant_id and bs.buyer_id=b.id and bs.scope='tenant' and bs.location_id is null
    where cm.cohort_id=p_cohort_id and (q.exact_query is null or b.search_vector@@q.exact_query or b.search_vector@@q.prefix_query)
      and (nullif(p_activity,'') is null or (p_activity='ordered_mtd' and coalesce(m.orders,0)>0)
        or (p_activity='dormant' and (bs.last_order_at is null or bs.last_order_at<current_date-interval '30 days')))
  )
  select f.id,f.business_name,f.contact_name,f.external_ref,f.geography_label,f.tier,f.spend,f.orders,f.aov,f.credit_used,f.last_order_at,count(*) over ()::bigint
  from filtered f order by case when nullif(btrim(p_query),'') is not null then f.rank end desc,
    case when p_sort='orders_desc' then f.orders end desc,case when p_sort='aov_desc' then f.aov end desc,
    case when p_sort='name_asc' then f.business_name end,case when p_sort='last_order_desc' then f.last_order_at end desc nulls last,
    case when p_sort not in ('orders_desc','aov_desc','name_asc','last_order_desc') then f.spend end desc,f.business_name,f.id
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
$$;

create or replace function app.search_price_list_products_detail(
  p_tenant_id uuid,p_price_list_id uuid,p_query text default null,p_price_position text default null,
  p_sort text default 'product_asc',p_limit integer default 50,p_offset integer default 0
)
returns table (item_id uuid,tenant_product_id uuid,product_name text,sku text,brand_name text,mrp numeric,base_price numeric,
  list_price numeric,cost_price numeric,discount_pct numeric,margin_pct numeric,total_count bigint)
language sql stable security definer set search_path='' set statement_timeout='10s'
as $$
  with query_terms as materialized (
    select case when nullif(btrim(p_query),'') is null then null else websearch_to_tsquery('english',btrim(p_query)) end exact_query,
      case when prefix_text is null then null else to_tsquery('english',prefix_text) end prefix_query
    from (select string_agg(quote_literal(lexeme)||':*',' & ' order by lexeme) prefix_text
      from unnest(tsvector_to_array(to_tsvector('english',coalesce(nullif(btrim(p_query),''),'')))) x(lexeme)) p
  ), filtered as materialized (
    select pli.id, tp.id tenant_product_id,coalesce(nullif(tp.name_override,''),cp.name,tp.internal_sku) product_name,tp.internal_sku sku,
      coalesce(nullif(tb.display_name_override,''),cb.name,'—') brand_name,tp.mrp,tp.base_selling_price base_price,pli.price list_price,tp.cost_price,
      case when coalesce(tp.base_selling_price,0)>0 then round(((tp.base_selling_price-pli.price)/tp.base_selling_price)*100,2) end discount_pct,
      case when pli.price>0 and coalesce(tp.cost_price,0)>0 then round(((pli.price-tp.cost_price)/pli.price)*100,2) end margin_pct,
      ts_rank_cd(tp.search_vector,coalesce(q.exact_query,q.prefix_query)) rank
    from app.price_list_items pli join app.price_lists pl on pl.id=pli.price_list_id and pl.tenant_id=p_tenant_id and pl.deleted_at is null
    join app.tenant_products tp on tp.id=pli.tenant_product_id and tp.tenant_id=p_tenant_id and tp.deleted_at is null cross join query_terms q
    left join catalog.products cp on cp.id=tp.master_product_id left join app.tenant_brands tb on tb.id=tp.tenant_brand_id and tb.deleted_at is null
    left join catalog.brands cb on cb.id=tb.master_brand_id
    where pli.price_list_id=p_price_list_id and pli.deleted_at is null
      and (q.exact_query is null or tp.search_vector@@q.exact_query or tp.search_vector@@q.prefix_query)
      and (nullif(p_price_position,'') is null or (p_price_position='discounted' and pli.price<tp.base_selling_price)
        or (p_price_position='above_base' and pli.price>tp.base_selling_price))
  )
  select f.id,f.tenant_product_id,f.product_name,f.sku,f.brand_name,f.mrp,f.base_price,f.list_price,f.cost_price,f.discount_pct,f.margin_pct,count(*) over ()::bigint
  from filtered f order by case when nullif(btrim(p_query),'') is not null then f.rank end desc,
    case when p_sort='brand_asc' then f.brand_name end,case when p_sort='list_desc' then f.list_price end desc,
    case when p_sort='discount_desc' then f.discount_pct end desc nulls last,case when p_sort='margin_desc' then f.margin_pct end desc nulls last,
    case when p_sort not in ('brand_asc','list_desc','discount_desc','margin_desc') then f.product_name end,f.product_name,f.id
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function app.search_brand_products_detail(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function app.search_brand_catalogs_detail(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function app.search_catalog_products_detail(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function app.search_cohort_buyers_detail(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function app.search_price_list_products_detail(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function app.search_brand_products_detail(uuid,uuid,text,text,text,integer,integer) to service_role;
grant execute on function app.search_brand_catalogs_detail(uuid,uuid,text,text,text,integer,integer) to service_role;
grant execute on function app.search_catalog_products_detail(uuid,uuid,text,text,text,integer,integer) to service_role;
grant execute on function app.search_cohort_buyers_detail(uuid,uuid,text,text,text,integer,integer) to service_role;
grant execute on function app.search_price_list_products_detail(uuid,uuid,text,text,text,integer,integer) to service_role;
