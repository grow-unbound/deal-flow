import { supabaseAdmin } from '@/lib/supabase';

/** True when the user created the tenant (signup RPC sets tenants.created_by). */
export async function isTenantCreatorUser(
  tenantId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId || !userId || !supabaseAdmin) return false;

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('tenants')
    .select('created_by')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data?.created_by) return false;
  return data.created_by === userId;
}
