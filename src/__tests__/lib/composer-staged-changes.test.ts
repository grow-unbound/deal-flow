import { describe, expect, it } from 'vitest';

import { buildComposerStagedChanges } from '@/lib/documents/composer-staged-changes';
import type { EstimateComposerTotals } from '@/types/estimate-composer';

const t1180: EstimateComposerTotals = {
  subtotal: 1000,
  discount_flat: 0,
  freight: 0,
  taxable_amount: 1000,
  tax_amount: 180,
  round_off: 0,
  grand_total: 1180,
  total_units: 1,
};

const t1220: EstimateComposerTotals = {
  ...t1180,
  freight: 40,
  taxable_amount: 1040,
  tax_amount: 187,
  grand_total: 1227,
  total_units: 1,
};

const baseSlice = {
  buyerId: 'b1',
  buyerBusinessName: 'Acme',
  buyerPoRef: '',
  dateIssued: '2026-01-01',
  secondDate: '2026-01-10',
  placeOfSupply: 'Delhi',
  sellerNote: '',
  freight: 0,
  discountFlat: 0,
  roundOff: 0,
};

describe('buildComposerStagedChanges', () => {
  it('returns undefined in create mode', () => {
    expect(
      buildComposerStagedChanges({
        mode: 'create',
        dirty: true,
        originalDoc: baseSlice,
        currentDoc: { ...baseSlice, placeOfSupply: 'MH' },
        diffLines: [],
        originalTotals: t1180,
        currentTotals: t1220,
      }),
    ).toBeUndefined();
  });

  it('returns undefined when not dirty', () => {
    expect(
      buildComposerStagedChanges({
        mode: 'edit',
        dirty: false,
        originalDoc: baseSlice,
        currentDoc: baseSlice,
        diffLines: [],
        originalTotals: t1180,
        currentTotals: t1180,
      }),
    ).toBeUndefined();
  });

  it('lists only changed dimensions in edit + dirty', () => {
    const rows = buildComposerStagedChanges({
      mode: 'edit',
      dirty: true,
      originalDoc: baseSlice,
      currentDoc: { ...baseSlice, placeOfSupply: 'MH', freight: 40 },
      diffLines: [{ diff: 'changed' }],
      originalTotals: t1180,
      currentTotals: t1220,
    });
    const labels = rows?.map((r) => r.label) ?? [];
    expect(labels).toContain('Place of supply');
    expect(labels).toContain('Freight & packing');
    expect(labels).toContain('Lines');
    expect(labels).toContain('Grand total');
  });
});
