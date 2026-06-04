// ui_kits/buyer-app/Screens.jsx
// All buyer-app screens with the new structure:
// - 4 landing tabs: Home (dashboard) / Catalog / Orders / Profile
// - Deep screens (Product, Cart, Placed) hide the tab bar
// - Sticky header + sticky footer via flex layout in .b-app
// - "View Cart" floating button on catalog + product when items > 0

// ---------- shared helpers ----------
function Bottle({ hue }) {
  return <div className={`b-bottle ${hue}`}></div>;
}

function PageHeader({ title, left, right, flat = false }) {
  return (
    <div className={'b-header' + (flat ? ' is-flat' : '')}>
      {left || <div style={{ width: 36 }}></div>}
      <div className="b-header-title">{title}</div>
      {right || <div style={{ width: 36 }}></div>}
    </div>
  );
}

function SectionRow({ title, more, onMore }) {
  return (
    <div className="b-section-row">
      <h3>{title}</h3>
      {more && (
        <span className="more" onClick={onMore}>
          {more}
          <BIconChevR size={14} />
        </span>
      )}
    </div>
  );
}

// ===================================================================
//  LOGIN  (no tab bar)
// ===================================================================
function Login({ onContinue }) {
  const [step, setStep] = React.useState('phone');
  return (
    <div className="b-login">
      <div className="b-login-hero">
        <div className="b-login-logo">
          <img src="../../assets/logo-mark.svg" width="28" height="28" alt="" />
          <span>DealFlow</span>
        </div>
        <h1 className="b-login-headline">
          A curated shelf,<br />
          <em>from your distributor.</em>
        </h1>
      </div>
      <div className="b-login-form">
        {step === 'phone' && (
          <>
            <div className="label">Sign in with phone</div>
            <div className="b-phone-input">
              <span className="cc">+91</span>
              <input type="tel" defaultValue="98103 47281" inputMode="numeric" />
            </div>
            <button className="b-cta" onClick={() => setStep('otp')}>
              <span>Send OTP on WhatsApp</span>
              <BIconChevR size={16} />
            </button>
            <div className="b-login-help">No passwords. We'll send a one-time code to verify it's you.</div>
          </>
        )}
        {step === 'otp' && (
          <>
            <div className="label">Code sent to +91 98103 47281</div>
            <div className="b-otp">
              <input maxLength="1" defaultValue="3" />
              <input maxLength="1" defaultValue="7" />
              <input maxLength="1" defaultValue="1" />
              <input maxLength="1" defaultValue="9" />
            </div>
            <button className="b-cta" onClick={onContinue}>
              <span>Continue</span>
              <BIconChevR size={16} />
            </button>
            <button className="b-cta ghost" onClick={() => setStep('phone')}>Use a different number</button>
          </>
        )}
      </div>
    </div>
  );
}

