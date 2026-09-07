type RpcClient = {
  schema: (schema: 'app') => {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown | null }>;
  };
};

async function callInboxRpc(
  db: RpcClient,
  fn: string,
  args: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await db.schema('app').rpc(fn, args);
    if (error) {
      console.error(`[inbox] ${fn} failed`, { ...context, error });
    }
  } catch (error) {
    console.error(`[inbox] ${fn} failed`, { ...context, error });
  }
}

export function syncBuyerEntrySafe(db: RpcClient, buyerId: string): void {
  void callInboxRpc(db, 'sync_entry_from_buyer', { p_buyer_id: buyerId }, { buyer_id: buyerId });
}

export function syncEstimateEntrySafe(db: RpcClient, estimateId: string): void {
  void callInboxRpc(db, 'sync_entry_from_estimate', { p_estimate_id: estimateId }, { estimate_id: estimateId });
}

export function syncOrderEntrySafe(db: RpcClient, orderId: string): void {
  void callInboxRpc(db, 'sync_entry_from_order', { p_order_id: orderId }, { order_id: orderId });
}

export function syncInvoiceEntrySafe(db: RpcClient, invoiceId: string): void {
  void callInboxRpc(db, 'sync_entry_from_invoice', { p_invoice_id: invoiceId }, { invoice_id: invoiceId });
}

export function touchEntryForSourceSafe(
  db: RpcClient,
  input: {
    tenantId: string;
    entryType: string;
    sourceEntityType: string;
    sourceEntityId: string;
    action: string;
    toStatus?: 'new' | 'opened' | 'in_progress' | 'waiting' | 'resolved';
    actorUserId?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
    remindAt?: string | null;
  },
): void {
  void callInboxRpc(
    db,
    'touch_entries_for_source_action',
    {
      p_tenant_id: input.tenantId,
      p_entry_type: input.entryType,
      p_source_entity_type: input.sourceEntityType,
      p_source_entity_id: input.sourceEntityId,
      p_action: input.action,
      p_to_status: input.toStatus ?? 'resolved',
      p_actor_user_id: input.actorUserId ?? null,
      p_note: input.note ?? null,
      p_metadata: input.metadata ?? {},
      p_remind_at: input.remindAt ?? null,
    },
    {
      tenant_id: input.tenantId,
      entry_type: input.entryType,
      source_entity_type: input.sourceEntityType,
      source_entity_id: input.sourceEntityId,
      action: input.action,
    },
  );
}
