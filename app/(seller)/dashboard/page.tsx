import { redirect } from 'next/navigation';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function DashboardRedirectPage() {
  redirect(SELLER_ROUTES.pulse);
}
