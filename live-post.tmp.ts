import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

for (const line of readFileSync('/Users/phanikrovvidi/projects/deal-flow/.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
}

const TENANT = '550e8400-e29b-41d4-a716-446655440501';
const LOC = '550e8400-e29b-41d4-a716-446655440801';
const PROD = 'f5d73384-a3bc-4e0f-9684-03a3921c88f4';
const PENDING = '00000000-0000-4000-8000-0000fedc0001';
const APPROVED = '00000000-0000-4000-8000-0000fedc0002';

function req(url: string, buyerId: string, role: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('x-verified-user-id', 'dab6fb42-6a69-4e78-a233-6bd945f145a9');
  headers.set('x-verified-tenant-id', TENANT);
  headers.set('x-verified-role', role);
  headers.set('x-verified-buyer-id', buyerId);
  headers.set('cookie', 'df_buyer_delivery_v1=%7B%22selected%22%3A%20%7B%22place_id%22%3A%20%22rev-fixture%22%2C%20%22label%22%3A%20%22Rev%20Outlet%22%2C%20%22formatted_address%22%3A%20%22Test%20addr%22%2C%20%22lat%22%3A%2019.0%2C%20%22lng%22%3A%2072.8%2C%20%22place_of_supply%22%3A%20%22Maharashtra%22%2C%20%22nearest_warehouse_id%22%3A%20%22550e8400-e29b-41d4-a716-446655440811%22%2C%20%22routed_location_id%22%3A%20%22550e8400-e29b-41d4-a716-446655440801%22%7D%2C%20%22recent%22%3A%20%5B%5D%7D');
  return new NextRequest(new Request(url, { ...init, headers }));
}

const BODY = JSON.stringify({
  items: [{ tenant_product_id: PROD, qty: 2, unit_price: 1000 }],
  location_id: LOC,
  place_of_supply: 'Maharashtra',
  notes: 'REVIEW FIXTURE ORDER — disposable',
});

async function out(label: string, p: Promise<Response>) {
  try {
    const r = await p;
    const s = JSON.stringify(await r.clone().json());
    console.log(label, '=> status', r.status, '|', s.length > 300 ? s.slice(0, 300) + '…' : s);
  } catch (e) {
    console.log(label, '=> THREW', (e as Error).message);
  }
}

async function main() {
  const orders = await import('./app/api/buyer/orders/route');
  const estimates = await import('./app/api/buyer/estimates/route');
  const which = process.argv[2] ?? 'both';
  if (which !== 'approved') {
    await out('PENDING orders POST (full body)', orders.POST(req('http://localhost/api/buyer/orders', PENDING, 'buyer_pending', { method: 'POST', body: BODY })));
    await out('PENDING estimates POST (full body)', estimates.POST(req('http://localhost/api/buyer/estimates', PENDING, 'buyer_pending', { method: 'POST', body: BODY })));
  }
  if (which !== 'pending') {
    await out('APPROVED orders POST (full body)', orders.POST(req('http://localhost/api/buyer/orders', APPROVED, 'buyer_admin', { method: 'POST', body: BODY })));
    await out('APPROVED estimates POST (full body)', estimates.POST(req('http://localhost/api/buyer/estimates', APPROVED, 'buyer_admin', { method: 'POST', body: BODY })));
    await out('APPROVED orders GET (after)', orders.GET(req('http://localhost/api/buyer/orders', APPROVED, 'buyer_admin')));
  }
}

main().then(() => process.exit(0));
