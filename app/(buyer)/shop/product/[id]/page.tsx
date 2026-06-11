import Link from 'next/link';
import { notFound } from 'next/navigation';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

const products = [
  { id: 'p1', name: 'Cabernet Sauvignon', vintage: '2021', brand: 'WineYard Vintners',   sku: 'VINO-CAB-750-2021', pack: '750ml',     mrp: 2800, price: 2450, hue: 'teal',
    note: 'A medium-bodied Nashik Cab with notes of black cherry, cedar, and a long warm finish.' },
  { id: 'p2', name: 'Cabernet Franc',     vintage: '2020', brand: 'WineYard Vintners',   sku: 'VINO-CFR-750-2020', pack: '750ml',     mrp: 3400, price: 2980, hue: 'teal',
    note: 'Reserve bottling. Limited to 600 cases — earthy, peppery, age-worthy.' },
  { id: 'p3', name: 'Chenin Blanc',       vintage: '2022', brand: 'Maison Roussel',      sku: 'MRSL-CB-750-2022',  pack: '750ml',     mrp: 1900, price: 1640, hue: 'cream',
    note: 'Crisp, dry, slightly aromatic. Pairs with paneer tikka and grilled fish.' },
  { id: 'p4', name: 'Sauvignon Blanc',    vintage: '2022', brand: 'Maison Roussel',      sku: 'MRSL-SB-750-2022',  pack: '750ml',     mrp: 1800, price: 1550, hue: 'cream',
    note: 'Bright citrus and gooseberry. Drink within the year.' },
  { id: 'p5', name: 'Indian Pale Ale',    vintage: '',     brand: 'Khanna Brewing Co.', sku: 'KHAN-IPA-330-006',  pack: '330ml × 6', mrp:  720, price:  580, hue: 'ember',
    note: 'Citrus-forward, 6.2% ABV. Brewed in Pune. Best chilled.' },
  { id: 'p6', name: 'Wheat Lager',        vintage: '',     brand: 'Khanna Brewing Co.', sku: 'KHAN-WHT-330-006',  pack: '330ml × 6', mrp:  640, price:  520, hue: 'ember',
    note: 'Light, cloudy, refreshing. 4.8% ABV.' },
  { id: 'p7', name: 'Single Malt 12yr',  vintage: '',     brand: 'Tara Spirits',       sku: 'TARA-SM12-750',     pack: '750ml',     mrp: 4800, price: 4280, hue: 'teal',
    note: 'Aged 12 years in ex-bourbon casks. Smoky, soft, slightly sweet.' },
  { id: 'p8', name: 'Estate Reserve Red', vintage: '2019', brand: 'Aravalli Vineyards', sku: 'ARVL-ESR-750-2019', pack: '750ml',     mrp: 3200, price: 2850, hue: 'ember',
    note: 'Old-vine Shiraz blend. Velvety tannins.' },
];

const productBg: Record<string, string> = {
  teal:  'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
  ember: 'linear-gradient(180deg, #FBEFE3 0%, #F5DAB8 100%)',
  cream: 'linear-gradient(180deg, #F4EFE6 0%, #EFE9DF 100%)',
};

const bottleGradient: Record<string, string> = {
  teal:  'linear-gradient(180deg, #1F3A34, #142823)',
  ember: 'linear-gradient(180deg, #874720, #4F2A12)',
  cream: 'linear-gradient(180deg, #6B6760, #3D3A35)',
};

