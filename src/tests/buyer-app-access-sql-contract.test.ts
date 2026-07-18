import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rpcSql = readFileSync(
  resolve('supabase/migrations/20260714102255_buyer_app_access_authoritative_search.sql'),
  'utf8',
);
const indexSql = readFileSync(
  resolve('supabase/migrations/20260714102641_buyer_app_access_order_index.sql'),
  'utf8',
);

describe('buyer app access SQL contract', () => {
  it('keeps concurrent index creation isolated from function DDL', () => {
    expect(rpcSql).not.toContain('CREATE INDEX CONCURRENTLY');
    expect(indexSql).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS');
    expect(indexSql).not.toContain('CREATE OR REPLACE FUNCTION');
  });

  it('filters candidate buyers before the bounded 90-day order aggregation', () => {
    expect(rpcSql).toContain('candidate_pool AS MATERIALIZED');
    expect(rpcSql).toContain('cheap_page AS MATERIALIZED');
    expect(rpcSql).toContain('buyers_to_aggregate AS MATERIALIZED');
    expect(rpcSql).toContain('FROM buyers_to_aggregate ba');
    expect(rpcSql).toContain('o.tenant_id = p_tenant_id');
    expect(rpcSql).toContain('o.buyer_id = ba.id');
    expect(rpcSql).toContain("COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at) >= v_90d_ago");
    expect(rpcSql).toContain("MAX(COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.created_at))");
    expect(rpcSql).not.toContain('o.placed_at');
    expect(rpcSql).toContain('app.order_status_in_flow(o.status)');
    expect(rpcSql).toContain('LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)');
    expect(rpcSql.indexOf('cheap_page AS MATERIALIZED')).toBeLessThan(
      rpcSql.indexOf('order_metrics AS MATERIALIZED'),
    );
  });

  it('indexes the canonical order timestamp used by the window query', () => {
    expect(indexSql).toContain(
      "(COALESCE((order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), created_at)) DESC",
    );
    expect(indexSql).not.toContain('placed_at');
  });

  it('only emits authoritative global KPIs in explicit summary mode', () => {
    expect(rpcSql).toContain('p_include_summary boolean DEFAULT false');
    expect(rpcSql).toContain("'summary_authoritative', v_include_summary");
    expect(rpcSql).toContain('WHEN v_include_summary THEN jsonb_build_object');
    expect(rpcSql).toContain('ELSE NULL');
  });

  it('supports exact and safe prefix FTS before derived filters and pagination', () => {
    expect(rpcSql).toContain("websearch_to_tsquery('english', v_query)");
    expect(rpcSql).toContain("quote_literal(lexeme) || ':*'");
    expect(rpcSql).toContain('rs.search_vector @@ v_prefix_ts_query');
    expect(rpcSql.indexOf('filtered AS MATERIALIZED')).toBeLessThan(
      rpcSql.indexOf('\n  page AS MATERIALIZED'),
    );
  });

  it('exposes the RPC only to service_role', () => {
    expect(rpcSql).toContain('FROM PUBLIC');
    expect(rpcSql).toContain('FROM authenticated');
    expect(rpcSql).toContain('TO service_role');
  });
});
