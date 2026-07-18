type RpcError = { message?: string; code?: string } | null;

type RpcClient = {
  schema(schemaName: 'app'): {
    // supabase-js's .rpc() returns a PostgrestFilterBuilder — thenable
    // (awaitable, resolves to {data,error}) but not a nominal Promise (no
    // .catch/.finally/[Symbol.toStringTag] in its declared type). A real
    // Promise return type here rejected every actual SupabaseClient caller;
    // PromiseLike matches what's actually thenable without losing the
    // resolved-shape check.
    rpc<T>(fn: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: RpcError }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Postgres SQLSTATE 55P03 (lock_not_available) — raised when
// persist_with_natural_key_lock's lock_timeout expires waiting on
// pg_advisory_xact_lock. Distinguished from other persist failures so callers
// (e.g. the Zoho webhook handler) can choose to surface a retryable error
// instead of swallowing it as a generic failure — nothing was written, so a
// retry is safe and correct here, unlike a partial-upsert failure.
export class LockTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockTimeoutError';
  }
}

function isLockTimeoutError(error: RpcError): boolean {
  if (!error) return false;
  if (error.code === '55P03') return true;
  return /lock timeout/i.test(error.message ?? '');
}

export async function bulkPersistJsonbRecords(
  admin: RpcClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictColumns: string[] = [],
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];

  // Checkpoint: this RPC is the single common write path for every entity
  // type (categories, brands, products, buyers, pricelists, estimates,
  // orders, invoices) — if a sync hangs with no further heartbeat_at
  // movement, this is one of the first places to check for a stuck call.
  // Deliberately a plain console.log (no shared import) since this module
  // is imported cross-runtime and shouldn't take on a Deno-specific dep.
  const startedAt = Date.now();
  console.log(`[sync-checkpoint] bulk_persist_jsonb_records:start table=${table} rows=${rows.length}`);

  const { data, error } = await admin.schema('app').rpc<Record<string, unknown>[]>('bulk_persist_jsonb_records', {
    p_table: table,
    p_rows: rows,
    p_conflict_cols: conflictColumns.length > 0 ? conflictColumns : null,
  });

  console.log(`[sync-checkpoint] bulk_persist_jsonb_records:done table=${table} ms=${Date.now() - startedAt} error=${error?.message ?? 'none'}`);

  if (error) {
    throw new Error(error.message ?? `Failed to persist rows into ${table}`);
  }

  if (!Array.isArray(data)) return [];
  return data.filter(isRecord);
}

export async function bulkPersistJsonbRecordsWithIds(
  admin: RpcClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictColumns: string[] = [],
): Promise<string[]> {
  const persisted = await bulkPersistJsonbRecords(admin, table, rows, conflictColumns);
  return persisted.map((row) => String(row.id ?? '')).filter((id) => id.length > 0);
}

export interface NaturalKeyCollision {
  externalRef: string | null;
  naturalKey: string | null;
  reason: string;
}

// Resolves each row against an existing row by external_ref OR a secondary
// natural key (invoice_number, estimate_number, order_number, slug,
// internal_sku, ...), then inserts/updates — all inside ONE database call.
// Both steps used to be separate round trips (a plain SELECT, then a
// separate bulk_persist_jsonb_records call): two concurrent callers (the
// bulk sync pipeline and an incoming webhook) resolving the same natural
// key in the gap between those two calls could both decide "not found,
// insert new" and race, one landing a hard, uncaught
// "duplicate key value violates unique constraint ..." — bulk_persist_jsonb_records's
// ON CONFLICT only covers the (tenant_id, external_ref) target, not a
// separate natural-key unique constraint. Doing both steps in one RPC call
// means one transaction, one connection — a pg_advisory_xact_lock taken at
// the top actually serializes concurrent callers (a lock acquired in one
// PostgREST/Supavisor round trip is not reliably held during a second,
// separate round trip under connection pooling).
export async function persistWithNaturalKeyLock(
  admin: RpcClient,
  table: string,
  tenantId: string,
  rows: Record<string, unknown>[],
  naturalKeyColumn: string,
  conflictColumns: string[],
): Promise<{ rows: Record<string, unknown>[]; conflicts: NaturalKeyCollision[] }> {
  if (rows.length === 0) return { rows: [], conflicts: [] };

  const startedAt = Date.now();
  console.log(`[sync-checkpoint] persist_with_natural_key_lock:start table=${table} rows=${rows.length}`);

  const { data, error } = await admin.schema('app').rpc<{ rows: unknown; conflicts: unknown }>('persist_with_natural_key_lock', {
    p_table: table,
    p_tenant_id: tenantId,
    p_rows: rows,
    p_natural_key_col: naturalKeyColumn,
    p_conflict_cols: conflictColumns,
  });

  console.log(`[sync-checkpoint] persist_with_natural_key_lock:done table=${table} ms=${Date.now() - startedAt} error=${error?.message ?? 'none'}`);

  if (error) {
    if (isLockTimeoutError(error)) {
      throw new LockTimeoutError(error.message ?? `Lock timeout persisting rows into ${table}`);
    }
    throw new Error(error.message ?? `Failed to persist rows into ${table}`);
  }

  const persistedRows = Array.isArray(data?.rows) ? data.rows.filter(isRecord) : [];
  const conflicts = Array.isArray(data?.conflicts)
    ? data.conflicts.filter(isRecord).map((c): NaturalKeyCollision => ({
        externalRef: typeof c.external_ref === 'string' ? c.external_ref : null,
        naturalKey: typeof c.natural_key === 'string' ? c.natural_key : null,
        reason: typeof c.reason === 'string' ? c.reason : 'unknown',
      }))
    : [];

  return { rows: persistedRows, conflicts };
}
