-- Daily ops digest: rollup + rule-based redflags, per-tenant and platform-wide.
-- Phase 1 of the "daily morning report" infra — deterministic SQL only, no AI,
-- no external API calls. Sourced directly from app.orders/invoices/estimates/
-- buyers/buyer_app_activity/integration_webhook_errors/integration_sync_jobs
-- (not from metrics_tenant_daily, which only carries rows for tenants with
-- activity — we need every live tenant zero-filled so a tenant going silent
-- shows up as a flag, not a missing row).
--
-- Phase 2 (separate, later): an edge function reads these two tables plus
-- Sentry/PostHog/Vercel and posts a Slack digest — needs credentials the
-- author has not supplied yet.

create table if not exists app.ops_daily_rollup (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  tenant_id uuid null references app.tenants(id) on delete restrict,
  order_count bigint not null default 0,
  order_value numeric not null default 0,
  app_order_count bigint not null default 0,
  app_order_value numeric not null default 0,
  invoice_count bigint not null default 0,
  invoice_value numeric not null default 0,
  estimate_count bigint not null default 0,
  estimate_value numeric not null default 0,
  active_buyer_count bigint not null default 0,
  new_buyer_count bigint not null default 0,
  webhook_error_count bigint not null default 0,
  webhook_error_critical_count bigint not null default 0,
  sync_job_failure_count bigint not null default 0,
  active_tenant_count bigint not null default 0,
  computed_at timestamptz not null default now(),
  calculation_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,
  external_ref text null
);

comment on table app.ops_daily_rollup is
  'One row per (day, tenant) plus one platform-wide row (tenant_id null) per day. Computed nightly by app.compute_ops_daily_rollup.';

create unique index if not exists ops_daily_rollup_tenant_day_uq
  on app.ops_daily_rollup (day, tenant_id)
  where tenant_id is not null;

create unique index if not exists ops_daily_rollup_global_day_uq
  on app.ops_daily_rollup (day)
  where tenant_id is null;

create index if not exists ops_daily_rollup_day_idx on app.ops_daily_rollup (day);

alter table app.ops_daily_rollup enable row level security;
revoke all on app.ops_daily_rollup from authenticated, anon;
grant select, insert, update on app.ops_daily_rollup to service_role;

create table if not exists app.ops_daily_flags (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  tenant_id uuid null references app.tenants(id) on delete restrict,
  metric text not null,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  current_value numeric not null,
  baseline_value numeric null,
  delta_pct numeric null,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,
  external_ref text null
);

comment on table app.ops_daily_flags is
  'Rule-based redflags derived from app.ops_daily_rollup (spike/drop vs trailing 7-day average). Computed by app.compute_ops_daily_flags, called from app.compute_ops_daily_rollup.';

create index if not exists ops_daily_flags_day_idx on app.ops_daily_flags (day);
create index if not exists ops_daily_flags_tenant_day_idx on app.ops_daily_flags (tenant_id, day);

alter table app.ops_daily_flags enable row level security;
revoke all on app.ops_daily_flags from authenticated, anon;
grant select, insert, update on app.ops_daily_flags to service_role;

-- ---------------------------------------------------------------------------

