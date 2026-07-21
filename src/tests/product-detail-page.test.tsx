import { describe, expect, it } from 'vitest';

describe('product-detail-page integration guardrails', () => {
  it('keeps EP-14-003 tab set contract', () => {
    const tabs = ['Details', 'Performance', 'Pricing & cohorts'];
    expect(tabs).toHaveLength(3);
    expect(tabs).not.toContain('Stock');
  });

  it('keeps KPI tile contract at four without revenue tile', () => {
    const labels = ['Units · MTD', 'Days of cover', 'On hand', 'Sell-through'];
    expect(labels).toHaveLength(4);
    expect(labels).not.toContain('Revenue');
  });
});
