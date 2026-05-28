import { supabaseAdmin } from '@/lib/supabase';

type TenantMemberRow = {
  id: string;
  user_id: string;
  role: 'seller_admin' | 'seller_assistant';
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const { data: rows, error } = await db
    .schema('app')
    .from('tenant_users')
    .select('id, user_id, role, is_active, invited_at, joined_at')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(error.message);
  }

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const authMap = new Map(
    (authUsers?.users ?? []).map((user) => [
      user.id,
      {
        email: user.email ?? '',
        full_name: (user.user_metadata?.full_name as string) ?? null,
        phone: (user.user_metadata?.phone as string) ?? user.phone ?? null,
      },
    ]),
  );

  return ((rows ?? []) as TenantMemberRow[]).map((row) => {
    const auth = authMap.get(row.user_id);

    return {
      id: row.id,
      user_id: row.user_id,
      email: auth?.email ?? '',
      full_name: auth?.full_name ?? null,
      phone: auth?.phone ?? null,
      role: row.role,
      status: row.is_active ? 'active' : (row.joined_at ? 'inactive' : 'pending'),
      invited_at: row.invited_at,
      joined_at: row.joined_at,
    };
  });
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
