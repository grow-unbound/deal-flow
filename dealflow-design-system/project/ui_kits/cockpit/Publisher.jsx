// ui_kits/cockpit/Publisher.jsx
// Catalog publisher: 3-step builder (Cohort → Products → Review).
// Self-contained state.

function Publisher({ onDone, onCancel }) {
  const [step, setStep] = React.useState(1);
  const [cohortId, setCohortId] = React.useState('ndla');
  const [selected, setSelected] = React.useState(['p1', 'p2', 'p7']);
  const [name, setName] = React.useState('Summer Reserve');
  const [valid, setValid] = React.useState('31 May 2026');

  const cohort = DF_DATA.cohorts.find(c => c.id === cohortId);
  const products = DF_DATA.products;
  const selectedProducts = products.filter(p => selected.includes(p.id));
  const subtotal = selectedProducts.reduce((sum, p) => sum + p.price, 0);

  const toggleSel = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const steps = [
    { n: 1, label: 'Choose cohort', meta: cohort ? `${cohort.members} buyers` : 'Pick a cohort' },
    { n: 2, label: 'Pick products', meta: `${selected.length} selected` },
    { n: 3, label: 'Review & publish', meta: name },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="New catalog"
        title="Publish to your retailers"
        subtitle="Three steps. Your buyers see the catalog within a minute of publishing."
        actions={
          <>
            <button className="cockpit-btn cockpit-btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="cockpit-btn cockpit-btn-secondary">Save as draft</button>
            <button className="cockpit-btn cockpit-btn-primary" onClick={onDone}>
              <IconCheck size={14} /><span>Publish catalog</span>
            </button>
          </>
        }
      />

      <div className="publisher">
        {/* LEFT: step rail */}
        <div className="step-list">
          {steps.map(s => (
            <div
              key={s.n}
              className={'step' + (step === s.n ? ' is-active' : '') + (step > s.n ? ' is-done' : '')}
              onClick={() => setStep(s.n)}
            >
              <div className="step-num">{step > s.n ? <IconCheck size={12} stroke={2} /> : s.n}</div>
              <div className="step-content">
                <div className="step-label">{s.label}</div>
                <div className="step-meta">{s.meta}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CENTER: step content */}
        <div>
          {step === 1 && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">Who should see this?</h3>
                  <div className="panel-subtitle">Cohorts are rule-based groups of buyers. You can pick a single buyer or a geography instead.</div>
                </div>
              </div>
              <div className="panel-body">
                {DF_DATA.cohorts.map(c => (
                  <div
                    key={c.id}
                    className={'product-row' + (cohortId === c.id ? ' is-selected' : '')}
                    onClick={() => setCohortId(c.id)}
                  >
                    <div className={'product-check' + (cohortId === c.id ? ' is-on' : '')}>
                      {cohortId === c.id && <IconCheck size={11} stroke={3} />}
                    </div>
                    <div className="product-row-meta">
                      <div className="product-row-name">{c.name}</div>
                      <div className="product-row-sku">{c.rules}</div>
                    </div>
                    <div className="pill" style={{ background: 'var(--cream-200)', color: 'var(--cream-800)' }}>
                      {c.members} buyers
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="product-picker">
              <div className="product-picker-head">
                <h3>Pick products</h3>
                <div className="product-picker-search">
                  <IconSearch size={14} />
                  <input placeholder="Search by SKU or name…" />
                </div>
              </div>
              <div className="chips" style={{ padding: '10px 18px', borderBottom: '1px solid var(--cream-300)' }}>
                <span className="chip is-on">All brands</span>
                <span className="chip">WineYard</span>
                <span className="chip">Maison Roussel</span>
                <span className="chip">Khanna Brewing</span>
                <span className="chip">Tara Spirits</span>
              </div>
              {products.map(p => {
                const isOn = selected.includes(p.id);
                return (
                  <div key={p.id} className={'product-row' + (isOn ? ' is-selected' : '')} onClick={() => toggleSel(p.id)}>
                    <div className={'product-check' + (isOn ? ' is-on' : '')}>
                      {isOn && <IconCheck size={11} stroke={3} />}
                    </div>
                    <ProductThumb hue={p.hue} size={44} />
                    <div className="product-row-meta">
                      <div className="product-row-name">{p.name}</div>
                      <div className="product-row-brand">{p.brand} · {p.pack}</div>
                    </div>
                    <div className="product-row-sku">{p.sku}</div>
                    <div className="product-row-price">
                      <div>{inr(p.price)}</div>
                      <div className="product-row-mrp">MRP {inr(p.mrp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">Review & publish</h3>
                  <div className="panel-subtitle">Give your catalog a name and confirm the validity window.</div>
                </div>
              </div>
              <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Catalog name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-400)', borderRadius: 8, font: 'inherit', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Valid until</label>
                  <input
                    value={valid}
                    onChange={e => setValid(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-400)', borderRadius: 8, font: 'inherit', fontSize: 14 }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>Message to your retailers</label>
                  <textarea
                    defaultValue={"A small curated selection from our private cellar — limited cases."}
                    rows={2}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-400)', borderRadius: 8, font: 'inherit', fontSize: 14, resize: 'vertical' }}
                  />
                </div>
              </div>
              <div className="preview-card">
                <div className="catalog-hero catalog-hero-teal">
                  <h3>{name}</h3>
                  <span className="catalog-hero-badge published">PREVIEW</span>
                </div>
                <div className="catalog-body">
                  <div className="catalog-meta">
                    <div className="row"><span>Cohort</span><strong>{cohort?.name}</strong></div>
                    <div className="row"><span>Products</span><strong>{selected.length}</strong></div>
                    <div className="row"><span>Valid until</span><strong>{valid}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: live summary */}
        <div className="publish-summary">
          <h3>Catalog summary</h3>
          <div className="summary-row"><span className="l">Cohort</span><span className="v" style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{cohort?.name}</span></div>
          <div className="summary-row"><span className="l">Buyers reached</span><span className="v">{cohort?.members}</span></div>
          <div className="summary-row"><span className="l">Products</span><span className="v">{selected.length}</span></div>
          <div className="summary-row"><span className="l">Catalog value</span><span className="v">{inr(subtotal)}</span></div>
          <div className="summary-row"><span className="l">Valid until</span><span className="v" style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{valid}</span></div>
          <div style={{ marginTop: 16, padding: 12, background: 'var(--cream-50)', borderRadius: 10, fontSize: 12, color: 'var(--cream-700)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--cream-900)' }}>What happens next</strong>
            <div style={{ marginTop: 4 }}>Each buyer in the cohort receives a WhatsApp link. The catalog opens in their browser — no install needed.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Publisher = Publisher;
