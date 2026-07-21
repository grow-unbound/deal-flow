'use client';

import { useBusinessPolicy } from '@/hooks/useBusinessPolicy';
import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import { formatNumberValue } from '@/lib/utils';
import { BuyerUsersSection } from './BuyerUsersSection';

interface CustomerDetailsTabProps {
  id: string;
  details: TenantCustomerDetailResponse['details'];
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">{label}</p>
      <p className={mono ? 'font-mono text-base text-cream-900' : 'text-base text-cream-900'}>{value}</p>
    </div>
  );
}

function formatAddress(value: Record<string, unknown> | null | undefined) {
  if (!value) return '—';
  const parts = [
    value.address,
    value.street,
    value.city,
    value.state,
    value.zip,
    value.country,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(', ') : '—';
}

export function CustomerDetailsTab({ id, details }: CustomerDetailsTabProps) {
  const { creditEnabled } = useBusinessPolicy();

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <h3 className="font-display text-md text-cream-950">Buyer details</h3>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
          <Row label="Business name" value={details.business_name} />
          <Row label="Contact name" value={details.contact_name ?? '—'} />
          <Row label="Phone" value={details.phone ?? '—'} mono />
          <Row label="Email" value={details.email ?? '—'} />
          <Row label="GSTIN" value={details.gstin ?? '—'} mono />
          <Row label="GST treatment" value={details.gst_treatment ?? '—'} />
          <Row label="Status" value={details.is_active ? 'Active' : 'Inactive'} />
          <Row label="Customer group" value={details.cohorts.length ? details.cohorts.join(', ') : '—'} />
          <Row label="Buyer app" value={details.buyer_app_enabled ? 'Enabled' : 'Disabled'} />
        </div>
      </article>

      <div className="grid grid-cols-2 gap-4">
        <article className="rounded-[14px] border border-cream-300 bg-white p-5">
          <h3 className="font-display text-md text-cream-950">Location</h3>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
            <Row label="City" value={details.city ?? '—'} />
            <Row label="State" value={details.state ?? '—'} />
            <Row label="Pincode" value={details.pincode ?? '—'} mono />
            <Row label="Zone" value={details.zone ?? '—'} />
            <Row label="Billing address" value={formatAddress(details.billing_address)} />
            <Row label="Shipping address" value={formatAddress(details.shipping_address)} />
          </div>
        </article>

        <article className="rounded-[14px] border border-cream-300 bg-white p-5">
          <h3 className="font-display text-md text-cream-950">Commercials</h3>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
            {creditEnabled ? (
              <Row
                label="Credit limit"
                value={details.credit_limit != null ? formatNumberValue(Number(details.credit_limit), 'CURRENCY_EXACT') : '—'}
                mono
              />
            ) : null}
            <Row
              label="Payment terms"
              value={details.payment_terms_days != null ? `Net ${details.payment_terms_days} days` : '—'}
            />
            <Row label="Default pricelist" value={details.assigned_price_list ?? '—'} />
          </div>
        </article>
      </div>

      <BuyerUsersSection buyerId={id} users={details.buyer_users} />
    </section>
  );
}
