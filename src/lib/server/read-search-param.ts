export async function resolveOptionalSearchParam(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
  key = 'search',
): Promise<string | undefined> {
  if (!searchParams) return undefined;

  const params = await searchParams;
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
