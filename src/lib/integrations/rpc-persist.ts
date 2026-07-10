type RpcClient = {
  schema(schemaName: 'app'): {
    rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message?: string } | null }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
