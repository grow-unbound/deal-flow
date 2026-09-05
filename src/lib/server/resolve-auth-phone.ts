import { BUYER_ROLES, SELLER_ROLES } from '@/constants';
import { resolveSellerAuthPhone } from '@/lib/server/buyer-access';
import { supabaseAdmin } from '@/lib/supabase';

/** Authoritative phone for an authenticated user (seller or buyer). */
export async function resolveCallerPhone(userId: string, role: string | null): Promise<string | null> {
  if (!supabaseAdmin) return null;

  if (role && (SELLER_ROLES as readonly string[]).includes(role)) {
    return resolveSellerAuthPhone(userId);
  }

  if (role && (BUYER_ROLES as readonly string[]).includes(role)) {
    const { data: ownerRow } = await supabaseAdmin
      .schema('app')
      .from('buyers')
      .select('phone')
      .eq('user_id', userId)
      .maybeSingle();
    const ownerPhone = (ownerRow as { phone: string | null } | null)?.phone;
    if (ownerPhone) return ownerPhone;

    const { data } = await supabaseAdmin
      .schema('app')
      .from('buyer_users')
      .select('phone')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as { phone: string | null } | null)?.phone ?? null;
  }

  return null;
}
