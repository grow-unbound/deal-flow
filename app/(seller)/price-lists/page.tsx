import { redirect } from 'next/navigation';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function PriceListsPage() {
  redirect(SELLER_ROUTES.market.pricing);
}
