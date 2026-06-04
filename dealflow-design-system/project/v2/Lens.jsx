// v2/Lens.jsx
// Lens-pair demos. The point: relational data viewed from inverse sides
// is NOT duplicate UI — each side answers a different question in its
// own context. This file renders four such pairs as side-by-side cards.

/* ────────────────────────────────────────────────
   LensPair — left card / arrow / right card
   ──────────────────────────────────────────────── */
function LensPair({ leftEyebrow, leftTitle, leftBody, rightEyebrow, rightTitle, rightBody, joinNote }) {
  return (
    <div className="lens-pair">
      <article className="lens-card">
        <div className="lens-card-eyebrow">{leftEyebrow}</div>
        <h3 className="lens-card-title">{leftTitle}</h3>
        <div className="lens-card-body">{leftBody}</div>
      </article>

      <div className="lens-join">
        <div className="lens-join-line"></div>
        <div className="lens-join-pill">{joinNote}</div>
        <div className="lens-join-line"></div>
      </div>

      <article className="lens-card">
        <div className="lens-card-eyebrow">{rightEyebrow}</div>
        <h3 className="lens-card-title">{rightTitle}</h3>
        <div className="lens-card-body">{rightBody}</div>
      </article>
    </div>
  );
}

/* ────────────────────────────────────────────────
   List row helper for lens bodies
   ──────────────────────────────────────────────── */
function LensRow({ avatar, name, sub, right }) {
  return (
    <div className="lens-row">
      {avatar}
      <div className="lens-row-meta">
        <div className="lens-row-name">{name}</div>
        {sub && <div className="lens-row-sub">{sub}</div>}
      </div>
      <div className="lens-row-right">{right}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   PAIR 1 — Brand · top buyers   vs.   Customer · top brands
   The Singh Hospitality × WineYard relationship from both sides.
   ════════════════════════════════════════════════ */
function LensBrandBuyers() {
  return (
    <LensPair
      leftEyebrow="WineYard Vintners → Performance"
      leftTitle="Top buyers of this brand"
      leftBody={
        <React.Fragment>
          {BRAND_DETAIL.perf.topBuyers.map((b, i) => (
            <LensRow
              key={i}
              avatar={<div className="lens-rank">{i+1}</div>}
              name={b.name}
              sub={`${b.city.toUpperCase()} · ${b.orders} orders`}
              right={<span className="lens-money">{inrShort(b.spend)}</span>}
            />
          ))}
        </React.Fragment>
      }
      joinNote="One join, two views"
      rightEyebrow="Singh Hospitality → Performance"
      rightTitle="Brand mix · where the spend goes"
      rightBody={
        <React.Fragment>
          {CUSTOMER_DETAIL.perf.brandMix.map((b, i) => (
            <LensRow
              key={i}
              avatar={<BrandAvatarSm initials={b.name === 'WineYard' ? 'WY' : b.name.slice(0, 2).toUpperCase()} hue={b.hue} size={26} />}
              name={b.name}
              sub={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 60, height: 4, background: 'var(--cream-200)', borderRadius: 999, display: 'inline-block', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: b.share + '%', background: b.hue === 'ember' ? 'var(--ember-400)' : b.hue === 'cream' ? 'var(--cream-600)' : 'var(--teal-500)' }}></span>
                </span>
                {b.share}% of spend
              </span>}
              right={<span className="lens-money">{inrShort(CUSTOMER_DETAIL.perf.spend * b.share / 100)}</span>}
            />
          ))}
        </React.Fragment>
      }
    />
  );
}

/* ════════════════════════════════════════════════
   PAIR 2 — Brand · top products   vs.   Product · which brand + siblings
   ════════════════════════════════════════════════ */
function LensBrandProducts() {
  return (
    <LensPair
      leftEyebrow="WineYard Vintners → Performance"
      leftTitle="Top SKUs"
      leftBody={
        <React.Fragment>
          {BRAND_DETAIL.perf.topSkus.map((s, i) => (
            <LensRow
              key={i}
              avatar={<div className="lens-bottle"><i></i></div>}
              name={s.name}
              sub={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{s.sku}</span>}
              right={
                <div style={{ textAlign: 'right' }}>
                  <div className="lens-money">{inrShort(s.gmv)}</div>
                  <div className="lens-row-tiny">{s.units} units</div>
                </div>
              }
            />
          ))}
        </React.Fragment>
      }
      joinNote="Product belongs to brand"
      rightEyebrow="Cabernet Sauvignon 2021 → Details"
      rightTitle="Brand parent · sibling SKUs"
      rightBody={
        <React.Fragment>
          <div className="lens-parent">
            <BrandAvatarSm initials="WY" hue="teal" size={32} />
            <div className="lens-parent-meta">
              <div className="lens-parent-name">WineYard Vintners</div>
              <div className="lens-parent-sub">Carried since Apr 2019 · 82 SKUs · 18% margin</div>
            </div>
            <a className="lens-parent-link">Open brand →</a>
          </div>
          <div className="lens-section-eyebrow">Other SKUs in this brand</div>
          {BRAND_DETAIL.perf.topSkus.filter(s => s.sku !== PRODUCT_DETAIL.sku).map((s, i) => (
            <LensRow
              key={i}
              avatar={<div className="lens-bottle small"><i></i></div>}
              name={s.name}
              sub={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>{s.sku}</span>}
              right={<span className="lens-row-tiny">{s.units} units · {inrShort(s.gmv)}</span>}
            />
          ))}
        </React.Fragment>
      }
    />
  );
}

/* ════════════════════════════════════════════════
   PAIR 3 — Cohort · members   vs.   Customer · cohorts they're in
   ════════════════════════════════════════════════ */
