import { describe, expect, it } from 'vitest';

import {
  buildCustomersFilterPreset,
  chipsFromFilterPreset,
  chipsFromKpiId,
  kpiIdFromChips,
} from '@/lib/customers-landing-filters';

describe('customers landing filters', () => {
  it('maps KPI ids to filter chips', () => {
    expect(chipsFromKpiId('active_customers')).toEqual({
      status: ['active'],
      outstanding: [],
      buyer_app: [],
    });
    expect(chipsFromKpiId('dormant_customers').status).toEqual(['dormant']);
    expect(chipsFromKpiId('overdue_receivables').outstanding).toEqual(['overdue']);
    expect(chipsFromKpiId('top80_customers').status).toEqual(['active']);
  });

  it('builds presets from chips including top80', () => {
    expect(buildCustomersFilterPreset({ status: ['active'], outstanding: [], buyer_app: [] })).toEqual({
      purchased_gte: 1,
      period: 'this_quarter',
    });
    expect(buildCustomersFilterPreset({ status: ['dormant'], outstanding: [], buyer_app: [] })).toEqual({
      dormant_period: 'this_quarter',
    });
    expect(buildCustomersFilterPreset({ status: [], outstanding: ['due'], buyer_app: [] })).toEqual({
      receivable_gt: 0,
    });
    expect(buildCustomersFilterPreset({ status: [], outstanding: ['overdue'], buyer_app: [] })).toEqual({
      overdue: true,
    });
    expect(
      buildCustomersFilterPreset({ status: ['active'], outstanding: [], buyer_app: [] }, { top80: true }),
    ).toEqual({
      purchased_gte: 1,
      period: 'this_quarter',
      cutoff: 'top80',
      sort: 'invoice_value_desc',
    });
    expect(buildCustomersFilterPreset({ status: ['inactive'], outstanding: [], buyer_app: ['enabled'] })).toEqual({
      is_active: false,
      buyer_app_enabled: true,
    });
  });

  it('round-trips preset → chips and recovers KPI id', () => {
    const chips = chipsFromFilterPreset({ purchased_gte: 1, period: 'this_quarter' });
    expect(chips.status).toEqual(['active']);
    expect(kpiIdFromChips(chips, { purchased_gte: 1, period: 'this_quarter' })).toBe('active_customers');
    expect(
      kpiIdFromChips(
        { status: ['active'], outstanding: [], buyer_app: [] },
        { purchased_gte: 1, period: 'this_quarter', cutoff: 'top80' },
      ),
    ).toBe('top80_customers');
  });
});
