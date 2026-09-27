export async function runConcurrent<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const concurrency = Math.max(1, Math.min(limit, items.length || 1));
  let next = 0;

  async function pump(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      await worker(item, index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => pump()));
}
