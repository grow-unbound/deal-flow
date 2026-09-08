import { redirect } from 'next/navigation';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default function InvoicesPage() {
  redirect(SELLER_ROUTES.sales.invoices);
}
