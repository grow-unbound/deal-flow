type AnyAdminClient = any;
type AnyQuery = any;

export interface LocationAssociatedUser {
  email: string;
  user_name: string | null;
  user_id: string | null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function parseLocationAssociatedUserEmails(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asString(entry))
      .filter((entry): entry is string => entry !== null)
      .map(normalizeEmail)
      .filter((email) => email.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/g)
      .map((part) => normalizeEmail(part))
      .filter((email) => email.length > 0);
  }

  return [];
}

export function normalizeLocationAssociatedUsers(value: unknown): LocationAssociatedUser[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const email = normalizeEmail(entry);
        return email ? { email, user_name: null, user_id: null } : null;
      }

      if (typeof entry !== 'object' || entry === null) return null;
      const row = entry as Record<string, unknown>;
      const email = asString(row.email);
      if (!email) return null;

      return {
        email: normalizeEmail(email),
        user_name: asString(row.user_name ?? row.name),
        user_id: asString(row.user_id),
      };
    })
    .filter((entry): entry is LocationAssociatedUser => entry !== null);
}

function uniqByEmail(users: LocationAssociatedUser[]): LocationAssociatedUser[] {
  const seen = new Set<string>();
  const out: LocationAssociatedUser[] = [];
  for (const user of users) {
    const key = normalizeEmail(user.email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...user, email: key });
  }
  return out;
}

export async function syncLocationAssignees(
  admin: AnyAdminClient,
  tenantId: string,
  locationId: string,
  users: Array<Pick<LocationAssociatedUser, 'email' | 'user_name'>>,
  actorId: string | null,
): Promise<LocationAssociatedUser[]> {
  const desiredUsers = uniqByEmail(
    users
      .map((user) => ({
        email: normalizeEmail(user.email),
        user_name: user.user_name ?? null,
        user_id: null,
      }))
      .filter((user) => user.email.length > 0),
  );

  if (desiredUsers.length === 0) return [];

  const now = new Date().toISOString();
  const { data: authUsers } = await admin.auth.admin.listUsers();
  const authByEmail = new Map<string, { id: string; email: string; user_name: string | null }>();
  for (const user of (authUsers?.users ?? []) as Array<{
    id: string;
    email: string | null;
    user_metadata?: Record<string, unknown>;
  }>) {
    const email = normalizeEmail(user.email ?? '');
    if (!email) continue;
    authByEmail.set(email, {
      id: user.id,
      email,
      user_name: asString((user.user_metadata ?? {})['full_name']) ?? user.email ?? null,
    });
  }

  const resolved: LocationAssociatedUser[] = [];
  for (const user of desiredUsers) {
    const existingAuth = authByEmail.get(user.email);
    let userId = existingAuth?.id ?? null;
    let userName = user.user_name ?? existingAuth?.user_name ?? null;

    if (!userId) {
      const email = normalizeEmail(user.email);
      const { data: inviteData, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          tenant_id: tenantId,
          role: 'seller_assistant',
          full_name: user.user_name ?? user.email,
        },
      });

      if (error || !inviteData?.user?.id) {
        continue;
      }

      userId = inviteData.user.id;
      userName = userName ?? user.email;
      authByEmail.set(email, { id: userId as string, email, user_name: userName });
    }

    if (!userId) continue;

    const { data: tenantUser } = await admin
      .schema('app')
      .from('tenant_users')
      .select('id, location_ids, role, is_active')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!tenantUser) {
      await admin.schema('app').from('tenant_users').insert({
        tenant_id: tenantId,
        user_id: userId,
        role: 'seller_assistant',
        location_ids: [locationId],
        is_active: true,
        invited_at: null,
        joined_at: now,
        created_by: actorId,
        updated_by: actorId,
      });
    } else {
      const currentLocations = Array.isArray(tenantUser.location_ids)
        ? tenantUser.location_ids.filter((locationIdValue: unknown): locationIdValue is string => typeof locationIdValue === 'string' && locationIdValue.length > 0)
        : [];
      if (!currentLocations.includes(locationId)) {
        await admin.schema('app').from('tenant_users').update({
          location_ids: [...currentLocations, locationId],
          updated_at: now,
          updated_by: actorId,
        }).eq('id', tenantUser.id as string);
      }
    }

    resolved.push({ email: user.email, user_name: userName, user_id: userId });
  }

  return resolved;
}