function LensCohortMembers() {
  return (
    <LensPair
      leftEyebrow="Maharashtra Premium → Details"
      leftTitle="Members of this cohort"
      leftBody={
        <React.Fragment>
          {COHORT_DETAIL.perf.topMembers.map((m, i) => (
            <LensRow
              key={i}
              avatar={<BrandAvatarSm initials={m.name.slice(0, 2).toUpperCase()} hue={i === 0 ? 'cream' : i === 1 ? 'teal' : 'ember'} size={26} />}
              name={m.name}
              sub={`${m.city.toUpperCase()} · ${m.orders} orders`}
              right={<span className="lens-money">{inrShort(m.spend)}</span>}
            />
          ))}
          <div className="lens-footer">+ 24 other members</div>
        </React.Fragment>
      }
      joinNote="Many-to-many"
      rightEyebrow="Mehta Brothers → Details"
      rightTitle="Cohorts this buyer belongs to"
      rightBody={
        <React.Fragment>
          <LensRow
            avatar={<div className="lens-cohort-dot" style={{ background: 'var(--ember-400)' }}></div>}
            name="Maharashtra Premium"
            sub="Geo + tier rule · A-class only"
            right={<span className="lens-row-primary">Primary</span>}
          />
          <LensRow
            avatar={<div className="lens-cohort-dot" style={{ background: 'var(--teal-500)' }}></div>}
            name="Hospitality"
            sub="Vertical rule · hotels & banquets"
            right={<span className="lens-row-tiny">Secondary</span>}
          />
          <LensRow
            avatar={<div className="lens-cohort-dot" style={{ background: 'var(--cream-600)' }}></div>}
            name="Reserve allocation"
            sub="Manual · Q3 premium drop list"
            right={<span className="lens-row-tiny">Manual</span>}
          />
          <div className="lens-footer">Price list applied: <b>MH Premium · FY26</b> (highest priority)</div>
        </React.Fragment>
      }
    />
  );
}

/* ════════════════════════════════════════════════
   PAIR 4 — Catalog · who saw it   vs.   Customer · catalogs sent to them
   ════════════════════════════════════════════════ */
function LensCatalogBuyers() {
  return (
    <LensPair
      leftEyebrow="Summer Pours → Buyers"
      leftTitle="12 buyers received this catalog"
      leftBody={
        <React.Fragment>
          {CATALOG_DETAIL.perf.buyers.map((b, i) => (
            <LensRow
              key={i}
              avatar={<BrandAvatarSm initials={b.name.slice(0, 2).toUpperCase()} hue={i % 3 === 0 ? 'teal' : i % 3 === 1 ? 'ember' : 'cream'} size={26} />}
              name={b.name}
              sub={`${b.city.toUpperCase()} · ${b.opened === 'yes' ? 'Opened in app' : 'Not opened'}`}
              right={b.orders > 0
                ? <div style={{ textAlign: 'right' }}><span className="lens-money">{inrShort(b.gmv)}</span><div className="lens-row-tiny">{b.orders} orders</div></div>
                : <span className="lens-row-tiny" style={{ color: 'var(--warning-700)' }}>Did not order</span>}
            />
          ))}
        </React.Fragment>
      }
      joinNote="Same send, both sides"
      rightEyebrow="Singh Hospitality → Activity"
      rightTitle="Catalogs sent to this buyer"
      rightBody={
        <React.Fragment>
          <LensRow
            avatar={<div className="lens-cat-thumb" style={{ background: 'linear-gradient(135deg, #346A5C, #1F3A34)' }}></div>}
            name="Summer Pours"
            sub="Jun 24 · Live · 14 buyers in cohort"
            right={<div style={{ textAlign: 'right' }}><span className="lens-money">{inrShort(184000)}</span><div className="lens-row-tiny">Ordered 3×</div></div>}
          />
          <LensRow
            avatar={<div className="lens-cat-thumb" style={{ background: 'linear-gradient(135deg, #DC9655, #C26E3A)' }}></div>}
            name="Premium Reserve"
            sub="Jun 12 · Live · 18 buyers in cohort"
            right={<div style={{ textAlign: 'right' }}><span className="lens-money">{inrShort(124000)}</span><div className="lens-row-tiny">Ordered 2×</div></div>}
          />
          <LensRow
            avatar={<div className="lens-cat-thumb" style={{ background: 'linear-gradient(135deg, #C9BFAC, #A89E89)' }}></div>}
            name="Vintage Drop"
            sub="May 30 · Ended · 28 buyers in cohort"
            right={<span className="lens-row-tiny" style={{ color: 'var(--warning-700)' }}>Did not order</span>}
          />
          <div className="lens-footer">Open-rate <b>4 of 4 last quarter</b> · order-rate 3 of 4</div>
        </React.Fragment>
      }
    />
  );
}

/* ────────────────────────────────────────────────
   LensExplainer — a callout at the top of the lens
   section. Sets up the why.
   ──────────────────────────────────────────────── */
function LensExplainer() {
  return (
    <div className="lens-explainer">
      <div className="v2-eyebrow" style={{ color: 'var(--ember-700)' }}>The repetition question</div>
      <h2 className="lens-explainer-title">Same join, both sides. Each lens earns its place.</h2>
      <p className="lens-explainer-body">
        A buyer's orders show on the Customer detail page <em>and</em> on the Brand detail page <em>and</em> on the Catalog detail page. That's not duplication — it's the same relational data viewed from the side that matters in context. The pairs below show how each view answers a different question.
      </p>
    </div>
  );
}

Object.assign(window, {
  LensPair, LensRow, LensExplainer,
  LensBrandBuyers, LensBrandProducts, LensCohortMembers, LensCatalogBuyers,
});
