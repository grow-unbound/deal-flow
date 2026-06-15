'use client';

import { useRole } from '@/hooks/useRole';
import { useBusinessPolicy } from '@/hooks/useBusinessPolicy';
import type { TenantCustomerDetailResponse } from '@/hooks/useCustomersLanding';
import { formatCurrency } from '@/lib/utils';

interface CustomerDetailsTabProps {
  id: string;
  details: TenantCustomerDetailResponse['details'];
  onEdit?: () => void;
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cream-700">{label}</p>
      <p className={mono ? 'font-mono text-base text-cream-900' : 'text-base text-cream-900'}>{value}</p>
    </div>
  );
}

export function CustomerDetailsTab({ id: _id, details, onEdit }: CustomerDetailsTabProps) {
  const { isSellerAdmin } = useRole();
  const { creditEnabled } = useBusinessPolicy();

  return (
    <section className="mt-5 space-y-4">
      <article className="rounded-[14px] border border-cream-300 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg text-cream-950">Buyer details</h3>
          {isSellerAdmin ? (
            <button type="button" onClick={onEdit} className="text-base font-medium text-teal-700 hover:text-teal-800">
              Edit
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Row label="Business name" value={details.business_name} />
          <Row label="Contact name" value={details.contact_name ?? '—'} />
          <Row label="Phone" value={details.phone ?? '—'} mono />
          <Row label="Email" value={details.email ?? '—'} />
          <Row label="GSTIN" value={details.gstin ?? '—'} mono />
          <Row label="ERP ID" value={details.external_ref ?? '—'} mono />
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
          </div>
        </article>

        <article className="rounded-[14px] border border-cream-300 bg-white p-5">
          <h3 className="font-display text-md text-cream-950">Commercials</h3>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4">
            {creditEnabled ? (
              <Row
                label="Credit limit"
                value={details.credit_limit != null ? formatCurrency(Number(details.credit_limit)) : '—'}
                mono
              />
            ) : null}
            <Row
              label="Payment terms"
              value={details.payment_terms_days != null ? `Net ${details.payment_terms_days} days` : '—'}
            />
            <Row
              label="Cohort assignment"
              value={details.cohorts.length ? details.cohorts.join(', ') : '—'}
            />
            <Row label="Status" value={details.is_active ? 'Active' : 'Inactive'} />
          </div>
        </article>
      </div>
    </section>
  );
}
