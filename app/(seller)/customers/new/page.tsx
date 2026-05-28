'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { BuyerForm } from '@/components/seller/customers/BuyerForm';
import { supabaseBrowser } from '@/lib/supabase-browser';
import type { BuyerCreateInput } from '@/lib/zod';

export default function NewCustomerPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  async function handleSubmit(data: BuyerCreateInput) {
    setIsSubmitting(true);
    setSubmitError(undefined);

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    const res = await fetch('/api/customers', {
      method: 'POST',
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

  return (
    <div className="px-8 py-6">
      <SellerTopbar title="Add Customer" />
        <FeatureGate flag="CUSTOMER_MASTER">
          <div className="max-w-3xl">
            <BuyerForm
              mode="create"
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
              onCancel={() => router.push('/customers')}
            />
          </div>
        </FeatureGate>
    </div>
  );
}
