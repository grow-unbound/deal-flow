import { supabaseAdmin } from '@/lib/supabase';
import { resolveUserDisplayName } from '@/lib/user-display-name';

export async function getAuthUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const distinctIds = Array.from(new Set(userIds.filter(Boolean)));
  const userMap = new Map<string, string>();

  if (distinctIds.length === 0 || !supabaseAdmin) {
    return userMap;
  }

  const admin = supabaseAdmin;

  const results = await Promise.allSettled(
    distinctIds.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        throw error;
      }

      return {
        id: userId,
        email: data.user?.email ?? 'Team member',
      };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      userMap.set(result.value.id, result.value.email);
      continue;
    }

    console.error('[auth-user-directory] Failed to fetch auth user:', result.reason);
  }

  return userMap;
}

export async function getAuthUserDisplayNameMap(userIds: string[]): Promise<Map<string, string>> {
  const distinctIds = Array.from(new Set(userIds.filter(Boolean)));
  const userMap = new Map<string, string>();

  if (distinctIds.length === 0 || !supabaseAdmin) {
    return userMap;
  }

  const admin = supabaseAdmin;

  const results = await Promise.allSettled(
    distinctIds.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        throw error;
      }

      return {
        id: userId,
        displayName: resolveUserDisplayName(
          data.user?.user_metadata as Record<string, unknown> | undefined,
          data.user?.email,
          'Team member',
        ),
      };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      userMap.set(result.value.id, result.value.displayName);
      continue;
    }

    console.error('[auth-user-directory] Failed to fetch auth user display name:', result.reason);
  }

  return userMap;
}
