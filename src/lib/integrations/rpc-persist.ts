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

  const { data, error } = await admin.schema('app').rpc<Record<string, unknown>[]>('bulk_persist_jsonb_records', {
    p_table: table,
    p_rows: rows,
    p_conflict_cols: conflictColumns.length > 0 ? conflictColumns : null,
  });

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
