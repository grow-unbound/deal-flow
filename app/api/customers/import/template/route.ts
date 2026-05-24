import { NextResponse } from 'next/server';

const CSV_HEADER =
  'business_name,phone,contact_name,email,gstin,city,state,pincode,zone,tier,credit_limit,payment_terms_days,external_ref\n';

export async function GET() {
  return new NextResponse(CSV_HEADER, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="buyers_template.csv"',
    },
  });
}
