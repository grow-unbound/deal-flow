export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildPage(from, to);
    if (error) {
      throw error;
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}
