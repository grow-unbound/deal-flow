-- Fix: app.bulk_persist_jsonb_records derived its insert column set from
-- jsonb_object_keys(p_rows -> 0) — only the FIRST row's keys. Batches with
-- heterogeneous row shape (e.g. some rows carrying a resolved `id`, others
-- not, as produced by resolveRowsByExternalRefOrNaturalKey for new vs.
-- matched records) caused jsonb_to_recordset to parse missing `id` keys as
-- NULL, which then violated the NOT NULL constraint on `id` — or, if the
-- first row lacked `id`, silently dropped it from the insert entirely and
-- caused duplicate inserts instead of updates.
--
-- Fix: derive the column set from the UNION of keys across all rows, and
-- special-case `id` to COALESCE(src.id, gen_random_uuid()) so rows without
-- a resolved id still get a generated one instead of NULL.
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

  -- Union of keys across ALL rows, not just the first — rows can have
  -- heterogeneous shape (e.g. `id` present only on matched records).
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

  -- `id` needs a fallback when a row didn't carry a resolved id (new record) —
  -- jsonb_to_recordset parses the missing key as NULL, which would otherwise
  -- violate the NOT NULL constraint on the primary key.
  select string_agg(
    case when col = 'id' then format('coalesce(src.%I, gen_random_uuid())', col) else format('src.%I', col) end,
    ', '
  )
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

revoke execute on function app.bulk_persist_jsonb_records(text, jsonb, text[]) from public, anon, authenticated;
grant execute on function app.bulk_persist_jsonb_records(text, jsonb, text[]) to service_role;
