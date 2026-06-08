import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  FulfilmentAlert,
  SectionCard,
  TransactionalDetailSkeleton,
  TransactionalGrid,
  TransactionalPageHead,
  TransactionalStatusBand,
} from '@/components/seller/transactional';
import { PencilLine } from 'lucide-react';

describe('SectionCard', () => {
  it('flush=true omits body padding classes px-5 py-4', () => {
    const { container } = render(
      <SectionCard title="Items" flush>
        <div data-testid="body">content</div>
      </SectionCard>
    );
    const body = container.querySelector('[data-testid="body"]')?.parentElement;
    expect(body).toBeTruthy();
    expect(body?.className.includes('px-5')).toBe(false);
    expect(body?.className.includes('py-4')).toBe(false);
  });

  it('flush=false applies body padding', () => {
    const { container } = render(
      <SectionCard title="Items">
        <div data-testid="body">content</div>
      </SectionCard>
    );
    const body = container.querySelector('[data-testid="body"]')?.parentElement;
    expect(body?.className).toMatch(/px-5/);
    expect(body?.className).toMatch(/py-4/);
  });
});

describe('FulfilmentAlert', () => {
  it('renders null when lines is empty', () => {
    const { container } = render(<FulfilmentAlert lines={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('TransactionalStatusBand', () => {
  it('applies teal fill to done step node', () => {
    const { container } = render(
      <TransactionalStatusBand
        steps={[
          { label: 'Received', state: 'done', timestamp: 'Jun 1' },
          { label: 'Confirmed', state: 'current' },
        ]}
        whatsnext="Next step"
        primaryAction={{ label: 'Confirm', onClick: vi.fn(), variant: 'primary' }}
      />
    );
    expect(container.querySelector('.bg-teal-500')).toBeTruthy();
  });

  it('applies amber ring and pulse to current step node', () => {
    const { container } = render(
      <TransactionalStatusBand
        steps={[
          { label: 'Received', state: 'done' },
          { label: 'Confirmed', state: 'current' },
        ]}
        whatsnext="Next"
        primaryAction={{ label: 'Go', onClick: vi.fn(), variant: 'primary' }}
      />
    );
    const current = container.querySelector('.bg-amber-400');
    expect(current).toBeTruthy();
    expect(current?.className.includes('ring-4')).toBe(true);
    expect(current?.className.includes('animate-pulse')).toBe(true);
  });

  it('applies danger ring to current_danger step node', () => {
    const { container } = render(
      <TransactionalStatusBand
        steps={[
          { label: 'Draft', state: 'done' },
          { label: 'Sent', state: 'current_danger' },
          { label: 'Paid', state: 'future' },
        ]}
        whatsnext="Overdue"
        primaryAction={{ label: 'Pay', onClick: vi.fn(), variant: 'primary' }}
      />
    );
    const danger = container.querySelector('.bg-danger-500');
    expect(danger).toBeTruthy();
    expect(danger?.className.includes('ring-4')).toBe(true);
  });

  it('omits primary CTA when primaryAction is undefined', () => {
    render(
      <TransactionalStatusBand
        steps={[{ label: 'Draft', state: 'future' }]}
        whatsnext="Voided"
      />
    );
    expect(screen.queryByRole('button', { name: /go|pay|confirm/i })).toBeNull();
  });
});

describe('TransactionalGrid', () => {
  it('uses two-column grid with 380px right track', () => {
    const { container } = render(
      <TransactionalGrid left={<div>Left</div>} right={<div>Right</div>} />
    );
    const grid = container.firstElementChild;
    expect(grid?.className.includes('grid-cols-[1fr_380px]')).toBe(true);
  });
});

describe('transactional barrel', () => {
  it('exports all shell components', () => {
    expect(typeof SectionCard).toBe('function');
    expect(typeof TransactionalGrid).toBe('function');
    expect(typeof TransactionalStatusBand).toBe('function');
    expect(typeof FulfilmentAlert).toBe('function');
    expect(typeof TransactionalPageHead).toBe('function');
    expect(typeof TransactionalDetailSkeleton).toBe('function');
  });
});

describe('TransactionalPageHead', () => {
  it('renders doc label, id line, title, and status pill', () => {
    render(
      <TransactionalPageHead
        docTypeLabel="ORDER · RECEIVED"
        idLine="SO-2026-0001"
        title="Acme Traders"
        statusPill={{ label: 'Received', tone: 'neutral' }}
        subtitle={['Placed Jun 1', '4 lines']}
        secondaryActions={[{ label: 'Edit', icon: PencilLine, onClick: vi.fn() }]}
      />
    );
    expect(screen.getByText('ORDER · RECEIVED')).toBeInTheDocument();
    expect(screen.getByText('SO-2026-0001')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acme Traders' })).toBeInTheDocument();
    expect(screen.getByText('Received')).toBeInTheDocument();
  });

  it('applies docTypeLabelClassName to doc-type label', () => {
    const { container } = render(
      <TransactionalPageHead
        docTypeLabel="INVOICE · OVERDUE"
        docTypeLabelClassName="text-danger-600"
        idLine="INV-1"
        title="Buyer"
        statusPill={{ label: 'Overdue', tone: 'danger' }}
        subtitle={[]}
        secondaryActions={[]}
      />
    );
    const label = container.querySelector('.text-danger-600');
    expect(label?.textContent).toBe('INVOICE · OVERDUE');
  });
});

describe('TransactionalDetailSkeleton', () => {
  it('renders status role with aria-label', () => {
    render(<TransactionalDetailSkeleton ariaLabel="Loading" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
