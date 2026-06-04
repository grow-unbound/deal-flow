// brands/EntityCockpits.jsx
// Portfolio Cockpit pattern applied to the other entity landing pages.
// Same chrome as Brands Concept A: PageHeader → InsightStrip → SectionBar
// (search + sort + Report/List toggle) → Leaderboard table + 3 callouts
// (Top performers, Needs attention, Rising).
//
// Each module is a near-mirror of Concept A's body — only the columns,
// KPIs and callout content change. The intent: prove the pattern holds.

/* =============================================================
   Reusable atoms
   ============================================================= */

// Status pill mapped to the verb-pill tones.
function StatusPill({ status }) {
  if (!status) return null;
  return <VerbPill label={status.label} tone={status.tone || 'neutral'} />;
}

// Generic ArtboardShell — same chrome, parameterized per entity.
function EntityShell({ letter, conceptTitle, conceptSub, eyebrow, title, subtitle, horizon, primary, insights, children }) {
  return (
    <div className="brand-art" style={{ background: 'var(--bg-page)' }}>
      <div className="brand-art-label">Standard entity page · {eyebrow}</div>

      <ConceptTag letter={letter} title={conceptTitle} sub={conceptSub} />

      <PageHeaderStd
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        horizon={horizon}
        actions={
          <>
            <button className="cockpit-btn cockpit-btn-secondary">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                <span>Export</span>
              </span>
            </button>
            <button className="cockpit-btn cockpit-btn-primary">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                <span>{primary}</span>
              </span>
            </button>
          </>
        }
      />

      <InsightStrip tiles={insights} />

      {children}
    </div>
  );
}

/* CockpitCallouts — three stacked callout cards.
   Each callout takes { eyebrow, tone, hint, items[] }; renders identical
   layout to Concept A so the visual rhythm is shared across modules. */
function CockpitCallouts({ attention, top, rising, showAlerts = true }) {
  if (!showAlerts) return null;
  return (
    <div className="va-callouts">
      {attention && <Callout {...attention} variant="attention" />}
      {top       && <Callout {...top}       variant="top" />}
      {rising    && <Callout {...rising}    variant="rising" />}
    </div>
  );
}

function Callout({ eyebrow, hint, items, variant }) {
  const isAttention = variant === 'attention';
  return (
    <div className={'va-callout' + (isAttention ? ' is-attention' : '')}>
      <div className="va-callout-head">
        <div className="eyebrow" style={{ color: isAttention ? 'var(--ember-700)' : 'var(--cream-800)' }}>
          {eyebrow}
        </div>
        {hint != null && (
          <span style={isAttention ? {
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ember-600)',
            background: 'var(--ember-50)', padding: '2px 7px', borderRadius: 999, fontWeight: 600,
          } : { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)' }}>{hint}</span>
        )}
      </div>
      <div className="va-callout-list">
        {items.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--cream-700)', padding: '4px 0' }}>
            None right now. Everything within thresholds.
          </div>
        )}
        {items.map((it, i) => (
          <div className="va-callout-item" key={i} style={{ alignItems: 'flex-start' }}>
            <BrandAvatarSm initials={it.initials} hue={it.hue || 'cream'} size={32} />
            <div className="col-meta">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className="name" style={{ flex: '0 1 auto' }}>{it.name}</div>
                {it.trailing}
              </div>
              <div className="reason">{it.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Reusable leaderboard scaffolding so each entity table looks identical
   but holds its own columns. `cols` = array of widths matching headers
   and `renderRow` returns React cells for a row. */
function Leaderboard({ cols, headers, rows, onRow }) {
  const gridTemplate = cols.join(' ');
  return (
    <div className="va-leaderboard">
      <div
        className="va-row va-row-head"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {headers.map((h, i) => (
          <div key={i} className="th" style={h.align ? { textAlign: h.align } : null}>
            {h.label}
          </div>
        ))}
      </div>
      {rows.map((cells, i) => (
        <div
          key={i}
          className="va-row"
          style={{ gridTemplateColumns: gridTemplate }}
          onClick={() => onRow && onRow(i)}
        >
          {cells}
        </div>
      ))}
    </div>
  );
}

/* Small entity name + subline cell — the bread-and-butter first column. */
function EntityCell({ initials, hue, name, sub, avatarSize = 38, avatar = true }) {
  return (
    <>
      {avatar
        ? <BrandAvatarSm initials={initials} hue={hue} size={avatarSize} />
        : <span />}
      <div style={{ minWidth: 0 }}>
        <div className="va-name">{name}</div>
        {sub && <div className="va-name-sub">{sub}</div>}
      </div>
    </>
  );
}

/* Big number cell (right aligned, display font) */
function NumCell({ value }) {
  return <div className="va-gmv">{value}</div>;
}

/* Mono small numeric cell */
function MonoCell({ value, secondary, align = 'right' }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cream-800)',
      textAlign: align, fontVariantNumeric: 'tabular-nums',
    }}>
      {value}
      {secondary != null && <span style={{ color: 'var(--cream-600)' }}> {secondary}</span>}
    </div>
  );
}

