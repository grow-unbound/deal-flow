import Link from 'next/link';

function inr(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return '₹' + grouped + ',' + last3;
}

const catalogs = [
  { id: 'c1', name: 'Summer Pours',      products: 28, validUntil: '31 May 2026', hue: 'teal' },
  { id: 'c2', name: 'New Arrivals · May', products: 14, validUntil: '15 Jun 2026', hue: 'ember' },
  { id: 'c3', name: 'Premium Reserve',   products: 42, validUntil: '30 Jun 2026', hue: 'cream' },
];

const categories = [
  { id: 'wine',    name: 'Wine',    count: 184, hue: 'teal'  },
  { id: 'spirits', name: 'Spirits', count:  92, hue: 'ember' },
  { id: 'beer',    name: 'Beer',    count:  64, hue: 'cream' },
  { id: 'mixers',  name: 'Mixers',  count:  38, hue: 'teal'  },
  { id: 'cigars',  name: 'Cigars',  count:  14, hue: 'ember' },
  { id: 'snacks',  name: 'Snacks',  count:  72, hue: 'cream' },
];

const brands = [
  { id: 'wy', initials: 'WY', name: 'WineYard Vintners' },
  { id: 'mr', initials: 'MR', name: 'Maison Roussel'    },
  { id: 'kh', initials: 'KH', name: 'Khanna Brewing'    },
  { id: 'ts', initials: 'TS', name: 'Tara Spirits'      },
  { id: 'av', initials: 'AV', name: 'Aravalli Vineyards'},
];

const products = [
  { id: 'p1', name: 'Cabernet Sauvignon', vintage: '2021', brand: 'WineYard Vintners', pack: '750ml',     mrp: 2800, price: 2450, hue: 'teal',  featured: true  },
  { id: 'p2', name: 'Cabernet Franc',     vintage: '2020', brand: 'WineYard Vintners', pack: '750ml',     mrp: 3400, price: 2980, hue: 'teal',  featured: false },
  { id: 'p3', name: 'Chenin Blanc',       vintage: '2022', brand: 'Maison Roussel',    pack: '750ml',     mrp: 1900, price: 1640, hue: 'cream', featured: true  },
  { id: 'p4', name: 'Sauvignon Blanc',    vintage: '2022', brand: 'Maison Roussel',    pack: '750ml',     mrp: 1800, price: 1550, hue: 'cream', featured: false },
  { id: 'p5', name: 'Indian Pale Ale',    vintage: '',     brand: 'Khanna Brewing Co.',pack: '330ml × 6', mrp:  720, price:  580, hue: 'ember', featured: true  },
  { id: 'p6', name: 'Wheat Lager',        vintage: '',     brand: 'Khanna Brewing Co.',pack: '330ml × 6', mrp:  640, price:  520, hue: 'ember', featured: false },
  { id: 'p7', name: 'Single Malt 12yr',  vintage: '',     brand: 'Tara Spirits',      pack: '750ml',     mrp: 4800, price: 4280, hue: 'teal',  featured: true  },
  { id: 'p8', name: 'Estate Reserve Red', vintage: '2019', brand: 'Aravalli Vineyards',pack: '750ml',     mrp: 3200, price: 2850, hue: 'ember', featured: false },
];

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

const catIconBg: Record<string, string> = {
  teal:  '#EAF1EE', ember: '#FBEFE3', cream: '#F4EFE6',
};
const catIconFg: Record<string, string> = {
  teal:  '#1F3A34', ember: '#874720', cream: '#6B6760',
};

