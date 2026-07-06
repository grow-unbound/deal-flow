export function formatProvisionalEstimateNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `EST-${year}-${String(sequence).padStart(4, '0')}`;
}

export function formatProvisionalOrderNumber(sequence: number): string {
  const year = new Date().getFullYear();
  return `ORD-${year}-${String(sequence).padStart(4, '0')}`;
}

export async function nextProvisionalEstimateSequence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
): Promise<number> {
  const { count } = await db
    .schema('app')
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  return (count ?? 0) + 1;
}

export async function nextProvisionalOrderSequence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
): Promise<number> {
  const { count } = await db
    .schema('app')
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  return (count ?? 0) + 1;
}
