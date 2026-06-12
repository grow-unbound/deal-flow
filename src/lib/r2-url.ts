const R2_PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_R2_BASE_URL?.replace(/\/+$/, '') ??
  process.env.R2_PUBLIC_URL?.replace(/\/+$/, '') ??
  '';

export type ProductVariantKeySet = {
  original: string;
  large: string;
  medium: string;
  small: string;
  thumb: string;
};

export type MediaVariantKeySet = {
  original: string;
  medium: string;
  thumb: string;
};

export type HeroVariantKeySet = {
  original: string;
  medium: string;
};

export type AvatarVariantKeySet = {
  original: string;
  small: string;
  thumb: string;
};

export type VariantKeySet =
  | ProductVariantKeySet
  | MediaVariantKeySet
  | HeroVariantKeySet
  | AvatarVariantKeySet;

export function r2Url(key: string | null | undefined): string | null {
  if (!key) return null;
  if (!R2_PUBLIC_BASE_URL) return key;

  const normalizedKey = key.replace(/^\/+/, '');
  return `${R2_PUBLIC_BASE_URL}/${normalizedKey}`;
}

export function r2Urls<T extends Record<string, string | null | undefined>>(
  keys: T,
): { [K in keyof T]: string | null } {
  const entries = Object.entries(keys).map(([variant, key]) => [variant, r2Url(key)]);
  return Object.fromEntries(entries) as { [K in keyof T]: string | null };
}
