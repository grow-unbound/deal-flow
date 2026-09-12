import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

// load .env.local
for (const line of readFileSync('/Users/phanikrovvidi/projects/deal-flow/.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
}

const TENANT = '550e8400-e29b-41d4-a716-446655440501';
const PENDING = '00000000-0000-4000-8000-0000fedc0001';
const APPROVED = '00000000-0000-4000-8000-0000fedc0002';

function req(url: string, buyerId: string, role: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('x-verified-user-id', 'user-review-1');
  headers.set('x-verified-tenant-id', TENANT);
  headers.set('x-verified-role', role);
  headers.set('x-verified-buyer-id', buyerId);
  return new NextRequest(new Request(url, { ...init, headers }));
}

const ORDER_BODY = JSON.stringify({
  items: [{ tenant_product_id: '00000000-0000-4000-8000-0000fedc0009', qty: 1, unit_price: 100 }],
  place_of_supply: 'Test',
});

async function out(label: string, p: Promise<Response>) {
  try {
    const r = await p;
    let body: unknown;
    try { body = await r.clone().json(); } catch { body = await r.text(); }
    const s = JSON.stringify(body);
    console.log(label, '=> status', r.status, '|', s.length > 260 ? s.slice(0, 260) + '…' : s);
  } catch (e) {
    console.log(label, '=> THREW', (e as Error).message);
  }
}

async function main() {
  const orders = await import('/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/orders/route');
  const orderDetail = await import('/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/orders/[id]/route');
  const estimates = await import('/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/estimates/route');
  const invoices = await import('/Users/phanikrovvidi/projects/deal-flow/app/api/buyer/invoices/route');

  for (const [tag, buyer, role] of [
    ['PENDING', PENDING, 'buyer_pending'],
    ['APPROVED', APPROVED, 'buyer_admin'],
  ] as const) {
    await out(`${tag} orders GET`, orders.GET(req('http://localhost/api/buyer/orders', buyer, role)));
    await out(`${tag} orders POST`, orders.POST(req('http://localhost/api/buyer/orders', buyer, role, { method: 'POST', body: ORDER_BODY })));
    await out(`${tag} orders/[id] GET`, orderDetail.GET(
      req('http://localhost/api/buyer/orders/00000000-0000-4000-8000-0000fedc000a', buyer, role),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-0000fedc000a' }) },
    ));
    await out(`${tag} estimates GET`, estimates.GET(req('http://localhost/api/buyer/estimates', buyer, role)));
    await out(`${tag} estimates POST`, estimates.POST(req('http://localhost/api/buyer/estimates', buyer, role, { method: 'POST', body: ORDER_BODY })));
    await out(`${tag} invoices GET`, invoices.GET(req('http://localhost/api/buyer/invoices', buyer, role)));
    console.log('---');
  }
}

main().then(() => process.exit(0));
