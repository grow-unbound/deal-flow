import { BuyerHeader } from '@/components/layout/BuyerHeader';

export default function catalogPage() {
  return (
    <>
      <BuyerHeader title="catalog" />
      <div className="px-4 py-4">
        <div className="bg-white border border-cream-300 rounded-xl p-6 text-center shadow-xs">
          <p className="eyebrow mb-3">catalog</p>
          <h2 className="text-h3 font-display text-cream-900 mb-2">Coming soon</h2>
          <p className="text-body-sm text-cream-600">This buyer screen is part of the PWA build.</p>
        </div>
      </div>
    </>
  );
}
