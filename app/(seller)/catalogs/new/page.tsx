'use client';

import { useSearchParams } from 'next/navigation';
import { PageWrap } from '@/components/seller/layout';

export default function NewCatalogPage() {
  const params = useSearchParams();
  const mode = params.get('mode') === 'template' ? 'template' : 'publish';

  return (
    <PageWrap>
      <div className="rounded-[14px] border border-cream-300 bg-cream-50 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cream-700">Catalog publishing</p>
        <h1 className="mt-2 font-display text-[28px] font-semibold text-cream-950">
          {mode === 'template' ? 'New from template' : 'Publish a catalog'}
        </h1>
        <p className="mt-2 max-w-[64ch] text-[13px] leading-[1.55] text-cream-700">
          This entry point is wired for EP-13-007. The full publish flow is implemented in a later story.
        </p>
      </div>
    </PageWrap>
  );
}
