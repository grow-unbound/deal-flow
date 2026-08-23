export interface BatchUpsertLineItemsParams<T extends { id?: string }> {
  db: any;
  table: string;
  parentColumn: string;
  parentId: string;
  existingItemIds: Set<string>;
  items: T[];
  buildPatch: (item: T) => Record<string, unknown>;
  actorId: string;
  now?: string;
}

export interface BatchUpsertLineItemsResult {
  error: { message: string } | null;
  step?: 'delete' | 'update' | 'insert';
}

/**
 * Replaces a per-item await loop (soft-delete stale rows one at a time, then
 * update-or-insert each row one at a time) with at most 3 batched requests
 * regardless of item count: one soft-delete over the stale id set, one
 * upsert over changed existing rows, one insert over new rows.
 *
 * created_by is only ever set on the insert branch -- upserting it on the
 * update branch would overwrite the original creator's attribution.
 */
export async function batchUpsertLineItems<T extends { id?: string }>(
  params: BatchUpsertLineItemsParams<T>,
): Promise<BatchUpsertLineItemsResult> {
  const { db, table, parentColumn, parentId, existingItemIds, items, buildPatch, actorId } = params;
  const now = params.now ?? new Date().toISOString();

  const nextIds = new Set(items.map((item) => item.id).filter((value): value is string => Boolean(value)));
  const staleIds = [...existingItemIds].filter((id) => !nextIds.has(id));

  if (staleIds.length > 0) {
    const { error } = await db
      .schema('app')
      .from(table)
      .update({ deleted_at: now, updated_by: actorId, updated_at: now })
      .in('id', staleIds)
      .eq(parentColumn, parentId);
    if (error) return { error, step: 'delete' };
  }

  const existingRows: Record<string, unknown>[] = [];
  const newRows: Record<string, unknown>[] = [];

  for (const item of items) {
    const patch = {
      ...buildPatch(item),
      [parentColumn]: parentId,
      updated_at: now,
      updated_by: actorId,
      deleted_at: null,
    };

    if (item.id && existingItemIds.has(item.id)) {
      existingRows.push({ ...patch, id: item.id });
    } else {
      newRows.push({ ...patch, created_by: actorId });
    }
  }

  if (existingRows.length > 0) {
    const { error } = await db.schema('app').from(table).upsert(existingRows, { onConflict: 'id' });
    if (error) return { error, step: 'update' };
  }

  if (newRows.length > 0) {
    const { error } = await db.schema('app').from(table).insert(newRows);
    if (error) return { error, step: 'insert' };
  }

  return { error: null };
}
