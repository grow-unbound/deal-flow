/**
 * Canonical page-size constants for the entire app.
 * Import from here — never hardcode limits in API routes or hooks.
 *
 * SELLER:   desktop, wider viewport, broader context
 * BUYER:    mobile-first, limited bandwidth
 * COMPOSER: inline pickers (product/customer selection modals)
 * SEARCH:   typeahead / instant-search suggestions
 * MAX:      hard cap applied by all list endpoints
 */
export const PAGE_SIZE = {
  SELLER: 50,
  BUYER: 20,
  COMPOSER: 30,
  SEARCH: 15,
  MAX: 100,
} as const;

export type PageSize = (typeof PAGE_SIZE)[keyof typeof PAGE_SIZE];

// ---------------------------------------------------------------------------
// Cursor helpers — stable sort by (created_at DESC, id DESC)
// No external lib: encode as base64 JSON so it survives URL encoding.
// ---------------------------------------------------------------------------

interface CursorPayload {
  t: string; // ISO timestamp
  i: string; // uuid
}

export function encodeCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.created_at, i: row.id })).toString('base64url');
}

export function decodeCursor(cursor: string): { created_at: string; id: string } {
  const { t, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as CursorPayload;
  return { created_at: t, id: i };
}

/**
 * Apply cursor WHERE to a Supabase query that sorts by (column DESC, id DESC).
 * Returns the query with the additional filter applied.
 *
 * @param query   - chained Supabase query builder
 * @param cursor  - encoded cursor string from a previous response
 * @param column  - the timestamp column used for primary sort (e.g. 'placed_at')
 */
export function applyCursor<T>(
  query: T & { lt: (col: string, val: string) => T; or: (filter: string) => T },
  cursor: string,
  column: string,
): T {
  const { created_at, id } = decodeCursor(cursor);
  return query.or(
    `${column}.lt.${created_at},and(${column}.eq.${created_at},id.lt.${id})`,
  );
}

/**
 * Given a raw list of items (fetched with limit+1), split into
 * the page slice and the next cursor token.
 */
export function paginateResults<T extends { created_at: string; id: string }>(
  rows: T[],
  limit: number,
  cursorColumn: keyof T = 'created_at' as keyof T,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ created_at: last[cursorColumn] as string, id: last.id })
      : null;
  return { items, nextCursor };
}
