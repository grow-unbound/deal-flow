import { formatDate, formatAsOfLabel, formatNumberValue } from '@/lib/utils';
import {
  readExistingBuyerContext,
  type ExistingBuyerContext,
  type ExistingBuyerPeriodPair,
} from '@/lib/inbox/inbox-entry-copy';
import type { InboxEntry } from '@/lib/inbox/inbox-types';

function metaText(entry: InboxEntry, key: string): string | null {
  const value = entry.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const money = (value: number) => formatNumberValue(value, 'CURRENCY_EXACT');
const countOf = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

function PeriodRow({ label, current, previous }: { label: string; current: string; previous: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-base">
      <dt className="text-cream-600">{label}</dt>
      <dd className="text-right font-medium text-cream-900">{current}</dd>
      <dd className="text-right text-cream-700">{previous}</dd>
    </div>
  );
}

function pairRows<T>(pair: ExistingBuyerPeriodPair<T>, render: (v: T) => string): [string, string] {
  return [render(pair.current), render(pair.previous)];
}

const DEMAND_LABEL: Record<ExistingBuyerContext['demand']['kind'], { value: string; count: string } | null> = {
  orders: { value: 'Order value', count: 'order' },
  estimates: { value: 'Enquiry value', count: 'enquiry' },
  none: null,
};

/** Existing-customer snapshot: sales and demand this vs last quarter, plus current dues. */
function ExistingBuyerContextPanel({ context }: { context: ExistingBuyerContext }) {
  const [salesNow, salesPrev] = pairRows(context.sales, (v) => `${money(v.invoice_value)} · ${countOf(v.invoice_count, 'invoice')}`);
  const demand = DEMAND_LABEL[context.demand.kind];
  const [demandNow, demandPrev] = pairRows(context.demand, (v) => `${money(v.value)} · ${countOf(v.count, demand?.count ?? '')}`);
  const { dues } = context;
  const asOf = formatAsOfLabel(context.computed_at);

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3">
        <p className="text-base font-medium text-warning-700">Existing customer — Buyer App access is disabled</p>
        <p className="mt-0.5 text-base text-warning-700/90">
          This customer already buys from you. They asked to have app access switched on.
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-caption text-cream-600">
          <span />
          <span className="text-right">This quarter</span>
          <span className="text-right">Last quarter</span>
        </div>
        <dl className="space-y-2">
          <PeriodRow label="Sales" current={salesNow} previous={salesPrev} />
          {demand ? (
            <PeriodRow label={demand.value} current={demandNow} previous={demandPrev} />
          ) : null}
        </dl>
      </div>

      <dl className="space-y-2 text-base">
        <div className="flex justify-between gap-4">
          <dt className="text-cream-600">Outstanding</dt>
          <dd className="font-medium text-cream-900">
            {money(dues.receivable_amount)} · {countOf(dues.receivable_invoice_count, 'invoice')}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-cream-600">Overdue</dt>
          <dd className={dues.overdue_amount > 0 ? 'font-medium text-danger-500' : 'font-medium text-cream-900'}>
            {money(dues.overdue_amount)} · {countOf(dues.overdue_invoice_count, 'invoice')}
          </dd>
        </div>
        {dues.credit_limit > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-cream-600">Credit limit</dt>
            <dd className="font-medium text-cream-900">
              {money(dues.credit_limit)}
              {dues.credit_available != null ? ` · ${money(dues.credit_available)} available` : ''}
            </dd>
          </div>
        ) : null}
      </dl>
      {asOf ? <p className="text-caption text-cream-600">{asOf}</p> : null}
    </section>
  );
}

/** Onboarding-form details the buyer submitted, as plain label/value rows. */
export function InboxApprovalDetails({ entry }: { entry: InboxEntry }) {
  const existingContext = readExistingBuyerContext(entry);
  const rows: Array<[string, string | null]> = [
    ['Business name', metaText(entry, 'business_name')],
    ['Contact name', metaText(entry, 'contact_name')],
    ['Phone', metaText(entry, 'phone') ?? entry.buyer_phone],
    ['GSTIN', metaText(entry, 'gstin')],
    [existingContext ? 'Requested' : 'Submitted', entry.created_at ? formatDate(entry.created_at) : null],
  ];
  const visible = rows.filter((row): row is [string, string] => row[1] != null);
  if (visible.length === 0 && !existingContext) return null;

  return (
    <div className="space-y-5">
      {existingContext ? <ExistingBuyerContextPanel context={existingContext} /> : null}
      {visible.length > 0 ? (
        <dl className="space-y-3.5">
          {visible.map(([label, value]) => (
            <div key={label}>
              <dt className="text-base text-cream-600">{label}</dt>
              <dd className="mt-0.5 min-w-0 break-words text-md font-medium text-cream-900">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
