import { describe, expect, it } from 'vitest';
import { buildOutstandingSections } from '@/lib/inbox/inbox-detail-groups';

const NOW = new Date('2026-09-28T06:00:00Z');
const inv = (id: string, due: string | null, amount: number) => ({ id, invoice_number: id, due_date: due, outstanding_amount: amount });

describe('buildOutstandingSections', () => {
  it('groups by aging, oldest first, and totals everything', () => {
    const { sections, totalAmount } = buildOutstandingSections(
      [inv('a', '2026-09-30', 100), inv('b', '2026-09-27', 200), inv('c', '2026-08-01', 300), inv('d', null, 400)],
      NOW,
    );
    expect(sections.map((s) => s.key)).toEqual(['30d+', '1-7d', 'not_due']);
    expect(sections[2].count).toBe(2);
    expect(sections[1].rows[0].dateLabel).toBe('1 day overdue');
    expect(totalAmount).toBe(1000);
  });

  it('labels not-yet-due rows', () => {
    const { sections } = buildOutstandingSections([inv('a', '2026-09-28', 1), inv('b', '2026-09-29', 1), inv('c', '2026-10-05', 1)], NOW);
    expect(sections[0].rows.map((r) => r.dateLabel)).toEqual(['Due today', 'Due tomorrow', 'Due in 7 days']);
  });

  it('returns no sections for no invoices', () => {
    expect(buildOutstandingSections([], NOW).sections).toEqual([]);
  });
});
