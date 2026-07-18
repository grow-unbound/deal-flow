export function mergeSellerLandingPages<T>(pages: T[] | undefined, rowsKey: keyof T): T | undefined {
  const firstPage = pages?.[0];
  if (!firstPage) return undefined;
  return {
    ...firstPage,
    [rowsKey]: pages.flatMap((page) => page[rowsKey] as unknown as unknown[]),
  };
}