// ===================================================================
//  HOME — buyer dashboard (landing tab)
// ===================================================================
function Home({ onOpenCatalog, onOpenProduct, onGoOrders }) {
  const dist = BUYER_DISTRIBUTORS;
  const reorder = BUYER_DATA.products.filter(p => p.featured).slice(0, 4);

  return (
    <>
      <div className="b-scroll">
        <div className="b-page-head-row">
          <div className="left">
            <div className="b-eyebrow">Good evening, Rajan</div>
            <h1 className="b-page-title" style={{ fontSize: 26 }}>Your shelf, this month.</h1>
          </div>
          <div className="actions">
            <button className="b-header-action" aria-label="Notifications">
              <BIconBell size={17} />
            </button>
          </div>
        </div>

        <div className="b-kpi-grid">
          <div className="b-kpi feature">
            <div className="b-kpi-label">Spend this year</div>
            <div className="b-kpi-value">₹18,54,000</div>
            <div className="b-kpi-hint">Across 3 distributors · 47 orders</div>
          </div>
          <div className="b-kpi">
            <div className="b-kpi-label">Open orders</div>
            <div className="b-kpi-value">4</div>
            <div className="b-kpi-hint">2 awaiting dispatch</div>
          </div>
          <div className="b-kpi">
            <div className="b-kpi-label">Available credit</div>
            <div className="b-kpi-value">₹1,65,800</div>
            <div className="b-kpi-hint">of ₹2,50,000 limit</div>
          </div>
        </div>

        <div className="b-section">
          <SectionRow title="Your distributors" more="See all" />
          <div className="b-dist-list">
            {dist.map(d => (
              <div className="b-dist-row" key={d.id}>
                <div className="b-dist-avatar">{d.initials}</div>
                <div className="b-dist-meta">
                  <div className="b-dist-name">{d.name}</div>
                  <div className="b-dist-sub">{d.city} · last order {d.lastOrder}</div>
                </div>
                <div>
                  <div className="b-dist-spend">{inrB(d.spend)}</div>
                  <div className={'b-dist-trend ' + (d.trend.startsWith('−') || d.trend.startsWith('-') ? 'down' : 'up')}>{d.trend}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="b-section">
          <SectionRow title="Order again" more="Browse all" onMore={onOpenCatalog} />
          <div className="b-hscroll">
            {reorder.map(p => (
              <div className="b-reorder-card" key={p.id} onClick={() => onOpenProduct(p.id)}>
                <div className={`b-product-photo b-product-photo-${p.hue}`}>
                  <Bottle hue={p.hue} />
                </div>
                <div className="b-reorder-card-body">
                  <div className="b-reorder-name">{p.name}{p.vintage ? ` ${p.vintage}` : ''}</div>
                  <div className="b-reorder-price">{inrB(p.price)} / unit</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="b-section">
          <SectionRow title="New catalogs" more="See all" onMore={onOpenCatalog} />
          <div className="b-hscroll">
            {BUYER_DATA.catalogs.map(c => (
              <div className="b-catalog-mini" key={c.id} onClick={onOpenCatalog}>
                <div className={`hero ${c.hero}`}>
                  <h4>{c.name}</h4>
                </div>
                <div className="meta">
                  <span><strong style={{ color: 'var(--cream-900)', fontWeight: 500 }}>{c.products}</strong> products</span>
                  <span>{c.validUntil}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="b-section" style={{ paddingBottom: 24 }}>
          <SectionRow title="Recent activity" more="See orders" onMore={onGoOrders} />
          <div className="b-order-list">
            {BUYER_DATA.orders.slice(0, 2).map(o => (
              <div className="b-order-card" key={o.id} onClick={onGoOrders}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="b-order-id">{o.id}</span>
                  <span className={`b-status ${o.status}`}>{BUYER_DATA.statusLabels[o.status]}</span>
                </div>
                <div className="b-order-catalog">{o.catalog}</div>
                <div className="b-order-foot">
                  <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>{o.items} products · {o.placed}</span>
                  <span className="b-order-total">{inrB(o.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ===================================================================
//  CATALOG — standard catalog browser (landing tab)
// ===================================================================
function Catalog({ onOpenProduct, onOpenList, onOpenLocation, location }) {
  const [filter, setFilter] = React.useState('all');
  const filters = [
    { id: 'all',      label: 'All' },
    { id: 'wine',     label: 'Wine' },
    { id: 'spirits',  label: 'Spirits' },
    { id: 'beer',     label: 'Beer' },
    { id: 'new',      label: 'New' },
  ];

  return (
    <>
      <div className="b-scroll">
        <div className="b-page-head-row">
          <div className="left">
            <div className="b-eyebrow">Browse</div>
            <h1 className="b-page-title" style={{ fontSize: 26 }}>Catalog</h1>
          </div>
          <div className="actions">
            <button className="b-header-action" aria-label="Help"><BIconHelp size={17} /></button>
          </div>
        </div>

        <div style={{ paddingTop: 10 }}>
          <div className="b-search-bar">
            <BIconSearch size={16} className="ico" />
            <input placeholder="Search brands, SKUs, products…" />
            <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cream-600)' }}>⌘K</kbd>
          </div>
        </div>

        <div className="b-location-row">
          <button className="b-location is-block" onClick={onOpenLocation}>
            <div className="b-location-pin"><BIconPin size={14} /></div>
            <div className="b-location-text">
              <div className="b-location-eyebrow">Deliver to</div>
              <div className="b-location-name">{location?.name} · {location?.address}</div>
            </div>
            <BIconChevD size={14} style={{ color: 'var(--cream-700)' }} />
          </button>
        </div>

        <div className="b-inline-tabs">
          {filters.map(f => (
            <button
              key={f.id}
              className={'b-inline-tab' + (filter === f.id ? ' is-on' : '')}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="b-section">
          <SectionRow title="Catalogs from your sellers" more="Show all" onMore={() => onOpenList?.({ kind: 'catalog', id: 'c1', name: 'Summer Pours', subtitle: 'A curated selection from your private cellar' })} />
          <div className="b-hscroll">
            {BUYER_DATA.catalogs.map(c => (
              <div className="b-catalog-mini" key={c.id} onClick={() => onOpenList?.({ kind: 'catalog', id: c.id, name: c.name, subtitle: c.subtitle })}>
                <div className={`hero ${c.hero}`}>
                  <h4>{c.name}</h4>
                </div>
                <div className="meta">
                  <span><strong style={{ color: 'var(--cream-900)', fontWeight: 500 }}>{c.products}</strong> products</span>
                  <span>{c.validUntil}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="b-section">
          <SectionRow title="Browse by category" more="Show all" />
          <div className="b-cat-grid">
            {BUYER_CATEGORIES.slice(0, 6).map(c => {
              const Ico = c.id === 'wine' ? BIconWine : c.id === 'beer' ? BIconBeer : c.id === 'spirits' ? BIconSpark : BIconGrid;
              return (
                <div className="b-cat-tile" key={c.id} onClick={() => onOpenList?.({ kind: 'category', id: c.id, name: c.name, subtitle: `${c.count} products from your distributors` })}>
                  <div className={`b-cat-icon ${c.hue}`}><Ico size={22} /></div>
                  <div className="b-cat-name">{c.name}</div>
                  <div className="b-cat-count">{c.count}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="b-section">
          <SectionRow title="Top brands" more="Show all" />
          <div className="b-brand-row">
            {BUYER_BRANDS.map(b => (
              <div className="b-brand-chip" key={b.id} onClick={() => onOpenList?.({ kind: 'brand', id: b.id, name: b.name, subtitle: 'Brand catalogue' })}>
                <div className="b-brand-chip-avatar">{b.initials}</div>
                <div className="b-brand-chip-name">{b.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="b-section">
          <SectionRow title="The picks · this week" more="Show all" />
          <div className="b-product-grid">
            {BUYER_DATA.products.slice(0, 4).map(p => (
              <div
                className={`b-product-card ${p.featured ? 'featured' : ''}`}
                key={p.id}
                onClick={() => onOpenProduct(p.id)}
              >
                <div className={`b-product-photo b-product-photo-${p.hue}`}>
                  {p.featured && <span className="b-product-featured-badge">Featured</span>}
                  <Bottle hue={p.hue} />
                </div>
                <div className="b-product-body">
                  <div className="b-product-brand">{p.brand}</div>
                  <div className="b-product-name">{p.name}{p.vintage ? ` ${p.vintage}` : ''}</div>
                  <div className="b-product-pack">{p.pack}</div>
                  <div className="b-product-prices">
                    <span className="b-product-price">{inrB(p.price)}</span>
                    <span className="b-product-mrp">{inrB(p.mrp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="b-section" style={{ paddingBottom: 32 }}>
          <SectionRow title="More from WineYard Vintners" more="Show all" />
          <div className="b-product-grid">
            {BUYER_DATA.products.slice(4, 8).map(p => (
              <div
                className="b-product-card"
                key={p.id}
                onClick={() => onOpenProduct(p.id)}
              >
                <div className={`b-product-photo b-product-photo-${p.hue}`}>
                  <Bottle hue={p.hue} />
                </div>
                <div className="b-product-body">
                  <div className="b-product-brand">{p.brand}</div>
                  <div className="b-product-name">{p.name}{p.vintage ? ` ${p.vintage}` : ''}</div>
                  <div className="b-product-pack">{p.pack}</div>
                  <div className="b-product-prices">
                    <span className="b-product-price">{inrB(p.price)}</span>
                    <span className="b-product-mrp">{inrB(p.mrp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ===================================================================
//  PRODUCT DETAIL — deep screen (no tab bar)
// ===================================================================
function Product({ productId, onBack, onAdd }) {
  const p = BUYER_DATA.products.find(x => x.id === productId) || BUYER_DATA.products[0];
  const [qty, setQty] = React.useState(12);
  const saved = p.mrp - p.price;

  return (
    <>
      <PageHeader
        title="Product"
        left={<button className="b-header-back" onClick={onBack}><BIconBack size={18} /></button>}
        right={<button className="b-header-action"><BIconSearch size={16} /></button>}
      />

      <div className="b-scroll">
        <div className={`b-pd-hero b-pd-hero-compact b-product-photo-${p.hue}`}>
          <Bottle hue={p.hue} />
          <div className="b-pd-fav"><BIconHeart size={16} /></div>
        </div>

        <div className="b-pd-content">
          <div className="b-pd-brand">{p.brand}</div>
          <h1 className="b-pd-title">{p.name} {p.vintage && <em>{p.vintage}</em>}</h1>
          <div className="b-pd-sku">{p.sku} · {p.pack}</div>

          <div className="b-pd-prices">
            <span className="b-pd-price">{inrB(p.price)}</span>
            <span className="b-pd-mrp">MRP {inrB(p.mrp)}</span>
            {saved > 0 && <span className="b-pd-save">Save {inrB(saved)} / unit</span>}
          </div>

          <p className="b-pd-note">{p.note}</p>

          <div className="b-pd-attrs">
            <div className="b-pd-attr"><div className="l">Pack</div><div className="v">{p.pack}</div></div>
            <div className="b-pd-attr"><div className="l">MOQ</div><div className="v">12 units</div></div>
            <div className="b-pd-attr"><div className="l">In stock</div><div className="v">240 units</div></div>
            <div className="b-pd-attr"><div className="l">Delivery</div><div className="v">2–3 days</div></div>
          </div>

          <div style={{ marginTop: 24 }} className="eyebrow b-eyebrow">Product attributes</div>
          <div className="b-pd-spec">
            <div className="b-pd-spec-row"><span className="l">Region</span><span className="v">{p.vintage ? 'Nashik, India' : 'Pune, India'}</span></div>
            <div className="b-pd-spec-row"><span className="l">ABV</span><span className="v">{p.brand.includes('Brewing') ? '6.2%' : p.brand.includes('Spirits') ? '43%' : '13.5%'}</span></div>
            <div className="b-pd-spec-row"><span className="l">Volume</span><span className="v">{p.pack}</span></div>
            <div className="b-pd-spec-row"><span className="l">HSN code</span><span className="v">22042100</span></div>
            <div className="b-pd-spec-row"><span className="l">GST rate</span><span className="v">18%</span></div>
            <div className="b-pd-spec-row"><span className="l">Master SKU</span><span className="v">{p.sku}</span></div>
            <div className="b-pd-spec-row"><span className="l">Best before</span><span className="v">36 months</span></div>
          </div>

          <div style={{ marginTop: 24 }} className="eyebrow b-eyebrow">More from {p.brand}</div>
          <div className="b-hscroll" style={{ padding: '12px 0 24px', marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24 }}>
            {BUYER_DATA.products.filter(x => x.brand === p.brand && x.id !== p.id).slice(0, 4).map(x => (
              <div className="b-reorder-card" key={x.id} onClick={() => { /* swap product */ }}>
                <div className={`b-product-photo b-product-photo-${x.hue}`}><Bottle hue={x.hue} /></div>
                <div className="b-reorder-card-body">
                  <div className="b-reorder-name">{x.name}{x.vintage ? ` ${x.vintage}` : ''}</div>
                  <div className="b-reorder-price">{inrB(x.price)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="b-pd-cart-bar">
        <div className="b-qty">
          <button onClick={() => setQty(Math.max(12, qty - 12))}><BIconMinus size={14} /></button>
          <span className="n">{qty}</span>
          <button onClick={() => setQty(qty + 12)}><BIconPlus size={14} /></button>
        </div>
        <button className="b-cta" style={{ flex: 1 }} onClick={() => onAdd(p, qty)}>
          <BIconCart size={16} />
          <span>Add · {inrB(p.price * qty)}</span>
        </button>
      </div>
    </>
  );
}

// ===================================================================
//  CART — deep screen (no tab bar)
// ===================================================================
function Cart({ items, onBack, onCheckout, onChange, location }) {
  const [list, setList] = React.useState(
    items.length ? items : [
      { ...BUYER_DATA.products[0], qty: 24 },
      { ...BUYER_DATA.products[2], qty: 12 },
      { ...BUYER_DATA.products[4], qty: 36 },
    ]
  );
  const subtotal = list.reduce((s, x) => s + x.price * x.qty, 0);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  const updateQty = (id, delta) => {
    const next = list.map(x => x.id === id ? { ...x, qty: Math.max(12, x.qty + delta) } : x);
    setList(next);
    onChange?.(next);
  };

  return (
    <>
      <PageHeader
        title="Cart"
        left={<button className="b-header-back" onClick={onBack}><BIconBack size={18} /></button>}
      />
      <div className="b-scroll">
        <div className="b-page-head" style={{ padding: '12px 24px 14px' }}>
          <div className="b-eyebrow">{list.length} products · {list.reduce((s, x) => s + x.qty, 0)} units</div>
          <h1 className="b-page-title" style={{ fontSize: 26 }}>Review &amp; place</h1>
        </div>

        <div className="b-cart-list">
          {list.map(x => (
            <div className="b-cart-row" key={x.id}>
              <div className={`b-cart-thumb b-product-photo-${x.hue}`} style={{ padding: 8 }}>
                <Bottle hue={x.hue} />
              </div>
              <div className="b-cart-meta">
                <div className="b-cart-name">{x.name}{x.vintage ? ` ${x.vintage}` : ''}</div>
                <div className="b-cart-sub">{x.brand} · {x.pack}</div>
                <div className="b-cart-line">
                  <div className="b-cart-mini-qty">
                    <button onClick={() => updateQty(x.id, -12)}><BIconMinus size={12} /></button>
                    <span>{x.qty}</span>
                    <button onClick={() => updateQty(x.id, 12)}><BIconPlus size={12} /></button>
                  </div>
                  <div className="b-cart-row-total">{inrB(x.price * x.qty)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="b-cart-summary">
          <div className="b-summary-row"><span className="l">Subtotal</span><span className="v">{inrB(subtotal)}</span></div>
          <div className="b-summary-row"><span className="l">GST · 18%</span><span className="v">{inrB(tax)}</span></div>
          <div className="b-summary-row"><span className="l">Delivery</span><span className="v">Included</span></div>
          <div className="b-summary-row total"><span className="l">Total</span><span className="v">{inrB(total)}</span></div>
        </div>

        <div className="b-deliver-card">
          <div className="b-deliver-icon"><BIconPin size={16} /></div>
          <div className="b-deliver-meta">
            <div className="b-deliver-label">Deliver to</div>
            <div className="b-deliver-name">{location?.name || 'Delhi Showroom'}</div>
            <div className="b-deliver-addr">{location?.address || 'Karol Bagh · 110005'} · 2–3 days</div>
          </div>
          <a className="b-deliver-change">Change <BIconChevR size={12} /></a>
        </div>

        <div style={{ height: 22 }}></div>
      </div>

      <div className="b-checkout-bar">
        <button className="b-cta ember" onClick={onCheckout}>
          <BIconCheck size={16} />
          <span>Place order · {inrB(total)}</span>
        </button>
      </div>
    </>
  );
}

// ===================================================================
//  ORDER PLACED — deep screen (no tab bar)
// ===================================================================
function Placed({ onDone }) {
  return (
    <>
      <PageHeader title="Order placed" />
      <div className="b-scroll">
        <div className="b-placed" style={{ padding: '48px 32px 80px' }}>
          <div className="b-placed-mark">
            <BIconCheck size={36} stroke={2} />
          </div>
          <h1 className="b-placed-title">Order placed.</h1>
          <p className="b-placed-sub">We've notified Phani Distribution. They typically confirm within an hour. You'll see updates here and on WhatsApp.</p>

          <div className="b-placed-receipt">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="b-order-id">DF-2026-00472</span>
              <span className="b-status received">Received</span>
            </div>
            <div className="b-order-catalog">Summer Pours · 3 products</div>
            <div className="b-order-foot">
              <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>Just now</span>
              <span className="b-order-total">₹1,72,260</span>
            </div>
          </div>
        </div>
      </div>
      <div className="b-checkout-bar">
        <button className="b-cta" onClick={onDone}>
          <span>Back to catalog</span>
        </button>
      </div>
    </>
  );
}

// ===================================================================
//  ORDERS — landing tab with sub-tabs (Orders / Enquiries / Invoices)
// ===================================================================
function OrdersList() {
  const [tab, setTab] = React.useState('orders');
  const [filter, setFilter] = React.useState('all');
  const filters = [
    { id: 'all',        label: 'All' },
    { id: 'received',   label: 'Received' },
    { id: 'confirmed',  label: 'Confirmed' },
    { id: 'dispatched', label: 'Dispatched' },
    { id: 'delivered',  label: 'Delivered' },
  ];
  const subtabs = [
    { id: 'orders',    label: 'Orders',    count: BUYER_DATA.orders.length },
    { id: 'enquiries', label: 'Enquiries', count: BUYER_DATA.enquiries.length },
    { id: 'invoices',  label: 'Invoices',  count: BUYER_DATA.invoices.length },
  ];
  const rows = filter === 'all' ? BUYER_DATA.orders : BUYER_DATA.orders.filter(o => o.status === filter);

  return (
    <>
      <div className="b-scroll">
        <div className="b-page-head-row">
          <div className="left">
            <div className="b-eyebrow">Activity</div>
            <h1 className="b-page-title" style={{ fontSize: 26 }}>Your orders</h1>
          </div>
          <div className="actions">
            <button className="b-header-action" aria-label="Search"><BIconSearch size={17} /></button>
          </div>
        </div>

        <div className="b-subtabs">
          {subtabs.map(t => (
            <button
              key={t.id}
              className={'b-subtab' + (tab === t.id ? ' is-on' : '')}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '14px 18px 0' }}>
          <div className="b-search-bar" style={{ margin: 0 }}>
            <BIconSearch size={16} className="ico" />
            <input placeholder={`Search ${tab}…`} />
          </div>
        </div>

        {tab === 'orders' && (
          <>
            <div className="b-inline-tabs">
              {filters.map(f => (
                <button
                  key={f.id}
                  className={'b-inline-tab' + (filter === f.id ? ' is-on' : '')}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="b-order-list" style={{ paddingTop: 6, paddingBottom: 24 }}>
              {rows.map(o => (
                <div className="b-order-card" key={o.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="b-order-id">{o.id}</span>
                    <span className={`b-status ${o.status}`}>{BUYER_DATA.statusLabels[o.status]}</span>
                  </div>
                  <div className="b-order-catalog">{o.catalog}</div>
                  <div className="b-order-foot">
                    <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>{o.items} products · {o.placed}</span>
                    <span className="b-order-total">{inrB(o.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'enquiries' && (
          <div className="b-order-list" style={{ paddingTop: 14, paddingBottom: 24 }}>
            {BUYER_DATA.enquiries.map(e => (
              <div className="b-order-card" key={e.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="b-order-id">{e.id}</span>
                  <span className={`b-status ${e.status === 'open' ? 'received' : e.status === 'replied' ? 'confirmed' : 'delivered'}`}>
                    {BUYER_DATA.enquiryStatusLabels[e.status]}
                  </span>
                </div>
                <div className="b-order-catalog">{e.subject}</div>
                <div className="b-order-foot">
                  <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>{e.distributor} · {e.placed}</span>
                  <BIconChevR size={14} style={{ color: 'var(--cream-600)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'invoices' && (
          <div className="b-order-list" style={{ paddingTop: 14, paddingBottom: 24 }}>
            {BUYER_DATA.invoices.map(inv => (
              <div className="b-order-card" key={inv.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="b-order-id">{inv.id}</span>
                  <span className={`b-status ${inv.status === 'paid' ? 'delivered' : inv.status === 'due' ? 'confirmed' : 'received'}`}
                        style={inv.status === 'overdue' ? { background: '#F6E5DF', color: '#6B2615' } : null}>
                    {BUYER_DATA.invoiceStatusLabels[inv.status]}
                  </span>
                </div>
                <div className="b-order-catalog">{inrB(inv.amount)}</div>
                <div className="b-order-foot">
                  <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>Issued {inv.issued} · Due {inv.due}</span>
                  <BIconReceipt size={14} style={{ color: 'var(--cream-600)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ===================================================================
//  PROFILE — landing tab (with bottom-sheet edit example)
// ===================================================================
function Profile({ onLogout, onOpenSheet }) {
  const p = BUYER_PROFILE;
  return (
    <>
      <div className="b-scroll">
        <div className="b-profile-head">
          <div className="b-profile-avatar">{p.name.split(' ').map(s => s[0]).join('')}</div>
          <div className="b-profile-name">{p.name}</div>
          <div className="b-profile-sub">{p.business} · {p.tier}</div>
        </div>

        <div className="b-section" style={{ paddingTop: 24 }}>
          <div className="eyebrow b-eyebrow" style={{ padding: '0 22px 8px' }}>Account</div>
          <div className="b-profile-card">
            <div className="b-profile-row" onClick={() => onOpenSheet?.('business')}>
              <div className="b-profile-row-icon"><BIconUser size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">Business details</div>
                <div className="b-profile-row-sub">{p.business}</div>
              </div>
              <BIconEdit size={15} style={{ color: 'var(--cream-600)' }} />
            </div>
            <div className="b-profile-row">
              <div className="b-profile-row-icon"><BIconShield size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">GSTIN</div>
                <div className="b-profile-row-sub" style={{ fontFamily: 'var(--font-mono)' }}>{p.gstin}</div>
              </div>
              <BIconChevR size={16} style={{ color: 'var(--cream-600)' }} />
            </div>
            <div className="b-profile-row">
              <div className="b-profile-row-icon ember"><BIconCard size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">Credit limit</div>
                <div className="b-profile-row-sub">{inrB(p.used)} used of {inrB(p.credit)}</div>
              </div>
              <BIconChevR size={16} style={{ color: 'var(--cream-600)' }} />
            </div>
            <div className="b-profile-row">
              <div className="b-profile-row-icon"><BIconPin size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">Delivery locations</div>
                <div className="b-profile-row-sub">2 saved · Delhi, Gurugram</div>
              </div>
              <BIconChevR size={16} style={{ color: 'var(--cream-600)' }} />
            </div>
          </div>
        </div>

        <div className="b-section">
          <div className="eyebrow b-eyebrow" style={{ padding: '0 22px 8px' }}>Preferences</div>
          <div className="b-profile-card">
            <div className="b-profile-row">
              <div className="b-profile-row-icon"><BIconBell size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">Notifications</div>
                <div className="b-profile-row-sub">WhatsApp + push</div>
              </div>
              <span className="b-profile-row-value">On</span>
            </div>
            <div className="b-profile-row">
              <div className="b-profile-row-icon"><BIconGrid size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">Catalog view</div>
                <div className="b-profile-row-sub">Lookbook or grid</div>
              </div>
              <span className="b-profile-row-value">Lookbook</span>
            </div>
            <div className="b-profile-row">
              <div className="b-profile-row-icon"><BIconChat size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">Language</div>
                <div className="b-profile-row-sub">Display language</div>
              </div>
              <span className="b-profile-row-value">English</span>
            </div>
            <div className="b-profile-row">
              <div className="b-profile-row-icon"><BIconHelp size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label">Help &amp; support</div>
                <div className="b-profile-row-sub">Chat with us on WhatsApp</div>
              </div>
              <BIconChevR size={16} style={{ color: 'var(--cream-600)' }} />
            </div>
          </div>
        </div>

        <div className="b-section" style={{ paddingBottom: 28 }}>
          <div className="b-profile-card" style={{ marginTop: 4 }}>
            <div className="b-profile-row" onClick={onLogout}>
              <div className="b-profile-row-icon danger"><BIconLogout size={16} /></div>
              <div className="b-profile-row-meta">
                <div className="b-profile-row-label" style={{ color: 'var(--danger-500)' }}>Log out</div>
                <div className="b-profile-row-sub">You'll need a fresh OTP next time.</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--cream-700)', fontFamily: 'var(--font-mono)' }}>
            DealFlow Buyer · v1.0.4
          </div>
        </div>
      </div>
    </>
  );
}

// ===================================================================
//  VIEW CART floating button
// ===================================================================
function ViewCartButton({ count, total, onView, noTabs = false }) {
  if (!count) return null;
  return (
    <button className={'b-view-cart' + (noTabs ? ' no-tabs' : '')} onClick={onView}>
      <span className="pill">{count}</span>
      <span>View cart</span>
      <span style={{ opacity: 0.6 }}>·</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{inrB(total)}</span>
      <BIconChevR size={16} className="arrow" />
    </button>
  );
}

// ===================================================================
//  PRODUCT LIST — deep screen (drill-down from category / catalog / brand)
// ===================================================================
function ProductList({ source, onBack, onOpenProduct }) {
  // source = { kind: 'category' | 'catalog' | 'brand', id, name, subtitle }
  const eyebrowLabel = source?.kind === 'category' ? 'Category'
    : source?.kind === 'catalog' ? 'Catalog'
    : source?.kind === 'brand' ? 'Brand'
    : 'List';
  const products = BUYER_DATA.products;

  return (
    <>
      <div className="b-scroll">
        <div className="b-pl-back-row">
          <button className="b-pl-back" onClick={onBack}><BIconBack size={18} /></button>
        </div>
        <div className="b-pl-head">
          <div className="b-pl-eyebrow">{eyebrowLabel}</div>
          <h1 className="b-pl-title">{source?.name || 'Products'}</h1>
          <div className="b-pl-sub">{source?.subtitle || 'Curated from your distributors'}</div>
        </div>

        <div style={{ padding: '6px 18px 0' }}>
          <div className="b-search-bar" style={{ margin: 0 }}>
            <BIconSearch size={16} className="ico" />
            <input placeholder="Search within this list…" />
          </div>
        </div>

        <div className="b-pl-toolbar">
          <span className="count">{products.length}</span>
          <span>products</span>
          <button className="b-pl-sort"><BIconSort size={14} /> Price · low to high</button>
        </div>

        <div className="b-product-grid" style={{ paddingTop: 16, paddingBottom: 24 }}>
          {products.map(p => (
            <div
              key={p.id}
              className={`b-product-card ${p.featured ? 'featured' : ''}`}
              onClick={() => onOpenProduct(p.id)}
            >
              <div className={`b-product-photo b-product-photo-${p.hue}`}>
                {p.featured && <span className="b-product-featured-badge">Featured</span>}
                <Bottle hue={p.hue} />
              </div>
              <div className="b-product-body">
                <div className="b-product-brand">{p.brand}</div>
                <div className="b-product-name">{p.name}{p.vintage ? ` ${p.vintage}` : ''}</div>
                <div className="b-product-pack">{p.pack}</div>
                <div className="b-product-prices">
                  <span className="b-product-price">{inrB(p.price)}</span>
                  <span className="b-product-mrp">{inrB(p.mrp)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ===================================================================
//  BOTTOM SHEET — generic, used for the Profile "edit business" example
// ===================================================================
function BottomSheet({ open, onClose, title, subtitle, children, footer }) {
  return (
    <>
      <div className={'b-sheet-backdrop' + (open ? ' is-open' : '')} onClick={onClose}></div>
      <div className={'b-sheet' + (open ? ' is-open' : '')}>
        <div className="b-sheet-handle"></div>
        {title && <h2 className="b-sheet-title">{title}</h2>}
        {subtitle && <div className="b-sheet-sub">{subtitle}</div>}
        {children}
        {footer && <div className="b-sheet-actions">{footer}</div>}
      </div>
    </>
  );
}

function BusinessEditSheet({ open, onClose, onSave }) {
  const p = BUYER_PROFILE;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Edit business details"
      subtitle="These appear on every order placed and on invoices issued by your distributors."
      footer={
        <>
          <button className="b-cta secondary" onClick={onClose}>Cancel</button>
          <button className="b-cta" onClick={onSave}>
            <BIconCheck size={16} />
            <span>Save changes</span>
          </button>
        </>
      }
    >
      <div className="b-sheet-field">
        <label className="l">Business name</label>
        <input defaultValue={p.business} />
      </div>
      <div className="b-sheet-field">
        <label className="l">Owner name</label>
        <input defaultValue={p.name} />
      </div>
      <div className="b-sheet-field">
        <label className="l">Phone</label>
        <input defaultValue={p.phone} />
      </div>
      <div className="b-sheet-field">
        <label className="l">Tier</label>
        <input defaultValue={p.tier} readOnly style={{ background: 'var(--cream-100)', color: 'var(--cream-700)' }} />
      </div>
    </BottomSheet>
  );
}

Object.assign(window, {
  Bottle, Login, Home, Catalog, Product, Cart, Placed, OrdersList, Profile,
  ProductList, BottomSheet, BusinessEditSheet,
  ViewCartButton, PageHeader,
});