interface Props { params: Promise<{ id: string }> }

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const p = products.find((x) => x.id === id);
  if (!p) notFound();
  const saved = p.mrp - p.price;

  const related = products.filter(x => x.brand === p.brand && x.id !== p.id).slice(0, 4);

  const attrs = [
    { label: 'Pack',     value: p.pack },
    { label: 'MOQ',      value: '12 units' },
    { label: 'In stock', value: '240 units' },
    { label: 'Delivery', value: '2–3 days' },
  ];

  const specs = [
    { label: 'Region',    value: p.vintage ? 'Nashik, India' : 'Pune, India' },
    { label: 'ABV',       value: p.brand.includes('Brewing') ? '6.2%' : p.brand.includes('Spirits') ? '43%' : '13.5%' },
    { label: 'Volume',    value: p.pack },
    { label: 'HSN code',  value: '22042100' },
    { label: 'GST rate',  value: '18%' },
    { label: 'Master SKU', value: p.sku },
    { label: 'Best before', value: '36 months' },
  ];

  return (
    <div style={{ minHeight: '100svh', background: 'var(--cream-100)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 50, background: 'rgba(253,251,247,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border-1)' }}>
        <Link href="/shop/catalog" style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream-100)', border: '1px solid var(--border-1)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cream-800)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </Link>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream-900)' }}>Product</span>
        <button style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream-100)', border: '1px solid var(--border-1)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-700)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </button>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 96 }}>

        {/* Hero */}
        <div style={{ position: 'relative', height: 200, background: productBg[p.hue], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 56, height: 140, background: bottleGradient[p.hue], borderRadius: 6 }} />
          <button style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-700)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>{p.brand}</div>
          <h1 style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--cream-900)', lineHeight: 1.2, marginTop: 4 }}>
            {p.name} {p.vintage && <em>{p.vintage}</em>}
          </h1>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--cream-600)', marginTop: 4 }}>{p.sku} · {p.pack}</div>

          {/* Prices */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '14px 0 12px' }}>
            <span style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cream-900)' }}>{inr(p.price)}</span>
            <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--cream-500)', textDecoration: 'line-through' }}>MRP {inr(p.mrp)}</span>
            {saved > 0 && <span style={{ fontSize: 12, color: '#2F5733', background: '#ECF3EC', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>Save {inr(saved)}</span>}
          </div>

          <p style={{ fontSize: 14, color: 'var(--cream-700)', lineHeight: 1.6, marginBottom: 16 }}>{p.note}</p>

          {/* Attrs grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {attrs.map(a => (
              <div key={a.label} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--cream-600)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{a.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream-900)', marginTop: 3 }}>{a.value}</div>
              </div>
            ))}
          </div>

          {/* Specs */}
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>Product attributes</div>
          <div style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            {specs.map((s, i) => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < specs.length - 1 ? '1px solid var(--border-1)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--cream-700)' }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)', fontFamily: s.label === 'Master SKU' ? 'var(--font-mono)' : undefined }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* More from brand */}
          {related.length > 0 && (
            <>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>More from {p.brand}</div>
              <div style={{ overflowX: 'auto', display: 'flex', gap: 10, marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20, paddingBottom: 4, scrollbarWidth: 'none' }}>
                {related.map(x => (
                  <Link key={x.id} href={`/shop/product/${x.id}`} style={{ flexShrink: 0, width: 120, background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, overflow: 'hidden', textDecoration: 'none' }}>
                    <div style={{ height: 80, background: productBg[x.hue], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 24, height: 60, background: bottleGradient[x.hue], borderRadius: 3 }} />
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cream-900)', lineHeight: 1.3 }}>{x.name}{x.vintage ? ` ${x.vintage}` : ''}</div>
                      <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--cream-700)', marginTop: 3 }}>{inr(x.price)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sticky cart bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: 'rgba(253,251,247,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--cream-50)', overflow: 'hidden' }}>
          <button style={{ width: 40, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--cream-700)' }}>−</button>
          <span style={{ width: 40, textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--cream-900)', fontFamily: 'var(--font-mono)' }}>12</span>
          <button style={{ width: 40, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--cream-700)' }}>+</button>
        </div>
        <Link href="/shop/cart" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, background: 'var(--teal-500)', borderRadius: 10, textDecoration: 'none', color: '#fff', fontSize: 15, fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
          <span>Add · {inr(p.price * 12)}</span>
        </Link>
      </div>

    </div>
  );
}
