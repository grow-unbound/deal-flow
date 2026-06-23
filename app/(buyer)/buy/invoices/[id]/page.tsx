import { BuyerAmount, BuyerDate, BuyerDocumentStat, BuyerSimpleDocumentDetail } from '@/components/buyer/documents/BuyerSimpleDocumentDetail';

interface BuyerInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  outstanding_balance: number | null;
  invoice_date: string;
  due_date: string | null;
}

export default async function BuyerInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <BuyerSimpleDocumentDetail<BuyerInvoice>
      id={id}
      title="Invoice"
      endpoint="/api/buyer/invoices?limit=200"
      pickRows={(payload) => payload.invoices ?? []}
      match={(row) => row.id === id}
      render={(invoice) => (
        <div className="space-y-3">
          <BuyerDocumentStat label="Invoice number" value={invoice.invoice_number} sub={`Raised ${BuyerDate(invoice.invoice_date)}`} />
          <div className="grid grid-cols-2 gap-3">
            <BuyerDocumentStat label="Amount" value={BuyerAmount(invoice.total_amount)} sub={invoice.due_date ? `Due ${BuyerDate(invoice.due_date)}` : 'No due date'} />
            <BuyerDocumentStat label="Outstanding" value={BuyerAmount(invoice.outstanding_balance ?? 0)} sub={invoice.status} />
          </div>
        </div>
      )}
    />
  );
}