create or replace function app.compute_ops_daily_flags(p_day date)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app'
as $function$
begin
  delete from app.ops_daily_flags where day = p_day;

  -- No "on commit drop": this function is called in a loop within a single
  -- transaction during backfill, so the temp table must be dropped explicitly
  -- between calls rather than at transaction end.
  drop table if exists pg_temp.scored;
  create temp table scored as
  with today as (
    select * from app.ops_daily_rollup where day = p_day
  ),
  baseline as (
    select
      tenant_id,
      count(*) as sample_days,
      avg(order_count) as avg_order_count,
      avg(invoice_count) as avg_invoice_count,
      avg(active_buyer_count) as avg_active_buyer_count,
      avg(webhook_error_count) as avg_webhook_error_count
    from app.ops_daily_rollup
    where day >= p_day - 7 and day < p_day
    group by tenant_id
  )
  select
    t.tenant_id,
    t.order_count, t.invoice_count, t.active_buyer_count,
    t.webhook_error_count, t.webhook_error_critical_count, t.sync_job_failure_count,
    coalesce(b.sample_days, 0) as sample_days,
    b.avg_order_count, b.avg_invoice_count, b.avg_active_buyer_count, b.avg_webhook_error_count
  from today t
  left join baseline b on b.tenant_id is not distinct from t.tenant_id;

  insert into app.ops_daily_flags (day, tenant_id, metric, severity, current_value, baseline_value, delta_pct, message)
  select p_day, tenant_id, 'webhook_error_count', 'critical',
         webhook_error_count, avg_webhook_error_count,
         case when coalesce(avg_webhook_error_count, 0) > 0
              then round(((webhook_error_count - avg_webhook_error_count) / avg_webhook_error_count) * 100, 1)
              else null end,
         format('%s webhook errors today vs a 7-day average of %s', webhook_error_count, round(coalesce(avg_webhook_error_count, 0), 1))
  from scored
  where webhook_error_count >= 5
    and webhook_error_count > greatest(5, 3 * coalesce(avg_webhook_error_count, 0));

  insert into app.ops_daily_flags (day, tenant_id, metric, severity, current_value, baseline_value, delta_pct, message)
  select p_day, tenant_id, 'sync_job_failure_count', 'warning',
         sync_job_failure_count, null, null,
         format('%s failed integration sync jobs today', sync_job_failure_count)
  from scored
  where sync_job_failure_count >= 3;

  insert into app.ops_daily_flags (day, tenant_id, metric, severity, current_value, baseline_value, delta_pct, message)
  select p_day, tenant_id, 'order_count', 'warning',
         order_count, avg_order_count,
         round(((order_count - avg_order_count) / avg_order_count) * 100, 1),
         format('Orders dropped to %s today vs a 7-day average of %s', order_count, round(avg_order_count, 1))
  from scored
  where sample_days >= 3 and avg_order_count >= 1 and order_count < 0.5 * avg_order_count;

  insert into app.ops_daily_flags (day, tenant_id, metric, severity, current_value, baseline_value, delta_pct, message)
  select p_day, tenant_id, 'active_buyer_count', 'warning',
         active_buyer_count, avg_active_buyer_count,
         round(((active_buyer_count - avg_active_buyer_count) / avg_active_buyer_count) * 100, 1),
         format('Active buyers dropped to %s today vs a 7-day average of %s', active_buyer_count, round(avg_active_buyer_count, 1))
  from scored
  where sample_days >= 3 and avg_active_buyer_count >= 2 and active_buyer_count < 0.4 * avg_active_buyer_count;
end;
$function$;

revoke all on function app.compute_ops_daily_flags(date) from public;
grant execute on function app.compute_ops_daily_flags(date) to postgres, service_role;

-- ---------------------------------------------------------------------------

create or replace function app.compute_ops_daily_rollup(p_day date)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'app'
as $function$
declare
  v_computed_at timestamptz := now();
