import { supabaseAdmin } from '@/lib/supabase';

type TenantMemberRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: 'seller_admin' | 'seller_assistant';
  location_ids: string[] | null;
  is_active: boolean;
  invited_at: string | null;
  joined_at: string | null;
};

export type TenantMemberDirectoryRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'seller_admin' | 'seller_assistant';
  location_ids: string[] | null;
  status: 'active' | 'pending' | 'inactive';
  invited_at: string | null;
  joined_at: string | null;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '').slice(-10);
}

export async function getTenantMemberDirectory(tenantId: string): Promise<TenantMemberDirectoryRow[]> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const admin = supabaseAdmin;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('tenant_users')
    .select('id, user_id, full_name, email, phone, role, location_ids, is_active, invited_at, joined_at')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message);
  }

  const memberRows = (rows ?? []) as TenantMemberRow[];

  return memberRows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.email ?? '',
    full_name: row.full_name ?? null,
    phone: row.phone ?? null,
    role: row.role,
    location_ids: row.location_ids ?? null,
    status: row.is_active ? 'active' : (row.joined_at ? 'inactive' : 'pending'),
    invited_at: row.invited_at,
    joined_at: row.joined_at,
  }));
}

export function findDuplicateMember(
  members: TenantMemberDirectoryRow[],
  input: { email: string; phone: string; excludeMemberId?: string },
) {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPhone = normalizePhone(input.phone);

  const duplicate = members.find((member) => {
    if (input.excludeMemberId && member.id === input.excludeMemberId) {
      return false;
    }

    const memberEmail = normalizeEmail(member.email);
    const memberPhone = normalizePhone(member.phone);

    return (
      memberEmail === normalizedEmail ||
      (normalizedPhone.length > 0 && memberPhone === normalizedPhone)
    );
  });

  if (!duplicate) return null;

  return {
    duplicate,
    email: normalizeEmail(duplicate.email) === normalizedEmail,
    phone: normalizedPhone.length > 0 && normalizePhone(duplicate.phone) === normalizedPhone,
  };
}
