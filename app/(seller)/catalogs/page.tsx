import { redirect } from 'next/navigation';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function CatalogsRedirectPage() {
  redirect(SELLER_ROUTES.market.catalogs);
}
