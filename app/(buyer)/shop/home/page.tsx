import Link from 'next/link';

// INR formatter with Indian lakh grouping
function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

const distributors = [
  { id: 'phani',   initials: 'PD', name: 'Phani Distribution',  city: 'New Delhi', lastOrder: '2h ago',   spend: 1240000, trend: '+12%' },
  { id: 'kohli',   initials: 'KS', name: 'Kohli & Sons',         city: 'Faridabad', lastOrder: '4d ago',   spend:  428000, trend: '+4%'  },
  { id: 'arasaka', initials: 'AR', name: 'Arasaka Wines',        city: 'Noida',     lastOrder: '2w ago',   spend:  186000, trend: '−6%'  },
];

const reorderProducts = [
  { id: 'p1', name: 'Cabernet Sauvignon', vintage: '2021', price: 2450, hue: 'teal' },
  { id: 'p5', name: 'Indian Pale Ale',    vintage: '',     price:  580, hue: 'ember' },
  { id: 'p3', name: 'Chenin Blanc',       vintage: '2022', price: 1640, hue: 'cream' },
  { id: 'p7', name: 'Single Malt 12yr',  vintage: '',     price: 4280, hue: 'teal' },
];

const catalogs = [
  { id: 'c1', name: 'Summer Pours',      products: 28, validUntil: '31 May 2026', hue: 'teal' },
  { id: 'c2', name: 'New Arrivals · May', products: 14, validUntil: '15 Jun 2026', hue: 'ember' },
  { id: 'c3', name: 'Premium Reserve',   products: 42, validUntil: '30 Jun 2026', hue: 'cream' },
];

const recentOrders = [
  { id: 'DF-2026-00471', status: 'dispatched', total: 84200,  items: 3, placed: '2 hours ago',  catalog: 'Summer Pours' },
  { id: 'DF-2026-00466', status: 'delivered',  total: 124300, items: 9, placed: '2 days ago',   catalog: 'Premium Reserve' },
];

const statusColors: Record<string, { bg: string; fg: string }> = {
  draft:      { bg: '#EAF1EE', fg: '#142823' },
  received:   { bg: '#E7EEF1', fg: '#2A4B59' },
  confirmed:  { bg: '#FBEFE3', fg: '#6B3818' },
  dispatched: { bg: '#FBF1DC', fg: '#7A5519' },
  delivered:  { bg: '#ECF3EC', fg: '#2F5733' },
  cancelled:  { bg: '#F6E5DF', fg: '#6B2615' },
};

const statusLabels: Record<string, string> = {
  received: 'Received', confirmed: 'Confirmed', dispatched: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled', draft: 'Draft',
};

const hueGradients: Record<string, string> = {
  teal:  'linear-gradient(135deg, #1F3A34 0%, #2D5549 100%)',
  ember: 'linear-gradient(135deg, #874720 0%, #C26E3A 100%)',
  cream: 'linear-gradient(135deg, #6B6760 0%, #3D3A35 100%)',
};

const productBg: Record<string, string> = {
  teal:  'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
  ember: 'linear-gradient(180deg, #FBEFE3 0%, #F5DAB8 100%)',
  cream: 'linear-gradient(180deg, #F4EFE6 0%, #EFE9DF 100%)',
};

export default function HomePage() {
  return (
    <>
      <div>

        {/* Page head */}
        <div className="flex items-start justify-between px-5 pt-4 pb-2">
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-700)', fontFamily: 'var(--font-mono)' }}>Good evening, Rajan</p>
            <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--cream-900)', lineHeight: 1.2, marginTop: 2 }}>Your shelf, this month.</h1>
          </div>
          <button style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--cream-200)', border: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--cream-700)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px' }}>
          <div style={{ gridColumn: '1 / -1', background: 'var(--teal-500)', borderRadius: 14, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(253,251,247,0.7)', fontFamily: 'var(--font-mono)' }}>Spend this year</p>
            <p style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-50)', lineHeight: 1.1, marginTop: 4 }}>₹18,54,000</p>
            <p style={{ fontSize: 12, color: 'rgba(253,251,247,0.6)', marginTop: 4 }}>Across 3 distributors · 47 orders</p>
          </div>
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>Open orders</p>
            <p style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.1, marginTop: 4 }}>4</p>
            <p style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 4 }}>2 awaiting dispatch</p>
          </div>
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>Available credit</p>
            <p style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.1, marginTop: 4 }}>₹1,65,800</p>
            <p style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 4 }}>of ₹2,50,000 limit</p>
          </div>
        </div>

        {/* Your distributors */}
        <div style={{ padding: '16px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Your distributors</h3>
            <span style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>See all</span>
          </div>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {distributors.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', background: 'var(--cream-50)', borderRadius: 10, border: '1px solid var(--border-1)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--teal-700)', flexShrink: 0 }}>{d.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cream-900)' }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--cream-600)', marginTop: 1 }}>{d.city} · last order {d.lastOrder}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>{inr(d.spend)}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: d.trend.startsWith('−') || d.trend.startsWith('-') ? '#9C3A22' : '#2F5733', marginTop: 1 }}>{d.trend}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order again */}
        <div style={{ padding: '20px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Order again</h3>
            <Link href="/shop/catalog" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>Browse all</Link>
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', gap: 10, padding: '0 16px 4px', scrollbarWidth: 'none' }}>
            {reorderProducts.map(p => (
              <Link key={p.id} href={`/shop/product/${p.id}`} style={{ flexShrink: 0, width: 120, background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden', textDecoration: 'none' }}>
                <div style={{ height: 88, background: productBg[p.hue], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 28, height: 68, background: hueGradients[p.hue], borderRadius: 4 }} />
                </div>
                <div style={{ padding: '8px 10px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cream-900)', lineHeight: 1.3 }}>{p.name}{p.vintage ? ` ${p.vintage}` : ''}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)', marginTop: 3 }}>{inr(p.price)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* New catalogs */}
        <div style={{ padding: '20px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>New catalogs</h3>
            <Link href="/shop/catalog" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>See all</Link>
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', gap: 10, padding: '0 16px 4px', scrollbarWidth: 'none' }}>
            {catalogs.map(c => (
              <Link key={c.id} href="/shop/catalog" style={{ flexShrink: 0, width: 160, borderRadius: 12, overflow: 'hidden', textDecoration: 'none', border: '1px solid var(--border-1)' }}>
                <div style={{ height: 90, background: hueGradients[c.hue], display: 'flex', alignItems: 'flex-end', padding: '12px 14px' }}>
                  <h4 style={{ fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{c.name}</h4>
                </div>
                <div style={{ background: 'var(--cream-50)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--cream-700)' }}><strong style={{ color: 'var(--cream-900)', fontWeight: 500 }}>{c.products}</strong> products</span>
                  <span style={{ fontSize: 11, color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>{c.validUntil}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Recent activity</h3>
            <Link href="/shop/orders" style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>See orders</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentOrders.map(o => {
              const sc = statusColors[o.status] ?? statusColors.received;
              return (
                <Link key={o.id} href="/shop/orders" style={{ display: 'block', background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 14px', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{o.id}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.fg }}>{statusLabels[o.status]}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--cream-800)', marginBottom: 6 }}>{o.catalog}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--cream-600)' }}>{o.items} products · {o.placed}</span>
                    <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cream-900)' }}>{inr(o.total)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}
