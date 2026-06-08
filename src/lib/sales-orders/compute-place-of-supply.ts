/** Place of supply for GST display — not persisted on documents; derived from buyer geography or GSTIN state code. */
export function computePlaceOfSupplyFromBuyer(
  geography: Record<string, unknown> | null | undefined,
  gstin: string | null | undefined,
): string {
  const geo = geography ?? null;
  const stateFromGeo = typeof geo?.state === 'string' && geo.state.trim() ? geo.state.trim() : '';
  const stateFromGst = typeof gstin === 'string' && gstin.trim().length >= 2 ? gstin.trim().slice(0, 2).toUpperCase() : '';
  return stateFromGeo || stateFromGst || 'Unknown';
}
