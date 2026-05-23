import { BuyerHeader } from '@/components/layout/BuyerHeader';

interface Props { params: { id: string } }

export default function ProductPage({ params }: Props) {
  return (
    <>
      <BuyerHeader title="Product" showBack />
      <div className="px-4 py-4">
        <div className="bg-white border border-cream-300 rounded-xl p-6 text-center shadow-xs">
          <p className="eyebrow mb-3">Product ID: {params.id}</p>
          <h2 className="text-h3 font-display text-cream-900 mb-2">Product detail</h2>
          <p className="text-body-sm text-cream-600">Full product view coming in PWA build.</p>
        </div>
      </div>
    </>
  );
}
