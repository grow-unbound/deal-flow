'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CornerUpLeft, ExternalLink, Phone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const WHATSAPP_WALLPAPER_STYLE = {
  backgroundColor: '#e5ddd5',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.45'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
} as const;

const BUTTON_ICONS: Record<string, LucideIcon> = {
  'View campaign': ExternalLink,
  'Enquire now': Phone,
  Unsubscribe: CornerUpLeft,
};

export interface WhatsAppTemplateButton {
  label: string;
  type: 'url' | 'quick_reply';
}

interface WhatsAppTemplatePreviewProps {
  sellerName: string;
  campaignTitle: string;
  buyerNote: string;
  sellerPhone: string;
  headerImageUrl?: string | null;
  footerText?: string;
  buttons?: WhatsAppTemplateButton[];
  buyerName?: string;
}

export function WhatsAppTemplatePreview({
  sellerName,
  campaignTitle,
  buyerNote,
  sellerPhone,
  headerImageUrl,
  footerText = 'Powered by Yukti',
  buttons = [
    { label: 'View campaign', type: 'url' },
    { label: 'Enquire now', type: 'url' },
    { label: 'Unsubscribe', type: 'quick_reply' },
  ],
  buyerName = 'Rajesh',
}: WhatsAppTemplatePreviewProps) {
  const [headerImageError, setHeaderImageError] = useState(false);
  const note = buyerNote.trim() || 'Check out our latest offers.';
  const showHeaderImage = Boolean(headerImageUrl) && !headerImageError;

  const bodyText = [
    `Hi ${buyerName},`,
    '',
    `${sellerName} has a new campaign live — ${campaignTitle}`,
    '',
    note,
    '',
    `Contact: ${sellerPhone || '—'}`,
    '',
    'Check it out and place your order in the app.',
  ].join('\n');

  return (
    <div
      className="mx-auto w-full max-w-[320px] rounded-[20px] p-4 shadow-sm"
      style={WHATSAPP_WALLPAPER_STYLE}
    >
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="relative aspect-[1.91/1] w-full bg-cream-100">
          {showHeaderImage ? (
            <Image
              src={headerImageUrl!}
              alt="Campaign header"
              fill
              unoptimized
              className="object-cover"
              onError={() => setHeaderImageError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-cream-500">
              Campaign header
            </div>
          )}
        </div>

        <div className="px-3 py-3 text-[13px] leading-5 text-cream-900 whitespace-pre-wrap">
          {bodyText}
        </div>

        <div className="border-t border-cream-100 px-3 py-2 text-[11px] text-cream-500">
          {footerText}
        </div>

        <div className="border-t border-cream-100">
          {buttons.map((button) => {
            const Icon = BUTTON_ICONS[button.label] ?? ExternalLink;
            return (
              <div
                key={button.label}
                className="flex items-center justify-center gap-2 border-b border-cream-100 px-3 py-2.5 text-[13px] font-medium text-[#00A884] last:border-b-0"
              >
                <Icon size={14} className="shrink-0" />
                <span>{button.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
