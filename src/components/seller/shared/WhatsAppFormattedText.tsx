'use client';

import { cn } from '@/lib/cn';
import { parseWhatsAppFormatting } from '@/lib/whatsapp-formatting';

interface WhatsAppFormattedTextProps {
  text: string;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

/** Renders WhatsApp `*bold*` / `_italic_` / `~strike~` / ```mono``` markers as styled text. */
export function WhatsAppFormattedText({
  text,
  className,
  'aria-hidden': ariaHidden,
}: WhatsAppFormattedTextProps) {
  const segments = parseWhatsAppFormatting(text);

  return (
    <div
      className={cn('whitespace-pre-wrap font-sans', className)}
      aria-hidden={ariaHidden}
    >
      {segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;
        switch (segment.kind) {
          case 'bold':
            return (
              <strong key={key} className="font-semibold">
                {segment.text}
              </strong>
            );
          case 'italic':
            return <em key={key}>{segment.text}</em>;
          case 'strike':
            return (
              <span key={key} className="line-through">
                {segment.text}
              </span>
            );
          case 'code':
            return (
              <code key={key} className="rounded bg-cream-100 px-0.5 font-mono text-[0.95em]">
                {segment.text}
              </code>
            );
          default:
            return <span key={key}>{segment.text}</span>;
        }
      })}
    </div>
  );
}
