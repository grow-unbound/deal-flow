export function priceListsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? null) === (b ?? null);
}

export function compareWinningPriceLists(
  a: { price_list_id: string | null },
  b: { price_list_id: string | null },
): boolean {
  return priceListsEqual(a.price_list_id, b.price_list_id);
}
