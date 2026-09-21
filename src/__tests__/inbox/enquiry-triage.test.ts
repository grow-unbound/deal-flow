import { describe, expect, it } from 'vitest';
import { deriveVelocity, enquiryStockStatus, pickAlternates, type AlternateCandidate } from '@/lib/inbox/enquiry-triage';

const vel = (u: number) => deriveVelocity({ invoice_units_90d: u });
const cand = (id: string, brandId: string | null, available: number, units: number): AlternateCandidate => ({
  tenantProductId: id, name: id, sku: id, brandId, brandName: null, available, velocity: vel(units),
});

describe('enquiryStockStatus', () => {
  it('flags out of stock, short and ok like LinesTable', () => {
    expect(enquiryStockStatus(5, 0)).toMatchObject({ tone: 'danger', label: 'Out of stock' });
    expect(enquiryStockStatus(5, 3)).toMatchObject({ tone: 'warning', label: 'Short by 2', shortBy: 2 });
    expect(enquiryStockStatus(5, 5).tone).toBe('ok');
  });
});

describe('deriveVelocity', () => {
  it('converts 90d units to per-week', () => {
    expect(vel(90).unitsPerWeek).toBe(7);
    expect(deriveVelocity(null)).toEqual({ unitsPerWeek: 0, daysCover: null, lastInvoiceAt: null });
  });
});

describe('pickAlternates', () => {
  const line = { tenantProductId: 'x', brandId: 'b1', qty: 10 };
  it('excludes self and under-stocked, ranks same brand then velocity, caps at 3', () => {
    const out = pickAlternates(line, [
      cand('x', 'b1', 99, 99),
      cand('low', 'b1', 5, 50),
      cand('other-fast', 'b2', 20, 90),
      cand('same-slow', 'b1', 20, 10),
      cand('other-slow', 'b2', 20, 5),
      cand('other-mid', 'b2', 20, 30),
    ]);
    expect(out.map((a) => a.tenantProductId)).toEqual(['same-slow', 'other-fast', 'other-mid']);
    expect(out[0].sameBrand).toBe(true);
  });
});
