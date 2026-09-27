import { redirect } from 'next/navigation';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function WarehousesPage() {
  redirect(SELLER_ROUTES.business.warehouses);
}
