import { describe, expect, it } from 'vitest';

import { parseWhatsAppFormatting } from '@/lib/whatsapp-formatting';

describe('parseWhatsAppFormatting', () => {
  it('parses italic and bold spans flush to delimiters', () => {
    const segments = parseWhatsAppFormatting(
      '_Great news!_ WineYard unlocked access. ⚡ *No app download required.*',
    );

    expect(segments).toEqual([
      { kind: 'italic', text: 'Great news!' },
      { kind: 'text', text: ' WineYard unlocked access. ⚡ ' },
      { kind: 'bold', text: 'No app download required.' },
    ]);
  });

  it('leaves spaced delimiters as plain text (Meta rule)', () => {
    const segments = parseWhatsAppFormatting('⚡* No app download required.*');
    expect(segments).toEqual([{ kind: 'text', text: '⚡* No app download required.*' }]);
  });

  it('preserves newlines in surrounding text', () => {
    const segments = parseWhatsAppFormatting('Hi\n\n_Great news!_\nDone');
    expect(segments).toEqual([
      { kind: 'text', text: 'Hi\n\n' },
      { kind: 'italic', text: 'Great news!' },
      { kind: 'text', text: '\nDone' },
    ]);
  });
});
