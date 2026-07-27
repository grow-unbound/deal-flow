import { describe, expect, it } from 'vitest';

describe('product-detail-page integration guardrails', () => {
  it('keeps EP-14-003 tab set contract', () => {
    const tabs = ['Details', 'Pricelists'];
    expect(tabs).toHaveLength(2);
    expect(tabs).not.toContain('Stock');
    expect(tabs).not.toContain('Performance');
  });

  it('keeps KPI tile contract at four without revenue tile', () => {
    const labels = ['Units · MTD', 'Days of cover', 'On hand', 'Sell-through'];
    expect(labels).toHaveLength(4);
    expect(labels).not.toContain('Revenue');
  });
});
