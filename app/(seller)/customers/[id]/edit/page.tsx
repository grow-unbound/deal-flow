'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { BuyerForm } from '@/components/seller/customers/BuyerForm';
import type { BuyerCreateInput } from '@/lib/zod';

interface EditCustomerPageProps {
  params: Promise<{ id: string }>;
}

async function fetchBuyer(id: string) {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

  const res = await fetch(`/api/customers/${id}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load customer');
  const body = await res.json();
  return body.buyer;
}

export default function EditCustomerPage({ params }: EditCustomerPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const {
    data: buyer,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchBuyer(id),
  });

  async function handleSubmit(data: BuyerCreateInput) {
    setIsSubmitting(true);
    setSubmitError(undefined);

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSubmitError(body.error ?? 'Something went wrong');
      setIsSubmitting(false);
      return;
    }

    router.push('/customers');
  }

  if (isLoading) {
    return (
      <>
        <SellerTopbar title="Edit Customer" />
        <div className="px-8 py-6">
          <p className="text-cream-600 text-center py-12">Loading customer…</p>
        </div>
      </>
    );
  }

  if (error || buyer === null) {
    return (
      <>
        <SellerTopbar title="Edit Customer" />
        <div className="px-8 py-6">
          <div className="text-center py-16">
            <p className="text-cream-600 mb-4">Customer not found.</p>
            <Link href="/customers" className="text-teal-600 hover:text-teal-700 flex items-center gap-1 justify-center text-body-sm">
              <ArrowLeft size={16} />
              Back to Customers
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Map the DB row to BuyerCreateInput default values for the form
  const defaultValues: Partial<BuyerCreateInput> = {
    business_name: buyer.business_name ?? '',
    contact_name: buyer.contact_name ?? '',
    phone: buyer.phone ?? '',
    email: buyer.email ?? '',
    gstin: buyer.gstin ?? '',
    external_ref: buyer.external_ref ?? '',
    credit_limit: buyer.credit_limit ?? 0,
    payment_terms_days: buyer.payment_terms_days ?? 0,
    tier: buyer.tier ?? undefined,
    geography: buyer.geography ?? { city: '', state: '', pincode: '', zone: '' },
  };

  return (
    <>
      <SellerTopbar
        title="Edit Customer"
        action={
          <Link href="/customers" className="text-cream-600 hover:text-cream-800 flex items-center gap-1 text-body-sm">
            <ArrowLeft size={16} />
            Back
          </Link>
        }
      />
      <div className="px-8 py-6">
        <FeatureGate flag="CUSTOMER_MASTER">
          <div className="max-w-3xl">
            <BuyerForm
              mode="edit"
              buyerId={id}
              defaultValues={defaultValues}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
              onCancel={() => router.push('/customers')}
            />
          </div>
        </FeatureGate>
      </div>
    </>
  );
}
