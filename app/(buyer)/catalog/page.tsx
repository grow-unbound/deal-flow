import { redirect } from 'next/navigation';

type CatalogRedirectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BuyerCatalogRedirectPage({ searchParams }: CatalogRedirectPageProps) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) search.append(key, item);
      }
      continue;
    }
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  redirect(qs ? `/buy/home?${qs}` : '/buy/home');
}
