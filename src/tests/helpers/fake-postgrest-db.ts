// Minimal in-memory stand-in for the supabase-js query builder, faithful to the two PostgREST
// limits that bite large id lists: plain selects return at most 1000 rows, and `.in()`
// filters are serialized into the URL, so an oversized list is rejected.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export const FAKE_MAX_ROWS = 1000;
export const FAKE_MAX_IN_VALUES = 200;

export function createFakePostgrestDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));

  let idCounter = 0;
  const writes: Array<{ table: string; op: 'insert' | 'update'; count: number }> = [];

  function resolve(name: string): Row[] {
    if (name === 'app.cohort_members_active') {
      return (tables['app.cohort_members'] ?? []).filter((row) => row.valid_until == null);
    }
    tables[name] ??= [];
    return tables[name];
  }

  function builder(name: string) {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row | Row[] | null = null;
    let orderBy: string | null = null;
    let rangeArgs: [number, number] | null = null;
    let wantCount = false;
    let head = false;
    let returning = false;
    let inError: string | null = null;

    function run(): { data: unknown; count?: number; error: { message: string; code?: string } | null } {
      if (inError) return { data: null, error: { message: inError } };
      const source = resolve(name);
      const matched = source.filter((row) => filters.every((filter) => filter(row)));

      if (op === 'insert') {
        const incoming = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const base = name === 'app.cohort_members_active' ? 'app.cohort_members' : name;
        for (const row of incoming) {
          if (base === 'app.cohort_members') {
            const clash = resolve(base).some(
              (existing) =>
                existing.valid_until == null &&
                existing.cohort_id === row.cohort_id &&
                existing.buyer_id === row.buyer_id,
            );
            if (clash) return { data: null, error: { message: 'duplicate key value', code: '23505' } };
          }
        }
        const stored = incoming.map((row) => ({ id: `row-${(idCounter += 1)}`, valid_until: null, ...row }));
        resolve(base).push(...stored);
        writes.push({ table: name, op: 'insert', count: incoming.length });
        return { data: returning ? stored : null, error: null };
      }

      if (op === 'update') {
        for (const row of matched) Object.assign(row, payload);
        writes.push({ table: name, op: 'update', count: matched.length });
        return { data: returning ? matched : null, error: null };
      }

      let rows = [...matched];
      if (orderBy) rows.sort((a, b) => String(a[orderBy!]).localeCompare(String(b[orderBy!])));
      const total = rows.length;
      rows = rangeArgs ? rows.slice(rangeArgs[0], rangeArgs[1] + 1) : rows.slice(0, FAKE_MAX_ROWS);
      return { data: head ? null : rows, count: wantCount ? total : undefined, error: null };
    }

    const api: Record<string, unknown> = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        if (op === 'select') {
          wantCount = options?.count === 'exact';
          head = Boolean(options?.head);
        } else {
          returning = true;
        }
        return api;
      },
      insert(values: Row | Row[]) {
        op = 'insert';
        payload = values;
        return api;
      },
      update(values: Row) {
        op = 'update';
        payload = values;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return api;
      },
      is(column: string, value: unknown) {
        filters.push((row) => (value === null ? row[column] == null : row[column] === value));
        return api;
      },
      in(column: string, values: unknown[]) {
        if (values.length > FAKE_MAX_IN_VALUES) inError = 'URI too long';
        const set = new Set(values);
        filters.push((row) => set.has(row[column]));
        return api;
      },
      order(column: string) {
        orderBy = column;
        return api;
      },
      range(from: number, to: number) {
        rangeArgs = [from, to];
        return api;
      },
      single() {
        const result = run();
        const first = Array.isArray(result.data) ? result.data[0] : result.data;
        return Promise.resolve({ ...result, data: first ?? null });
      },
      maybeSingle() {
        return (api.single as () => Promise<unknown>)();
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(onFulfilled, onRejected);
      },
    };
    return api;
  }

  return {
    tables,
    writes,
    db: {
      schema: (schemaName: string) => ({
        from: (tableName: string) => builder(`${schemaName}.${tableName}`),
      }),
    },
  };
}
