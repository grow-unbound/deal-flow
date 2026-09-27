type DbClient = any;

/**
 * Hidden-price enquiries have estimate_items.unit_price = NULL. Convert needs a price on
 * every line it converts, so the seller supplies them in the dialog and we write them onto
 * the estimate lines first (the convert RPCs copy unit_price from estimate_items).
 * Returns an error message when a converted line would still have no price.
 */
export async function applyEstimateLinePrices(
  db: DbClient,
  estimateId: string,
  lineIds: string[],
  priceOverrides: Record<string, number> | undefined,
): Promise<string | null> {
  const overrides = Object.entries(priceOverrides ?? {});
  for (const [lineId, price] of overrides) {
    const { error } = await db
      .schema('app')
      .from('estimate_items')
      .update({ unit_price: price })
      .eq('id', lineId)
      .eq('estimate_id', estimateId)
      .is('deleted_at', null);
    if (error) return 'Failed to save line prices';
  }

  let missing = db
    .schema('app')
    .from('estimate_items')
    .select('id')
    .eq('estimate_id', estimateId)
    .is('deleted_at', null)
    .is('unit_price', null);
  if (lineIds.length > 0) missing = missing.in('id', lineIds);
  const { data, error } = await missing;
  if (error) return 'Failed to validate line prices';
  return (data ?? []).length > 0 ? 'Price required for every converted line' : null;
}

/**
 * Re-run the Inbox sync for an estimate after conversion so its `new_enquiry` entry is
 * resolved server-side immediately (otherwise only the daily refresh would do it).
 * Best-effort: conversion already succeeded, so a failure is logged, not surfaced.
 */
export async function syncInboxEntryForEstimate(db: DbClient, estimateId: string): Promise<void> {
  try {
    const { error } = await db.schema('app').rpc('sync_entry_from_estimate', { p_estimate_id: estimateId });
    if (error) console.error('[estimate convert] inbox entry sync failed', error);
  } catch (e) {
    console.error('[estimate convert] inbox entry sync failed', e);
  }
}