export default function CatalogPage() {
  return (
    <>
      <div>

        {/* Page head */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 18px 0' }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-700)', fontFamily: 'var(--font-mono)' }}>Browse</p>
            <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--cream-900)', lineHeight: 1.2, marginTop: 2 }}>Catalog</h1>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cream-50)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cream-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <span style={{ fontSize: 14, color: 'var(--cream-500)' }}>Search brands, SKUs, products…</span>
          </div>
        </div>

        {/* Deliver to */}
        <div style={{ padding: '10px 16px 0' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>Deliver to</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)', marginTop: 1 }}>Delhi Showroom · Karol Bagh</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cream-600)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px 0', scrollbarWidth: 'none' }}>
          {['All', 'Wine', 'Spirits', 'Beer', 'New'].map((f, i) => (
            <button key={f} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 100, fontSize: 13, fontWeight: 500, border: '1px solid', background: i === 0 ? 'var(--teal-500)' : 'var(--cream-50)', color: i === 0 ? '#fff' : 'var(--cream-800)', borderColor: i === 0 ? 'var(--teal-500)' : 'var(--border-2)', cursor: 'pointer' }}>
              {f}
            </button>
          ))}
        </div>

        {/* Catalogs from your sellers */}
        <div style={{ padding: '20px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Catalogs from your sellers</h3>
            <span style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>Show all</span>
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', gap: 10, padding: '0 16px 4px', scrollbarWidth: 'none' }}>
            {catalogs.map(c => (
              <div key={c.id} style={{ flexShrink: 0, width: 160, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-1)' }}>
                <div style={{ height: 90, background: hueGradients[c.hue], display: 'flex', alignItems: 'flex-end', padding: '12px 14px' }}>
                  <h4 style={{ fontSize: 14, fontFamily: 'var(--font-display)', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{c.name}</h4>
                </div>
                <div style={{ background: 'var(--cream-50)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--cream-700)' }}><strong style={{ color: 'var(--cream-900)', fontWeight: 500 }}>{c.products}</strong> products</span>
                  <span style={{ fontSize: 11, color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>{c.validUntil}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Browse by category */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Browse by category</h3>
            <span style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>Show all</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {categories.map(c => (
              <div key={c.id} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 12, padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: catIconBg[c.hue], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={catIconFg[c.hue]} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cream-900)', textAlign: 'center' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--cream-600)', fontFamily: 'var(--font-mono)' }}>{c.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top brands */}
        <div style={{ padding: '20px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 18px 10px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Top brands</h3>
            <span style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>Show all</span>
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '0 16px 4px', scrollbarWidth: 'none' }}>
            {brands.map(b => (
              <div key={b.id} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 100, padding: '6px 14px 6px 8px' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--teal-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--teal-700)' }}>{b.initials}</div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)' }}>{b.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* The picks this week */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>The picks · this week</h3>
            <span style={{ fontSize: 12, color: 'var(--teal-500)', fontWeight: 500 }}>Show all</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {products.slice(0, 4).map(p => (
              <Link key={p.id} href={`/shop/product/${p.id}`} style={{ background: 'var(--cream-50)', border: p.featured ? '1.5px solid var(--ember-400)' : '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden', textDecoration: 'none' }}>
                <div style={{ height: 120, background: productBg[p.hue], display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {p.featured && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'var(--ember-500)', color: '#fff' }}>Featured</span>}
                  <div style={{ width: 32, height: 80, background: hueGradients[p.hue], borderRadius: 4 }} />
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--cream-600)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{p.brand}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)', lineHeight: 1.3 }}>{p.name}{p.vintage ? ` ${p.vintage}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-600)', marginTop: 2 }}>{p.pack}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cream-900)' }}>{inr(p.price)}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--cream-500)', textDecoration: 'line-through' }}>{inr(p.mrp)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* More products */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>More from WineYard Vintners</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {products.slice(4, 8).map(p => (
              <Link key={p.id} href={`/shop/product/${p.id}`} style={{ background: 'var(--cream-50)', border: '1px solid var(--border-1)', borderRadius: 14, overflow: 'hidden', textDecoration: 'none' }}>
                <div style={{ height: 120, background: productBg[p.hue], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 32, height: 80, background: hueGradients[p.hue], borderRadius: 4 }} />
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--cream-600)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{p.brand}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)', lineHeight: 1.3 }}>{p.name}{p.vintage ? ` ${p.vintage}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-600)', marginTop: 2 }}>{p.pack}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cream-900)' }}>{inr(p.price)}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--cream-500)', textDecoration: 'line-through' }}>{inr(p.mrp)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