begin
  delete from app.ops_daily_rollup where day = p_day;

  with tenant_orders as (
    select tenant_id,
           count(*) filter (where status not in ('draft', 'cancelled')) as order_count,
           coalesce(sum(total_amount) filter (where status not in ('draft', 'cancelled')), 0) as order_value,
           count(*) filter (where status not in ('draft', 'cancelled') and is_buyer_app_order) as app_order_count,
           coalesce(sum(total_amount) filter (where status not in ('draft', 'cancelled') and is_buyer_app_order), 0) as app_order_value
    from app.orders
    where order_date = p_day and deleted_at is null
    group by tenant_id
  ),
  tenant_invoices as (
    select tenant_id, count(*) as invoice_count, coalesce(sum(total_amount), 0) as invoice_value
    from app.invoices
    where invoice_date = p_day and deleted_at is null
    group by tenant_id
  ),
  tenant_estimates as (
    select tenant_id, count(*) as estimate_count, coalesce(sum(total_amount), 0) as estimate_value
    from app.estimates
    where estimate_date = p_day and deleted_at is null
    group by tenant_id
  ),
  tenant_new_buyers as (
    select tenant_id, count(*) as new_buyer_count
    from app.buyers
    where deleted_at is null and (created_at at time zone 'Asia/Kolkata')::date = p_day
    group by tenant_id
  ),
  tenant_active_buyers as (
    select tenant_id, count(distinct buyer_id) as active_buyer_count
    from app.buyer_app_activity
    where occurred_day = p_day and qualifies_for_engagement and deleted_at is null
    group by tenant_id
  ),
  tenant_webhook_errors as (
    select tenant_id,
           count(*) as webhook_error_count,
           count(*) filter (where retryable is false) as webhook_error_critical_count
    from app.integration_webhook_errors
    where deleted_at is null and (created_at at time zone 'Asia/Kolkata')::date = p_day
    group by tenant_id
  ),
  tenant_sync_failures as (
    select tenant_id, count(*) as sync_job_failure_count
    from app.integration_sync_jobs
    where deleted_at is null and status = 'failed'
      and (coalesce(completed_at, updated_at) at time zone 'Asia/Kolkata')::date = p_day
    group by tenant_id
  ),
  tenant_rows as (
    select
      t.id as tenant_id,
      coalesce(o.order_count, 0) as order_count,
      coalesce(o.order_value, 0) as order_value,
      coalesce(o.app_order_count, 0) as app_order_count,
      coalesce(o.app_order_value, 0) as app_order_value,
      coalesce(i.invoice_count, 0) as invoice_count,
      coalesce(i.invoice_value, 0) as invoice_value,
      coalesce(e.estimate_count, 0) as estimate_count,
      coalesce(e.estimate_value, 0) as estimate_value,
      coalesce(ab.active_buyer_count, 0) as active_buyer_count,
      coalesce(nb.new_buyer_count, 0) as new_buyer_count,
      coalesce(we.webhook_error_count, 0) as webhook_error_count,
      coalesce(we.webhook_error_critical_count, 0) as webhook_error_critical_count,
      coalesce(sf.sync_job_failure_count, 0) as sync_job_failure_count
    from app.tenants t
    left join tenant_orders o on o.tenant_id = t.id
    left join tenant_invoices i on i.tenant_id = t.id
    left join tenant_estimates e on e.tenant_id = t.id
    left join tenant_active_buyers ab on ab.tenant_id = t.id
    left join tenant_new_buyers nb on nb.tenant_id = t.id
    left join tenant_webhook_errors we on we.tenant_id = t.id
    left join tenant_sync_failures sf on sf.tenant_id = t.id
    where t.deleted_at is null
  )
  insert into app.ops_daily_rollup (
    day, tenant_id, order_count, order_value, app_order_count, app_order_value,
    invoice_count, invoice_value, estimate_count, estimate_value,
    active_buyer_count, new_buyer_count, webhook_error_count, webhook_error_critical_count,
    sync_job_failure_count, active_tenant_count, computed_at
  )
  select p_day, tenant_id, order_count, order_value, app_order_count, app_order_value,
         invoice_count, invoice_value, estimate_count, estimate_value,
         active_buyer_count, new_buyer_count, webhook_error_count, webhook_error_critical_count,
         sync_job_failure_count, 0, v_computed_at
  from tenant_rows;

  insert into app.ops_daily_rollup (
    day, tenant_id, order_count, order_value, app_order_count, app_order_value,
    invoice_count, invoice_value, estimate_count, estimate_value,
    active_buyer_count, new_buyer_count, webhook_error_count, webhook_error_critical_count,
    sync_job_failure_count, active_tenant_count, computed_at
  )
  select
    p_day, null,
    sum(order_count), sum(order_value), sum(app_order_count), sum(app_order_value),
    sum(invoice_count), sum(invoice_value), sum(estimate_count), sum(estimate_value),
    sum(active_buyer_count), sum(new_buyer_count), sum(webhook_error_count), sum(webhook_error_critical_count),
    sum(sync_job_failure_count),
    count(*) filter (where order_count > 0 or invoice_count > 0 or estimate_count > 0 or active_buyer_count > 0),
    v_computed_at
  from app.ops_daily_rollup
  where day = p_day and tenant_id is not null;

  perform app.compute_ops_daily_flags(p_day);
end;
$function$;

revoke all on function app.compute_ops_daily_rollup(date) from public;
grant execute on function app.compute_ops_daily_rollup(date) to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Nightly schedule: 03:15 UTC = 08:45 IST, after metrics-v4-top80-daily (01:00),
-- metrics-v2-daily-reconciliation (01:00), and metrics-v4-period-drift-check
-- (02:40) have all finished for the prior IST calendar day.

select cron.schedule(
  'ops-daily-rollup',
  '15 3 * * *',
  $$ select app.compute_ops_daily_rollup(((now() at time zone 'Asia/Kolkata')::date) - 1) $$
);

-- Backfill the trailing 30 days so the redflag rules have a baseline and the
-- table isn't empty on day 1. Each call is idempotent (deletes its own day
-- first), safe to re-run.
do $$
declare
  v_day date;
begin
  for v_day in
    select generate_series(((now() at time zone 'Asia/Kolkata')::date) - 30, ((now() at time zone 'Asia/Kolkata')::date) - 1, interval '1 day')::date
  loop
    perform app.compute_ops_daily_rollup(v_day);
  end loop;
end;
$$;
