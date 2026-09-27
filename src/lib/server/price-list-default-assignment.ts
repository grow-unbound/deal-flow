type AppDbClient = {
  schema: (schema: 'app') => {
    from: (table: string) => any;
  };
};

interface SyncDefaultPriceListAssignmentOptions {
  tenantId: string;
  priceListId: string;
  userId: string | null;
  enabled: boolean;
}

function assignmentDeletePayload(userId: string | null) {
  const now = new Date().toISOString();
  return {
    deleted_at: now,
    updated_at: now,
    updated_by: userId,
  };
}

export async function syncDefaultPriceListAssignment(
  db: AppDbClient,
  { tenantId, priceListId, userId, enabled }: SyncDefaultPriceListAssignmentOptions,
) {
  if (enabled) {
    const { data: tenantPriceLists, error: listError } = await db
      .schema('app')
      .from('price_lists')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .limit(10_000);

    if (listError) {
      throw new Error(listError.message ?? 'Failed to load tenant price lists');
    }

    const tenantPriceListIds = ((tenantPriceLists ?? []) as Array<{ id: string }>)
      .map((row) => row.id)
      .filter(Boolean);

    if (tenantPriceListIds.length > 0) {
      const { error: clearError } = await db
        .schema('app')
        .from('price_list_assignments')
        .update(assignmentDeletePayload(userId))
        .eq('target_type', 'all_buyers')
        .is('deleted_at', null)
        .in('price_list_id', tenantPriceListIds);

      if (clearError) {
        throw new Error(clearError.message ?? 'Failed to clear existing default pricelists');
      }
    }

    const { data: assignment, error: insertError } = await db
      .schema('app')
      .from('price_list_assignments')
      .insert({
        price_list_id: priceListId,
        target_type: 'all_buyers',
        target_id: null,
        created_by: userId,
        updated_by: userId,
        deleted_at: null,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message ?? 'Failed to save default pricelist');
    }

    return assignment;
  }

  const { error: clearError } = await db
    .schema('app')
    .from('price_list_assignments')
    .update(assignmentDeletePayload(userId))
    .eq('price_list_id', priceListId)
    .eq('target_type', 'all_buyers')
    .is('deleted_at', null);

  if (clearError) {
    throw new Error(clearError.message ?? 'Failed to remove default pricelist');
  }

  return null;
}
