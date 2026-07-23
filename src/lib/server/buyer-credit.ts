import { hasInvoiceReceivableExposure } from '@/lib/invoice-status';

const DAY_MS = 86_400_000;

type BuyerCreditDbClient = {
  schema: (schema: 'app') => {
    from: (table: 'buyers' | 'invoices') => {
      select: (columns: string) => any;
    };
  };
};

export interface BuyerCreditSnapshot {
  buyer_id: string;
  credit_limit: number;
  outstanding_dues: number;
  credit_used: number;
  available_credit: number;
  open_invoice_count: number;
  earliest_due_date: string | null;
  days_until_earliest_due: number | null;
}

interface LoadBuyerCreditSnapshotsArgs {
  tenantId: string;
  buyerIds: string[];
  creditLimitByBuyerId?: Map<string, number>;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntilDate(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - startOfToday().getTime()) / DAY_MS);
}

export async function loadBuyerCreditSnapshots(
  db: BuyerCreditDbClient,
  { tenantId, buyerIds, creditLimitByBuyerId }: LoadBuyerCreditSnapshotsArgs,
): Promise<Map<string, BuyerCreditSnapshot>> {
  const snapshots = new Map<string, BuyerCreditSnapshot>();
  const uniqueBuyerIds = Array.from(new Set(buyerIds.filter(Boolean)));
  if (uniqueBuyerIds.length === 0) {
    return snapshots;
  }

  let resolvedCreditLimits = creditLimitByBuyerId;
  if (!resolvedCreditLimits) {
    resolvedCreditLimits = new Map<string, number>();
    for (const buyerChunk of chunkArray(uniqueBuyerIds, 1000)) {
      const buyersRes = await db
        .schema('app')
        .from('buyers')
        .select('id, credit_limit')
        .eq('tenant_id', tenantId)
        .in('id', buyerChunk)
        .is('deleted_at', null);

      if (buyersRes.error) {
        return snapshots;
      }

      for (const row of (buyersRes.data ?? []) as Array<{ id: string; credit_limit: number | null }>) {
        resolvedCreditLimits.set(row.id, Number(row.credit_limit ?? 0));
      }
    }
  }

  for (const buyerId of uniqueBuyerIds) {
    const creditLimit = Number(resolvedCreditLimits.get(buyerId) ?? 0);
    snapshots.set(buyerId, {
      buyer_id: buyerId,
      credit_limit: creditLimit,
      outstanding_dues: 0,
      credit_used: 0,
      available_credit: creditLimit,
      open_invoice_count: 0,
      earliest_due_date: null,
      days_until_earliest_due: null,
    });
  }

  // Fetch all non-deleted invoices regardless of status — the receivable
  // predicate below (status + outstanding_balance) is the authoritative
  // filter, not a bare `.neq('status', 'draft')`, which would still count
  // stray positive outstanding_balance on `void` invoices as owed.
  const invoicesQuery = db
    .schema('app')
    .from('invoices')
    .select('buyer_id, outstanding_balance, due_date, status')
    .eq('tenant_id', tenantId);

  for (const buyerChunk of chunkArray(uniqueBuyerIds, 1000)) {
    const invoicesRes = buyerChunk.length === 1
      ? await invoicesQuery.eq('buyer_id', buyerChunk[0]).is('deleted_at', null)
      : await invoicesQuery.in('buyer_id', buyerChunk).is('deleted_at', null);

    if (invoicesRes.error) {
      return snapshots;
    }

    for (const row of (invoicesRes.data ?? []) as Array<{
      buyer_id: string;
      outstanding_balance: number | null;
      due_date: string | null;
      status: string | null;
    }>) {
      const snapshot = snapshots.get(row.buyer_id);
      if (!snapshot) continue;

      const outstanding = Number(row.outstanding_balance ?? 0);
      if (!hasInvoiceReceivableExposure({ status: row.status ?? '', outstanding_balance: row.outstanding_balance })) continue;

      snapshot.outstanding_dues += outstanding;
      snapshot.credit_used += outstanding;
      snapshot.open_invoice_count += 1;

      if (row.due_date) {
        if (!snapshot.earliest_due_date || new Date(row.due_date).getTime() < new Date(snapshot.earliest_due_date).getTime()) {
          snapshot.earliest_due_date = row.due_date;
        }
      }
    }
  }

  for (const snapshot of snapshots.values()) {
    snapshot.outstanding_dues = Number(snapshot.outstanding_dues.toFixed(2));
    snapshot.credit_used = Number(snapshot.credit_used.toFixed(2));
    snapshot.available_credit = Math.max(snapshot.credit_limit - snapshot.outstanding_dues, 0);
    snapshot.days_until_earliest_due = daysUntilDate(snapshot.earliest_due_date);
  }

  return snapshots;
}

export async function loadBuyerCreditSnapshot(
  db: BuyerCreditDbClient,
  args: { tenantId: string; buyerId: string; creditLimit?: number },
): Promise<BuyerCreditSnapshot> {
  const creditLimitByBuyerId = new Map<string, number>();
  if (typeof args.creditLimit === 'number') {
    creditLimitByBuyerId.set(args.buyerId, args.creditLimit);
  }

  const snapshots = await loadBuyerCreditSnapshots(db, {
    tenantId: args.tenantId,
    buyerIds: [args.buyerId],
    creditLimitByBuyerId: creditLimitByBuyerId.size > 0 ? creditLimitByBuyerId : undefined,
  });

  return snapshots.get(args.buyerId) ?? {
    buyer_id: args.buyerId,
    credit_limit: Number(args.creditLimit ?? 0),
    outstanding_dues: 0,
    credit_used: 0,
    available_credit: Number(args.creditLimit ?? 0),
    open_invoice_count: 0,
    earliest_due_date: null,
    days_until_earliest_due: null,
  };
}
