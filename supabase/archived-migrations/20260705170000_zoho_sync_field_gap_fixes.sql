-- Zoho sync field gap fixes:
-- 1. bulk_persist: preserve updated_by when incoming value is NULL (cron sync actor)
-- 2. tenant_field_mappings: WineYard uses cf_online_catalogue_status (not cf_online_catalog_access)

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
  v_row_keys text[];
  v_columns text[];
  v_defs text;
  v_insert_cols text;
  v_select_cols text;
  v_update_set text;
  v_conflict_clause text := '';
  v_sql text;
  v_result jsonb;
begin
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

  select array_agg(distinct key)
  into v_row_keys
  from jsonb_array_elements(p_rows) as elem
  cross join lateral jsonb_object_keys(elem) as key;

  select array_agg(a.attname order by a.attnum)
  into v_columns
  from pg_attribute a
  where a.attrelid = v_rel
    and a.attnum > 0
    and not a.attisdropped
    and a.attname = any (v_row_keys);

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

  select string_agg(
    case when col = 'id' then format('coalesce(src.%I, gen_random_uuid())', col) else format('src.%I', col) end,
    ', '
  )
  into v_select_cols
  from unnest(v_columns) as col;

  if p_conflict_cols is not null and array_length(p_conflict_cols, 1) > 0 then
    select string_agg(
      case
        when col = 'updated_by' then
          format('%1$I = coalesce(excluded.%1$I, target.%1$I)', col)
        else
          format('%1$I = excluded.%1$I', col)
      end,
      ', '
    )
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

revoke execute on function app.bulk_persist_jsonb_records(text, jsonb, text[]) from public, anon, authenticated;
grant execute on function app.bulk_persist_jsonb_records(text, jsonb, text[]) to service_role;

-- Replace WineYard customer field mapping seed.
create or replace function app.seed_system_field_mappings(p_tenant_integration_id uuid)
returns void language plpgsql security definer set search_path = app as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from app.tenant_integrations where id = p_tenant_integration_id;

  if v_tenant_id is null then return; end if;

  insert into app.tenant_field_mappings
    (tenant_id, tenant_integration_id, entity_type, zoho_field_name, target_column, transform_type, is_system)
  values
    (v_tenant_id, p_tenant_integration_id, 'customers', 'cf_online_catalogue_status', 'buyer_app_enabled', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'estimates', 'cf_catalog_estimate',      'is_buyer_app_estimate', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'invoices',  'cf_catalog_invoice',       'is_buyer_app_invoice',  'boolean_from_zoho', true)
  on conflict (tenant_integration_id, entity_type, zoho_field_name) do nothing;
end;
$$;

-- Backfill existing zoho_books integrations: swap legacy field name to live WineYard field.
update app.tenant_field_mappings
set
  zoho_field_name = 'cf_online_catalogue_status',
  updated_at = now()
where entity_type = 'customers'
  and target_column = 'buyer_app_enabled'
  and zoho_field_name = 'cf_online_catalog_access'
  and is_system = true;

insert into app.tenant_field_mappings
  (tenant_id, tenant_integration_id, entity_type, zoho_field_name, target_column, transform_type, is_system)
select
  ti.tenant_id,
  ti.id,
  'customers',
  'cf_online_catalogue_status',
  'buyer_app_enabled',
  'boolean_from_zoho',
  true
from app.tenant_integrations ti
where ti.integration_type_id = 'zoho_books'
  and not exists (
    select 1
    from app.tenant_field_mappings tfm
    where tfm.tenant_integration_id = ti.id
      and tfm.entity_type = 'customers'
      and tfm.zoho_field_name = 'cf_online_catalogue_status'
  );