const SortTrailing = ({ value }) => (
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{value}</span>
);

/* =============================================================
   PRODUCTS — Catalog cockpit
   ============================================================= */
function ProductsCockpit({ tweaks }) {
  const sorted = [...PRODUCTS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top    = [...PRODUCTS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const rising = [...PRODUCTS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = PRODUCTS_DATA.filter(p =>
    p.status.tone === 'danger' || p.status.tone === 'warning' || p.growth < 0
  );

  const insights = [
    { label: 'Catalog GMV', value: inrShort(PRODUCTS_AGG.gmv), delta: '+8.3%', deltaTone: 'up', hint: 'vs last month', tone: 'accent' },
    { label: 'Active SKUs', value: `${PRODUCTS_AGG.active}`, hint: `${PRODUCTS_AGG.total} carried` },
    { label: 'Need attention', value: `${PRODUCTS_AGG.outOfStock + PRODUCTS_AGG.lowStock}`, hint: `${PRODUCTS_AGG.outOfStock} OOS · ${PRODUCTS_AGG.lowStock} low stock`, tone: 'warn' },
    { label: 'Avg margin', value: '18.4%', hint: 'across the catalog' },
  ];

  return (
    <EntityShell
      letter="A" conceptTitle="Catalog Cockpit"
      conceptSub="Top SKUs · attention SKUs · rising SKUs"
      eyebrow="Products" title="357 SKUs. The ones moving this month."
      subtitle="Cabernet Sauvignon leads. Estate Chardonnay is out of stock; Tara Gin is thinning. Aravalli Mead is breaking out."
      horizon={tweaks.horizon}
      primary="Add a product"
      insights={insights}
    >
      <SectionBar
        title="All products"
        count={`${PRODUCTS_AGG.total} SKUs · this month`}
        view="overview"
        sortBy="GMV (high → low)"
        searchPlaceholder="Search SKU, name, brand…"
      />

      <div className="va-body">
        <Leaderboard
          cols={['48px', '1fr', '110px', '90px', '110px', '90px', '24px']}
          headers={[
            { label: '' },
            { label: 'Product' },
            { label: 'GMV · MTD', align: 'right' },
            { label: 'Growth' },
            { label: 'Inventory' },
            { label: 'Units', align: 'right' },
            { label: '' },
          ]}
          rows={sorted.slice(0, 6).map((p) => [
            <BrandAvatarSm key="av" initials={p.brandInitials} hue={p.brandHue} size={38} />,
            <div key="meta" style={{ minWidth: 0 }}>
              <div className="va-name">{p.name}</div>
              <div className="va-name-sub">{p.sku} · {p.category.toUpperCase()} · {p.brand}</div>
            </div>,
            <NumCell key="gmv" value={inrShort(p.gmv)} />,
            <GrowthPill key="g" value={p.growth} />,
            <div key="inv" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <StatusPill status={p.status} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)' }}>
                {p.onHand} on hand · {p.daysCover}d cover
              </span>
            </div>,
            <MonoCell key="u" value={p.units} />,
            <div key="ch" className="va-chev">›</div>,
          ])}
        />

        <CockpitCallouts
          showAlerts={tweaks.showAlerts}
          attention={{
            eyebrow: 'Needs attention',
            hint: attention.length,
            items: attention.slice(0, 3).map(p => ({
              initials: p.brandInitials, hue: p.brandHue, name: p.name,
              reason: p.status.label + ' · ' + (p.growth < 0 ? `GMV ${p.growth}% MoM` : `${p.onHand} on hand · ${p.daysCover}d cover`),
              trailing: <GrowthPill value={p.growth} />,
            })),
          }}
          top={{
            eyebrow: 'Top performers',
            hint: 'by GMV',
            items: top.map(p => ({
              initials: p.brandInitials, hue: p.brandHue, name: p.name,
              reason: `${p.units.toLocaleString()} units · ${p.brand}`,
              trailing: <SortTrailing value={inrShort(p.gmv)} />,
            })),
          }}
          rising={{
            eyebrow: 'Rising',
            hint: 'fastest growth',
            items: rising.map(p => ({
              initials: p.brandInitials, hue: p.brandHue, name: p.name,
              reason: `${p.brand} · ${inrShort(p.gmv)} MTD`,
              trailing: <GrowthPill value={p.growth} />,
            })),
          }}
        />
      </div>
    </EntityShell>
  );
}

/* =============================================================
   CUSTOMERS — Buyer cockpit
   ============================================================= */
function CustomersCockpit({ tweaks }) {
  const sorted = [...CUSTOMERS_DATA].sort((a, b) => b.spend - a.spend);
  const top    = [...CUSTOMERS_DATA].sort((a, b) => b.spend - a.spend).slice(0, 2);
  const rising = [...CUSTOMERS_DATA].filter(c => c.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = CUSTOMERS_DATA.filter(c =>
    c.status.tone === 'warning' || c.status.tone === 'danger' || c.growth < 0 || c.dues > 80000
  );

  const insights = [
    { label: 'Buyer spend', value: inrShort(CUSTOMERS_AGG.spend), delta: '+8.3%', deltaTone: 'up', hint: 'vs last month', tone: 'accent' },
    { label: 'Active buyers', value: `${CUSTOMERS_AGG.active}`, hint: `of ${CUSTOMERS_AGG.total} on roster` },
    { label: 'Need attention', value: `${CUSTOMERS_AGG.dormant + CUSTOMERS_AGG.atRisk}`, hint: `${CUSTOMERS_AGG.dormant} dormant · ${CUSTOMERS_AGG.atRisk} at risk`, tone: 'warn' },
    { label: 'Dues outstanding', value: inrShort(CUSTOMERS_AGG.duesTotal), hint: 'across 6 buyers' },
  ];

  return (
    <EntityShell
      letter="A" conceptTitle="Buyer Cockpit"
      conceptSub="Top spenders · need a call · rising"
      eyebrow="Customers" title="142 buyers. Who's spending, who's gone quiet."
      subtitle="Singh Hospitality leads spend this month. Capitol Spirits has gone dormant with full credit drawn. Rajan Wine Merchants is up 32%."
      horizon={tweaks.horizon}
      primary="Invite a buyer"
      insights={insights}
    >
      <SectionBar
        title="All buyers"
        count={`${CUSTOMERS_AGG.total} buyers · this month`}
        view="overview"
        sortBy="Spend (high → low)"
        searchPlaceholder="Search buyer, city, cohort…"
      />

      <div className="va-body">
        <Leaderboard
          cols={['48px', '1fr', '110px', '90px', '120px', '90px', '24px']}
          headers={[
            { label: '' },
            { label: 'Buyer' },
            { label: 'Spend · MTD', align: 'right' },
            { label: 'Growth' },
            { label: 'Credit drawn' },
            { label: 'Orders', align: 'right' },
            { label: '' },
          ]}
          rows={sorted.map((c) => {
            const pct = Math.round((c.credit.used / c.credit.limit) * 100);
            const hue = c.hue === 'ember' ? 'ember' : 'teal';
            return [
              <BrandAvatarSm key="av" initials={c.initials} hue={c.hue} size={38} />,
              <div key="meta" style={{ minWidth: 0 }}>
                <div className="va-name">{c.name}</div>
                <div className="va-name-sub">{c.city.toUpperCase()} · TIER {c.tier} · {c.cohort}</div>
              </div>,
              <NumCell key="gmv" value={inrShort(c.spend)} />,
              <GrowthPill key="g" value={c.growth} />,
              <div key="credit" className="va-share">
                <ShareBar pct={pct} hue={pct > 80 ? 'ember' : 'teal'} />
                <div className="va-share-num">{pct}% of {inrShort(c.credit.limit)}</div>
              </div>,
              <MonoCell key="o" value={c.orders} secondary={`· ${c.lastOrder}`} />,
              <div key="ch" className="va-chev">›</div>,
            ];
          })}
        />

        <CockpitCallouts
          showAlerts={tweaks.showAlerts}
          attention={{
            eyebrow: 'Needs a call',
            hint: attention.length,
            items: attention.slice(0, 3).map(c => ({
              initials: c.initials, hue: c.hue, name: c.name,
              reason: c.dues > 0
                ? `Last order ${c.lastOrder} · ${inrShort(c.dues)} dues`
                : `Last order ${c.lastOrder} · spend ${c.growth}% MoM`,
              trailing: <GrowthPill value={c.growth} />,
            })),
          }}
          top={{
            eyebrow: 'Top spenders',
            hint: 'by GMV',
            items: top.map(c => ({
              initials: c.initials, hue: c.hue, name: c.name,
              reason: `${c.orders} orders · ${c.city}`,
              trailing: <SortTrailing value={inrShort(c.spend)} />,
            })),
          }}
          rising={{
            eyebrow: 'Rising',
            hint: 'fastest growth',
            items: rising.map(c => ({
              initials: c.initials, hue: c.hue, name: c.name,
              reason: `${c.city} · ${inrShort(c.spend)} this month`,
              trailing: <GrowthPill value={c.growth} />,
            })),
          }}
        />
      </div>
    </EntityShell>
  );
}

/* =============================================================
   ORDERS — Order cockpit
   ============================================================= */
function OrdersCockpit({ tweaks }) {
  const sorted = [...ORDERS_DATA];
  const top    = [...ORDERS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const attention = ORDERS_DATA.filter(o => o.status.tone === 'warning' || o.status.tone === 'danger');
  const inTransit = ORDERS_DATA.filter(o => o.status.label === 'In transit').slice(0, 2);

  const insights = [
    { label: 'Order GMV · MTD', value: inrShort(ORDERS_AGG.gmv), delta: '+14%', deltaTone: 'up', hint: 'vs last month', tone: 'accent' },
    { label: 'Orders this month', value: `${ORDERS_AGG.total}`, hint: `${ORDERS_AGG.deliveredMTD} delivered` },
    { label: 'Need attention', value: `${ORDERS_AGG.holds + ORDERS_AGG.pendingDispatch}`, hint: `${ORDERS_AGG.holds} hold · ${ORDERS_AGG.pendingDispatch} pending dispatch`, tone: 'warn' },
    { label: 'AOV', value: inrShort(ORDERS_AGG.aov), hint: '+₹3.2K vs last month' },
  ];

  return (
    <EntityShell
      letter="A" conceptTitle="Order Cockpit"
      conceptSub="Recent · need attention · biggest tickets"
      eyebrow="Orders" title="28 orders this month. ₹12.5 L on the books."
      subtitle="Mehta Brothers is the largest order of the week. Kapoor Spirits is on hold awaiting credit approval; Capitol Spirits cancelled."
      horizon={tweaks.horizon}
      primary="New order"
      insights={insights}
    >
      <SectionBar
        title="All orders"
        count={`${ORDERS_AGG.total} orders · this month`}
        view="overview"
        sortBy="Most recent"
        searchPlaceholder="Search order, buyer, status…"
      />

      <div className="va-body">
        <Leaderboard
          cols={['48px', '1fr', '130px', '110px', '60px', '110px', '24px']}
          headers={[
            { label: '' },
            { label: 'Buyer · Order' },
            { label: 'Delivery' },
            { label: 'Status' },
            { label: 'Items', align: 'right' },
            { label: 'GMV', align: 'right' },
            { label: '' },
          ]}
          rows={sorted.map((o) => [
            <BrandAvatarSm key="av" initials={o.buyerInitials} hue={o.buyerHue} size={38} />,
            <div key="meta" style={{ minWidth: 0 }}>
              <div className="va-name">{o.buyer}</div>
              <div className="va-name-sub">{o.id} · PLACED {o.placed.toUpperCase()}</div>
            </div>,
            <div key="del" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--cream-800)' }}>
              {o.delivery}
            </div>,
            <StatusPill key="st" status={o.status} />,
            <MonoCell key="it" value={o.items} />,
            <NumCell key="gmv" value={inrShort(o.gmv)} />,
            <div key="ch" className="va-chev">›</div>,
          ])}
        />

        <CockpitCallouts
          showAlerts={tweaks.showAlerts}
          attention={{
            eyebrow: 'Needs attention',
            hint: attention.length,
            items: attention.map(o => ({
              initials: o.buyerInitials, hue: o.buyerHue, name: o.buyer,
              reason: `${o.id} · ${o.status.label} · ${o.delivery}`,
              trailing: <StatusPill status={o.status} />,
            })),
          }}
          top={{
            eyebrow: 'Biggest tickets',
            hint: 'this month',
            items: top.map(o => ({
              initials: o.buyerInitials, hue: o.buyerHue, name: o.buyer,
              reason: `${o.id} · ${o.items} items · ${o.delivery}`,
              trailing: <SortTrailing value={inrShort(o.gmv)} />,
            })),
          }}
          rising={{
            eyebrow: 'In motion',
            hint: 'dispatching now',
            items: inTransit.map(o => ({
              initials: o.buyerInitials, hue: o.buyerHue, name: o.buyer,
              reason: `${o.id} · ${o.delivery} · ${inrShort(o.gmv)}`,
              trailing: <StatusPill status={o.status} />,
            })),
          }}
        />
      </div>
    </EntityShell>
  );
}

/* =============================================================
   COHORTS — Cohort cockpit
   ============================================================= */
function CohortsCockpit({ tweaks }) {
  const sorted = [...COHORTS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top    = [...COHORTS_DATA].sort((a, b) => b.gmv - a.gmv).slice(0, 2);
  const rising = [...COHORTS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = [...COHORTS_DATA].sort((a, b) => a.conversion - b.conversion).slice(0, 2);

  const insights = [
    { label: 'Cohort GMV', value: inrShort(COHORTS_AGG.gmv), delta: '+11.2%', deltaTone: 'up', hint: 'vs last month', tone: 'accent' },
    { label: 'Cohorts active', value: `${COHORTS_AGG.total}`, hint: `${COHORTS_AGG.members} of ${COHORTS_AGG.totalBuyers} buyers grouped` },
    { label: 'Need attention', value: '1', hint: 'Hospitality conversion below 30%', tone: 'warn' },
    { label: 'Avg conversion', value: `${COHORTS_AGG.conversion}%`, hint: 'cohort → order' },
  ];

  return (
    <EntityShell
      letter="A" conceptTitle="Cohort Cockpit"
      conceptSub="Top GMV · low conversion · rising"
      eyebrow="Cohorts" title="Four cohorts. Where the demand actually clusters."
      subtitle="Maharashtra Premium is the largest. South India Specialty is growing fastest at +18%. Hospitality buys big but converts slowly."
      horizon={tweaks.horizon}
      primary="New cohort"
      insights={insights}
    >
      <SectionBar
        title="All cohorts"
        count={`${COHORTS_AGG.total} cohorts · this month`}
        view="overview"
        sortBy="GMV (high → low)"
        searchPlaceholder="Search cohort or buyer…"
      />

      <div className="va-body">
        <Leaderboard
          cols={['48px', '1fr', '110px', '90px', '140px', '70px', '24px']}
          headers={[
            { label: '' },
            { label: 'Cohort' },
            { label: 'GMV · MTD', align: 'right' },
            { label: 'Growth' },
            { label: 'Conversion' },
            { label: 'Members', align: 'right' },
            { label: '' },
          ]}
          rows={sorted.map((c) => [
            <BrandAvatarSm key="av" initials={c.name.split(' ').slice(0, 2).map(w => w[0]).join('')} hue={c.hue} size={38} />,
            <div key="meta" style={{ minWidth: 0 }}>
              <div className="va-name">{c.name}</div>
              <div className="va-name-sub">{c.primaryBrands.join(' · ')} · {c.catalogs} CATALOGS · AOV {inrShort(c.aov)}</div>
            </div>,
            <NumCell key="gmv" value={inrShort(c.gmv)} />,
            <GrowthPill key="g" value={c.growth} />,
            <div key="conv" className="va-share">
              <ShareBar pct={c.conversion} hue={c.conversion < 30 ? 'ember' : 'teal'} />
              <div className="va-share-num">{c.conversion}% · {c.active} active</div>
            </div>,
            <MonoCell key="m" value={c.members} secondary={`/ ${c.totalBuyers}`} />,
            <div key="ch" className="va-chev">›</div>,
          ])}
        />

        <CockpitCallouts
          showAlerts={tweaks.showAlerts}
          attention={{
            eyebrow: 'Low conversion',
            hint: attention.length,
            items: attention.slice(0, 2).map(c => ({
              initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''), hue: c.hue, name: c.name,
              reason: `${c.conversion}% conversion · ${c.active} of ${c.members} active`,
              trailing: <SortTrailing value={c.conversion + '%'} />,
            })),
          }}
          top={{
            eyebrow: 'Top performers',
            hint: 'by GMV',
            items: top.map(c => ({
              initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''), hue: c.hue, name: c.name,
              reason: `${c.members} buyers · AOV ${inrShort(c.aov)}`,
              trailing: <SortTrailing value={inrShort(c.gmv)} />,
            })),
          }}
          rising={{
            eyebrow: 'Rising',
            hint: 'fastest growth',
            items: rising.map(c => ({
              initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''), hue: c.hue, name: c.name,
              reason: `${c.catalogs} catalogs live · ${c.active} active`,
              trailing: <GrowthPill value={c.growth} />,
            })),
          }}
        />
      </div>
    </EntityShell>
  );
}

/* =============================================================
   CATALOGS — Catalog cockpit
   ============================================================= */
function CatalogsCockpit({ tweaks }) {
  const sorted = [...CATALOGS_DATA].sort((a, b) => b.gmv - a.gmv);
  const top    = sorted.filter(c => c.status.tone === 'success').slice(0, 2);
  const rising = [...CATALOGS_DATA].sort((a, b) => b.growth - a.growth).slice(0, 2);
  const attention = CATALOGS_DATA.filter(c =>
    c.status.label === 'Draft' || c.status.label === 'Ended' || c.growth < 0 || (c.daysLeft != null && c.daysLeft <= 5 && c.daysLeft > 0)
  );

  const insights = [
    { label: 'Catalog GMV', value: inrShort(CATALOGS_AGG.gmv), delta: '+14.2%', deltaTone: 'up', hint: 'vs last month', tone: 'accent' },
    { label: 'Live catalogs', value: `${CATALOGS_AGG.live}`, hint: `${CATALOGS_AGG.draft} draft · ${CATALOGS_AGG.ended} ended` },
    { label: 'Need attention', value: '2', hint: 'Vintage ended · Monsoon draft', tone: 'warn' },
    { label: 'Open → order', value: `${CATALOGS_AGG.conversion}%`, hint: `${CATALOGS_AGG.orders} orders MTD` },
  ];

  return (
    <EntityShell
      letter="A" conceptTitle="Catalog Cockpit"
      conceptSub="Best converting · expiring soon · rising"
      eyebrow="Catalogs" title="Four catalogs in market. ₹12.7 L written off them."
      subtitle="Premium Reserve is the highest-grossing catalog. Summer Pours expires in 4 days and is still climbing. Monsoon Specials hasn't shipped yet."
      horizon={tweaks.horizon}
      primary="Publish catalog"
      insights={insights}
    >
      <SectionBar
        title="All catalogs"
        count={`${CATALOGS_AGG.total} catalogs · this month`}
        view="overview"
        sortBy="GMV (high → low)"
        searchPlaceholder="Search catalog or cohort…"
      />

      <div className="va-body">
        <Leaderboard
          cols={['48px', '1fr', '100px', '110px', '130px', '80px', '24px']}
          headers={[
            { label: '' },
            { label: 'Catalog' },
            { label: 'Status' },
            { label: 'GMV · MTD', align: 'right' },
            { label: 'Conversion' },
            { label: 'Valid', align: 'right' },
            { label: '' },
          ]}
          rows={sorted.map((c) => [
            <BrandAvatarSm key="av" initials={c.name.split(' ').slice(0, 2).map(w => w[0]).join('')} hue={c.hue} size={38} />,
            <div key="meta" style={{ minWidth: 0 }}>
              <div className="va-name">{c.name}</div>
              <div className="va-name-sub">{c.cohort.toUpperCase()} · {c.products} SKUS · {c.brands} BRANDS</div>
            </div>,
            <StatusPill key="st" status={c.status} />,
            <NumCell key="gmv" value={c.gmv > 0 ? inrShort(c.gmv) : '—'} />,
            <div key="conv" className="va-share">
              <ShareBar pct={c.conversion} hue={c.conversion < 30 ? 'ember' : 'teal'} />
              <div className="va-share-num">{c.conversion > 0 ? `${c.conversion}% · ${c.orders} orders` : 'not opened'}</div>
            </div>,
            <MonoCell key="v"
              value={c.status.label === 'Draft' ? '—' : (c.daysLeft > 0 ? `${c.daysLeft}d` : 'ended')}
              secondary={c.status.label === 'Draft' ? '' : `· ${c.validUntil}`} />,
            <div key="ch" className="va-chev">›</div>,
          ])}
        />

        <CockpitCallouts
          showAlerts={tweaks.showAlerts}
          attention={{
            eyebrow: 'Needs attention',
            hint: attention.length,
            items: attention.slice(0, 3).map(c => ({
              initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''), hue: c.hue, name: c.name,
              reason: c.status.label === 'Draft'
                ? 'Draft · not yet shipped to cohort'
                : c.status.label === 'Ended'
                  ? `Ended ${c.validUntil} · ${c.orders} orders`
                  : `Expires in ${c.daysLeft} days · ${c.orders} orders`,
              trailing: <StatusPill status={c.status} />,
            })),
          }}
          top={{
            eyebrow: 'Top performers',
            hint: 'by GMV',
            items: top.map(c => ({
              initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''), hue: c.hue, name: c.name,
              reason: `${c.cohort} · ${c.orders} orders · ${c.conversion}% conv.`,
              trailing: <SortTrailing value={inrShort(c.gmv)} />,
            })),
          }}
          rising={{
            eyebrow: 'Rising',
            hint: 'fastest growth',
            items: rising.filter(c => c.growth > 0).map(c => ({
              initials: c.name.split(' ').slice(0, 2).map(w => w[0]).join(''), hue: c.hue, name: c.name,
              reason: `${c.cohort} · expires in ${c.daysLeft}d`,
              trailing: <GrowthPill value={c.growth} />,
            })),
          }}
        />
      </div>
    </EntityShell>
  );
}

Object.assign(window, {
  ProductsCockpit, CustomersCockpit, OrdersCockpit, CohortsCockpit, CatalogsCockpit,
});
