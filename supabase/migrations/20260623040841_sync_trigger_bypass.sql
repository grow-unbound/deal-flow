-- Sync-trigger bypass: bulk Zoho imports set a transaction-local flag that
-- lets heavy derived-data triggers skip work during the import window.
-- This keeps ordinary app writes fully protected while avoiding duplicate
-- snapshot / search / queue churn during large initial syncs.

create or replace function app.sync_trigger_bypass_active()
returns boolean
language sql
stable
set search_path = pg_catalog, app
as $$
  select coalesce(nullif(current_setting('app.integration_sync_bypass_triggers', true), ''), 'off')
    in ('on', 'true', '1')
$$;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create or replace function catalog.products_search_doc_update()
returns trigger
language plpgsql
as $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  new.search_doc :=
    setweight(to_tsvector('english', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.master_sku, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create or replace function app.tenant_products_search_vector_update()
returns trigger
language plpgsql
as $$
declare
  v_master_name text;
  v_brand_name text;
  v_text text;
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  select cp.name into v_master_name
  from catalog.products cp
  where cp.id = new.master_product_id;

  select cb.name into v_brand_name
  from app.tenant_brands tb
  join catalog.brands cb on cb.id = tb.master_brand_id
  where tb.id = new.tenant_brand_id;

  v_text := concat_ws(' ',
    coalesce(new.name_override, v_master_name, ''),
    coalesce(new.internal_sku, ''),
    coalesce(v_brand_name, '')
  );

  new.search_vector := to_tsvector('english', v_text);
  return new;
end;
$$;

create or replace function app.buyers_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  new.search_vector := to_tsvector('english',
    concat_ws(' ',
      coalesce(new.business_name, ''),
      coalesce(new.contact_name, '')
    )
  );
  return new;
end;
$$;

create or replace function catalog.brands_embedding_queue()
returns trigger
language plpgsql
as $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  perform catalog.enqueue_embedding('catalog.brands', new.id);
  return new;
end;
$$;

create or replace function catalog.products_embedding_queue()
returns trigger
language plpgsql
as $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  perform catalog.enqueue_embedding('catalog.products', new.id);
  return new;
end;
$$;

create or replace function catalog.categories_embedding_queue()
returns trigger
language plpgsql
as $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  perform catalog.enqueue_embedding('catalog.categories', new.id);
  return new;
end;
$$;

create or replace function app.tenant_products_embedding_queue()
returns trigger
language plpgsql
as $$
begin
  if app.sync_trigger_bypass_active() then
    return new;
  end if;

  perform catalog.enqueue_embedding('app.tenant_products', new.id);
  return new;
end;
$$;

create or replace function app.trg_refresh_kpi_from_orders()
returns trigger
language plpgsql
as $$
declare
  target_tenant uuid;
  target_day date;
begin
  if app.sync_trigger_bypass_active() then
    return coalesce(new, old);
  end if;

  target_tenant := coalesce(new.tenant_id, old.tenant_id);
  target_day := (coalesce(new.placed_at, old.placed_at) at time zone 'Asia/Kolkata')::date;

  if target_tenant is not null and target_day is not null then
    perform app.refresh_kpi_tenant_daily(target_tenant, target_day);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function app.trg_refresh_kpi_from_order_items()
returns trigger
language plpgsql
as $$
declare
  target_order_id uuid;
  target_product_id uuid;
  target_tenant uuid;
  target_day date;
begin
  if app.sync_trigger_bypass_active() then
    return coalesce(new, old);
  end if;

  target_order_id := coalesce(new.order_id, old.order_id);
  target_product_id := coalesce(new.tenant_product_id, old.tenant_product_id);

  select o.tenant_id, (o.placed_at at time zone 'Asia/Kolkata')::date
    into target_tenant, target_day
  from app.orders o
  where o.id = target_order_id;

  if target_tenant is not null and target_day is not null then
    perform app.refresh_kpi_tenant_daily(target_tenant, target_day);
    if target_product_id is not null then
      perform app.refresh_kpi_product_daily(target_tenant, target_product_id, target_day);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function app.trg_refresh_kpi_from_inventory()
returns trigger
language plpgsql
as $$
declare
  target_product_id uuid;
  target_tenant uuid;
  target_day date;
begin
  if app.sync_trigger_bypass_active() then
    return coalesce(new, old);
  end if;

  target_product_id := coalesce(new.tenant_product_id, old.tenant_product_id);
  target_day := (now() at time zone 'Asia/Kolkata')::date;

  select tp.tenant_id into target_tenant
  from app.tenant_products tp
  where tp.id = target_product_id;

  if target_tenant is not null and target_product_id is not null then
    perform app.refresh_kpi_product_daily(target_tenant, target_product_id, target_day);
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function app.trg_refresh_estimates_snapshot()
returns trigger
language plpgsql
security definer
set search_path = app
as $$
declare
  target_tenant uuid;
begin
  if app.sync_trigger_bypass_active() then
    return null;
  end if;

  target_tenant := coalesce(new.tenant_id, old.tenant_id);
  perform app.refresh_estimates_snapshot(target_tenant);
  return null;
end;
$$;

create or replace function app.trg_refresh_invoices_snapshot()
returns trigger
language plpgsql
security definer
set search_path = app
as $$
declare
  target_tenant uuid;
begin
  if app.sync_trigger_bypass_active() then
    return null;
  end if;

  target_tenant := coalesce(new.tenant_id, old.tenant_id);
  perform app.refresh_invoices_snapshot(target_tenant);
  return null;
end;
$$;

create or replace function app.bulk_persist_jsonb_records(
  p_table text,
  p_rows jsonb,
  p_conflict_cols text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_rel regclass;
  v_schema text;
  v_columns text[];
  v_defs text;
  v_insert_cols text;
  v_select_cols text;
  v_update_set text;
  v_conflict_clause text := '';
  v_sql text;
  v_result jsonb;
begin
  perform set_config('app.integration_sync_bypass_triggers', 'on', true);

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return '[]'::jsonb;
  end if;

  if position('.' in p_table) > 0 then
    v_rel := to_regclass(p_table);
  else
    v_rel := to_regclass(format('app.%I', p_table));
  end if;

  if v_rel is null then
    raise exception 'Unknown table %', p_table;
  end if;

  select n.nspname
  into v_schema
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.oid = v_rel;

  if v_schema <> 'app' then
    raise exception 'bulk_persist_jsonb_records only supports app schema tables';
  end if;

  select array_agg(a.attname order by a.attnum)
  into v_columns
  from pg_attribute a
  where a.attrelid = v_rel
    and a.attnum > 0
    and not a.attisdropped
    and a.attname in (
      select jsonb_object_keys(p_rows -> 0)
    );

  if coalesce(array_length(v_columns, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;

  select string_agg(format('%I %s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)), ', ' order by a.attnum)
  into v_defs
  from pg_attribute a
  where a.attrelid = v_rel
    and a.attnum > 0
    and not a.attisdropped
    and a.attname = any (v_columns);

  select string_agg(format('%I', col), ', ')
  into v_insert_cols
  from unnest(v_columns) as col;

  select string_agg(format('src.%I', col), ', ')
  into v_select_cols
  from unnest(v_columns) as col;

  if p_conflict_cols is not null and array_length(p_conflict_cols, 1) > 0 then
    select string_agg(format('%1$I = excluded.%1$I', col), ', ')
    into v_update_set
    from unnest(v_columns) as col
    where col <> all (p_conflict_cols)
      and col not in ('id', 'created_at', 'created_by');

    if v_update_set is null or length(v_update_set) = 0 then
      v_conflict_clause := format(' on conflict (%s) do nothing', array_to_string(ARRAY(
        select format('%I', col) from unnest(p_conflict_cols) as col
      ), ', '));
    else
      v_conflict_clause := format(
        ' on conflict (%s) do update set %s',
        array_to_string(ARRAY(
          select format('%I', col) from unnest(p_conflict_cols) as col
        ), ', '),
        v_update_set
      );
    end if;
  end if;

  v_sql := format(
    'with input as (
       select *
       from jsonb_to_recordset($1) as src(%s)
     ),
     persisted as (
       insert into %s as target (%s)
       select %s
       from input as src
       %s
       returning to_jsonb(target.*) as row
     )
     select coalesce(jsonb_agg(row), ''[]''::jsonb)
     from persisted',
    v_defs,
    v_rel,
    v_insert_cols,
    v_select_cols,
    v_conflict_clause
  );

  execute v_sql into v_result using p_rows;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;
