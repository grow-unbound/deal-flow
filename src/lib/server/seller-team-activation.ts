import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { Session, User } from '@supabase/supabase-js';
import { firstNameFromValue, isValidIndianMobile, normalizeIndianPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSellerTeamActivationInviteWhatsapp } from '@/lib/server/whatsapp';

export interface PendingSellerActivationRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  user_id: string;
  role: 'seller_admin' | 'seller_assistant';
  full_name: string | null;
  email: string;
  phone: string;
  invited_at: string | null;
}

interface EnsureSellerAuthIdentityInput {
  email: string;
  fullName: string;
  phone: string;
  tenantId: string;
}

function randomPassword(): string {
  return randomUUID().replace(/-/g, '')
    + randomUUID().replace(/-/g, '').slice(0, 32);
}

function isDuplicateAuthUserError(message: string | undefined): boolean {
  return /already.*(registered|exists)|user.*already/i.test(message ?? '');
}

async function findExistingAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to look up auth user: ${error.message}`);
    }

    const users = data?.users ?? [];
    const match = users.find((user) => (user.email ?? '').trim().toLowerCase() === email);
    if (match?.id) {
      return { id: match.id };
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
}

export async function ensureSellerAuthIdentity(
  input: EnsureSellerAuthIdentityInput,
): Promise<{ userId: string }> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = normalizeIndianPhone(input.phone);
  const fullName = input.fullName.trim();

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      first_name: firstNameFromValue(fullName),
      phone: normalizedPhone,
    },
    app_metadata: {
      current_tenant_id: input.tenantId,
    },
  });

  if (!createError && created.user?.id) {
    return { userId: created.user.id };
  }

  if (!isDuplicateAuthUserError(createError?.message)) {
    throw new Error(createError?.message ?? 'Failed to create auth user');
  }

  const existingAuthUser = await findExistingAuthUserByEmail(normalizedEmail);
  if (!existingAuthUser?.id) {
    throw new Error('Failed to find existing auth user after duplicate create attempt');
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      first_name: firstNameFromValue(fullName),
      phone: normalizedPhone,
    },
    app_metadata: {
      current_tenant_id: input.tenantId,
    },
  });

  if (updateError) {
    throw new Error(updateError.message);
  }

  return { userId: existingAuthUser.id };
}

export async function sendSellerTeamActivationInvite(input: {
  tenantName: string;
  fullName: string;
  phone: string;
  tenantId: string;
}): Promise<void> {
  const normalizedPhone = normalizeIndianPhone(input.phone);
  if (!isValidIndianMobile(normalizedPhone)) {
    throw new Error('Valid WhatsApp phone number is required');
  }

  const sent = await sendSellerTeamActivationInviteWhatsapp({
    tenantId: input.tenantId,
    phone: normalizedPhone,
    fullName: input.fullName.trim(),
    tenantName: input.tenantName,
  });

  if (!sent) {
    throw new Error('Failed to send WhatsApp invite');
  }
}

export async function findPendingSellerActivationsByPhone(
  phone: string,
): Promise<PendingSellerActivationRow[]> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const normalizedPhone = normalizeIndianPhone(phone);
  const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await db
    .schema('app')
    .from('tenant_users')
    .select(`
      id,
      tenant_id,
      user_id,
      role,
      full_name,
      email,
      phone,
      invited_at,
      tenants!tenant_id (
        business_name,
        slug
      )
    `)
    .eq('phone', normalizedPhone)
    .eq('is_active', false)
    .is('joined_at', null)
    .is('deleted_at', null)
    .order('invited_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load pending seller invites: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const tenant = row.tenants as Record<string, unknown> | null;
      const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
      const rowPhone = typeof row.phone === 'string' ? normalizeIndianPhone(row.phone) : '';
      if (!email || !rowPhone) return null;

      return {
        id: String(row.id),
        tenant_id: String(row.tenant_id),
        tenant_name: String(tenant?.business_name ?? ''),
        tenant_slug: String(tenant?.slug ?? ''),
        user_id: String(row.user_id),
        role: row.role as 'seller_admin' | 'seller_assistant',
        full_name: typeof row.full_name === 'string' && row.full_name.trim().length > 0 ? row.full_name.trim() : null,
        email,
        phone: rowPhone,
        invited_at: typeof row.invited_at === 'string' ? row.invited_at : null,
      } satisfies PendingSellerActivationRow;
    })
    .filter((row): row is PendingSellerActivationRow => row !== null);
}

export async function mintSellerActivationSession(candidate: PendingSellerActivationRow): Promise<{
  session: Session;
  user: User;
}> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(candidate.user_id, {
    email: candidate.email,
    email_confirm: true,
    user_metadata: {
      full_name: candidate.full_name,
      first_name: firstNameFromValue(candidate.full_name),
      phone: candidate.phone,
    },
    app_metadata: {
      current_tenant_id: candidate.tenant_id,
      current_buyer_id: null,
    },
  });

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: candidate.email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    throw new Error(linkError?.message ?? 'Failed to generate activation session');
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'recovery',
  });

  if (verifyError || !verifyData.session || !verifyData.user) {
    throw new Error(verifyError?.message ?? 'Failed to verify activation session');
  }

  const { data: refreshData, error: refreshError } = await anonClient.auth.refreshSession({
    refresh_token: verifyData.session.refresh_token,
  });

  return {
    session: refreshError || !refreshData.session ? verifyData.session : refreshData.session,
    user: verifyData.user,
  };
}
