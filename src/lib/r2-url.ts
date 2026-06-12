const R2_PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_R2_BASE_URL?.replace(/\/+$/, '') ??
  process.env.R2_PUBLIC_URL?.replace(/\/+$/, '') ??
  '';

export function r2Url(key: string | null | undefined): string | null {
  if (!key) return null;
  if (!R2_PUBLIC_BASE_URL) return key;

  const normalizedKey = key.replace(/^\/+/, '');
  return `${R2_PUBLIC_BASE_URL}/${normalizedKey}`;
}
