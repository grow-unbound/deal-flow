import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { parseRequestHost } from '@/lib/storefront-host';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') ?? '';
  const kind = parseRequestHost(host);
  if (kind.kind === 'tenant') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }
  return {
    rules: [{ userAgent: '*', allow: '/' }],
  };
}
