import { cn, formatAsOfLabel, formatNumberValue } from '@/lib/utils';
import type { ExistingBuyerContext } from '@/lib/inbox/inbox-entry-copy';

const money = (value: number) => formatNumberValue(value, 'CURRENCY_EXACT');
const countOf = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-cream-500">{children}</p>;
}

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'danger';
}

/** One number with its label and a small supporting line — never more than that, so it never crams. */
function Tile({ label, value, sub, tone = 'default' }: TileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-cream-200 bg-cream-50 px-3 py-2.5">
      <p className="truncate text-sm text-cream-600">{label}</p>
      <p className={cn('mt-0.5 truncate text-md font-semibold tabular-nums', tone === 'danger' ? 'text-danger-500' : 'text-cream-900')}>
        {value}
      </p>
      {sub ? <p className="truncate text-sm text-cream-600">{sub}</p> : null}
    </div>
  );
}

const DEMAND_COPY: Record<'orders' | 'estimates', { title: string; noun: string }> = {
  orders: { title: 'Orders', noun: 'order' },
  estimates: { title: 'Enquiries', noun: 'enquiry' },
};

function footnote(context: ExistingBuyerContext): string | null {
  const asOf = formatAsOfLabel(context.computed_at);
  const { period, dues } = context.sources;
  if (period === 'live' && dues === 'live') return 'Live figures from the latest records.';
  if (period === 'live' || dues === 'live') {
    return `${period === 'live' ? 'Sales and demand' : 'Dues'} are live; the rest ${asOf ?? 'comes from the latest summary'}.`;
  }
  return asOf ? `Figures ${asOf}.` : null;
}

/**
 * Existing-customer snapshot for an access-request entry: who is asking, how they buy (sales and
 * primary demand, this vs last quarter) and what they owe. Two tiles per row so it stays readable
 * at phone width and in the desktop inline card alike.
 */
export function InboxExistingBuyerSummary({ context }: { context: ExistingBuyerContext }) {
  const { sales, demand, dues } = context;
  const demandCopy = demand.kind === 'none' ? null : DEMAND_COPY[demand.kind];
  const note = footnote(context);

  return (
    <section className="space-y-5" aria-label="Existing customer summary">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="inline-flex items-center rounded-full border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-sm font-medium text-warning-700">
          Existing customer
        </span>
        <span className="text-base text-cream-700">Buyer App access is off. They asked for it to be switched on.</span>
      </div>

      <div>
        <SectionHeading>Sales · invoiced</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Tile label="This quarter" value={money(sales.current.invoice_value)} sub={countOf(sales.current.invoice_count, 'invoice')} />
          <Tile label="Last quarter" value={money(sales.previous.invoice_value)} sub={countOf(sales.previous.invoice_count, 'invoice')} />
        </div>
      </div>

      {demandCopy ? (
        <div>
          <SectionHeading>{demandCopy.title}</SectionHeading>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="This quarter" value={money(demand.current.value)} sub={countOf(demand.current.count, demandCopy.noun)} />
            <Tile label="Last quarter" value={money(demand.previous.value)} sub={countOf(demand.previous.count, demandCopy.noun)} />
          </div>
        </div>
      ) : null}

      <div>
        <SectionHeading>Dues</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Outstanding" value={money(dues.receivable_amount)} sub={countOf(dues.receivable_invoice_count, 'invoice')} />
          <Tile
            label="Overdue"
            value={money(dues.overdue_amount)}
            sub={countOf(dues.overdue_invoice_count, 'invoice')}
            tone={dues.overdue_amount > 0 ? 'danger' : 'default'}
          />
          {dues.credit_limit > 0 ? (
            <>
              <Tile label="Credit limit" value={money(dues.credit_limit)} />
              {dues.credit_available != null ? <Tile label="Credit available" value={money(dues.credit_available)} /> : null}
            </>
          ) : null}
        </div>
      </div>

      {note ? <p className="text-sm text-cream-600">{note}</p> : null}
    </section>
  );
}
