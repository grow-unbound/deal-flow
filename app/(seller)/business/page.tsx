import { redirect } from 'next/navigation';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function BusinessPage() {
  redirect(SELLER_ROUTES.business.branches);
}
