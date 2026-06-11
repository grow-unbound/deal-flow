import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CreateBrandForm } from '@/components/seller/brands/CreateBrandForm';
import { getFlag, FLAGS } from '@/lib/flags';

export default async function NewBrandPage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  if (!(await getFlag(FLAGS.BRAND_PRODUCT_MASTER, tenantId))) return <FeatureForbiddenPage />;

  return (
    <div className="px-8 py-6">
      <SellerTopbar title="New Brand" />
      <div className="mx-auto max-w-2xl">
        <CreateBrandForm />
      </div>
    </div>
  );
}
