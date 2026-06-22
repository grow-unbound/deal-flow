import { BuyerAmount, BuyerDate, BuyerDocumentStat, BuyerSimpleDocumentDetail } from '@/components/buyer/documents/BuyerSimpleDocumentDetail';

interface BuyerOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  placed_at: string;
  catalog_name: string | null;
  items_count: number;
}

export default async function BuyerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <BuyerSimpleDocumentDetail<BuyerOrder>
      id={id}
      title="Order"
      endpoint="/api/buyer/orders?limit=200"
      pickRows={(payload) => payload.orders ?? []}
      match={(row) => row.id === id}
      render={(order) => (
        <div className="space-y-3">
          <BuyerDocumentStat label="Order number" value={order.order_number} sub={order.catalog_name ?? 'Sales order'} />
          <div className="grid grid-cols-2 gap-3">
            <BuyerDocumentStat label="Amount" value={BuyerAmount(order.total_amount)} sub={`Placed ${BuyerDate(order.placed_at)}`} />
            <BuyerDocumentStat label="Status" value={order.status} sub={`${order.items_count} item${order.items_count === 1 ? '' : 's'}`} />
          </div>
        </div>
      )}
    />
  );
}
