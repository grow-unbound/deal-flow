import { supabaseAdmin } from '@/lib/supabase';

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
