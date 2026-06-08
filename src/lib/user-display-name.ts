export interface UserMetadataLike {
  full_name?: string | null;
  name?: string | null;
  display_name?: string | null;
  preferred_username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export function resolveUserDisplayName(
  metadata: UserMetadataLike | null | undefined,
  email: string | null | undefined,
  fallback = 'Team member',
): string {
  const parts = [
    metadata?.full_name,
    metadata?.display_name,
    metadata?.name,
    [metadata?.first_name, metadata?.last_name].filter(Boolean).join(' ').trim(),
    metadata?.preferred_username,
    email,
    fallback,
  ];

  for (const value of parts) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallback;
}
