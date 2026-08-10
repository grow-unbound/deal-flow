/**
 * WhatsApp inline formatting (subset used in template bodies).
 * Delimiters must sit flush against the span — no space after the opener
 * or before the closer — matching Meta's client rules.
 *
 *   *bold*   _italic_   ~strike~   ```mono```
 */

export type WhatsAppFormatKind = 'text' | 'bold' | 'italic' | 'strike' | 'code';

export interface WhatsAppFormatSegment {
  kind: WhatsAppFormatKind;
  text: string;
}

const FORMAT_TOKEN_RE =
  /(\*(?!\s)([^*\n]+?)(?<!\s)\*|_(?!\s)([^_\n]+?)(?<!\s)_|~(?!\s)([^~\n]+?)(?<!\s)~|```([\s\S]+?)```)/g;

function kindForMatch(match: RegExpExecArray): { kind: Exclude<WhatsAppFormatKind, 'text'>; text: string } | null {
  if (match[2] !== undefined) return { kind: 'bold', text: match[2] };
  if (match[3] !== undefined) return { kind: 'italic', text: match[3] };
  if (match[4] !== undefined) return { kind: 'strike', text: match[4] };
  if (match[5] !== undefined) return { kind: 'code', text: match[5] };
  return null;
}

export function parseWhatsAppFormatting(input: string): WhatsAppFormatSegment[] {
  if (!input) return [];

  const segments: WhatsAppFormatSegment[] = [];
  let cursor = 0;
  FORMAT_TOKEN_RE.lastIndex = 0;

  let match = FORMAT_TOKEN_RE.exec(input);
  while (match) {
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: 'text', text: input.slice(cursor, start) });
    }

    const formatted = kindForMatch(match);
    if (formatted) {
      segments.push(formatted);
    } else {
      segments.push({ kind: 'text', text: match[0] });
    }

    cursor = start + match[0].length;
    match = FORMAT_TOKEN_RE.exec(input);
  }

  if (cursor < input.length) {
    segments.push({ kind: 'text', text: input.slice(cursor) });
  }

  return segments;
}
