'use client';

import Image from 'next/image';

interface WhatsAppTemplatePreviewProps {
  sellerName: string;
  campaignTitle: string;
  buyerNote: string;
  sellerPhone: string;
  headerImageUrl?: string | null;
  buyerName?: string;
}

export function WhatsAppTemplatePreview({
  sellerName,
  campaignTitle,
  buyerNote,
  sellerPhone,
  headerImageUrl,
  buyerName = 'Rajesh',
}: WhatsAppTemplatePreviewProps) {
  const note = buyerNote.trim() || 'Check out our latest offers.';

  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[20px] border border-cream-200 bg-[#e5ddd5] p-3 shadow-sm">
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        {headerImageUrl ? (
          <div className="relative aspect-[1.91/1] w-full bg-cream-100">
            <Image
              src={headerImageUrl}
              alt="Campaign header"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="aspect-[1.91/1] w-full bg-cream-100" />
        )}

        <div className="space-y-2 px-3 py-3 text-[13px] leading-5 text-cream-900 whitespace-pre-wrap">
          <p>{`Hi ${buyerName},`}</p>
          <p>{`${sellerName} has a new campaign live — ${campaignTitle}`}</p>
          <p>{note}</p>
          <p>{`Contact: ${sellerPhone || '—'}`}</p>
          <p>Check it out and place your order in the app.</p>
        </div>

        <div className="border-t border-cream-100 px-3 py-2 text-[11px] text-cream-500">
          Powered by Yukti
        </div>

        <div className="border-t border-cream-100">
          {['View campaign', 'Enquire now', 'Unsubscribe'].map((label) => (
            <div
              key={label}
              className="border-b border-cream-100 px-3 py-2 text-center text-[13px] font-medium text-[#00a5f4] last:border-b-0"
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
