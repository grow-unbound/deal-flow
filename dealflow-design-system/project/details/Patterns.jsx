// details/Patterns.jsx — Three layout patterns for switching between
// Details (edit) and Performance modes. All three use the Brand entity
// for consistent comparison; only the navigation between modes changes.

const BRAND_META_TILES = (() => {
  const p = BRAND_DETAIL.perf;
  return [
    { label: 'GMV · this month', value: inrShort(p.gmv), sub: <span><span className="up">↑ +{p.growth}%</span> vs last month</span> },
    { label: 'Share of portfolio', value: `${p.share}%`, sub: 'of ₹47.3 L' },
    { label: 'Active buyers',     value: `${p.activeBuyers}/${p.totalBuyers}`, sub: 'bought this month' },
    { label: 'Low-stock SKUs',    value: `${p.lowStock}`, sub: '4 of 82 SKUs' },
    { label: 'Catalog freshness', value: `${p.daysSinceCatalog}d ago`, sub: 'last sent Jun 24' },
  ];
})();

const BRAND_TABS = [
  { id: 'details',     label: 'Details' },
  { id: 'performance', label: 'Performance' },
  { id: 'buyers',      label: 'Buyers', badge: BRAND_DETAIL.perf.activeBuyers },
  { id: 'catalogs',    label: 'Catalogs', badge: 12 },
  { id: 'activity',    label: 'Activity' },
];

const BRAND_HEADER_PROPS = {
  crumbPath: [
    { label: 'Brands' },
    { label: BRAND_DETAIL.name, current: true },
  ],
  avatar: { kind: 'brand', initials: BRAND_DETAIL.initials, hue: BRAND_DETAIL.hue },
  title: BRAND_DETAIL.name,
  status: BRAND_DETAIL.status,
  subtitle: [
    BRAND_DETAIL.category,
    BRAND_DETAIL.region,
    `Carried since ${BRAND_DETAIL.carriedSince}`,
    `${BRAND_DETAIL.perf.skus} SKUs`,
  ],
};

/* ───────────────────────────────────────────────────────────
   PATTERN A · Tabs at top
   Details and Performance are two tabs among many.
   Pro: lots of room for future sections (Buyers, Catalogs, Activity).
   ─────────────────────────────────────────────────────────── */
function PatternA() {
  const [tab, setTab] = React.useState('performance');

  return (
    <div className="detail-art">
      <div className="detail-art-label">Pattern · Tabs along the top</div>
      <ConceptTag letter="A" title="Tabs along the top" sub="Edit + Analyze sit beside other sections" />

      <DetailHeader
        {...BRAND_HEADER_PROPS}
        actions={<DetailActions mode={tab === 'performance' ? 'perf' : 'edit'} />}
      />

      <MetaStrip tiles={BRAND_META_TILES} />

      <DetailTabs tabs={BRAND_TABS} active={tab} onChange={setTab} />

      {tab === 'details'     && <BrandEdit d={BRAND_DETAIL} />}
      {tab === 'performance' && <BrandPerf d={BRAND_DETAIL} />}
      {tab !== 'details' && tab !== 'performance' && (
        <div className="section-card section-card-body padded" style={{ textAlign: 'center', color: 'var(--cream-700)', padding: 40 }}>
          <em>{tab} section — same chrome, different body.</em>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   PATTERN B · Mode toggle in the header
   A single Edit / Analyze segmented control changes EVERYTHING.
   Pro: extremely clear "which mode am I in". Less room for ancillary
   sub-sections (those become secondary navigation inside each mode).
   ─────────────────────────────────────────────────────────── */
function PatternB() {
  const [mode, setMode] = React.useState('edit');

  return (
    <div className="detail-art">
      <div className="detail-art-label">Pattern · Edit / Analyze toggle</div>
      <ConceptTag letter="B" title="Mode toggle in the header" sub="Edit vs Analyze, full-page" />

      <DetailHeader
        {...BRAND_HEADER_PROPS}
        mode={mode === 'edit' ? 'edit' : 'perf'}
        onMode={(m) => setMode(m === 'perf' ? 'perf' : 'edit')}
        actions={<DetailActions mode={mode} />}
      />

      <MetaStrip tiles={BRAND_META_TILES} />

      {/* In this pattern, sub-navigation lives inside each mode */}
      {mode === 'edit'
        ? <BrandEdit d={BRAND_DETAIL} />
        : <BrandPerf d={BRAND_DETAIL} />
      }
    </div>
  );
}

/* ───────────────────────────────────────────────────────────
   PATTERN C · Sticky meta sidebar + tabbed right pane
   Sidebar carries the editable identity fields always-visible.
   Right pane carries performance & deeper analytical tabs.
   Pro: edit-on-the-side while reviewing performance.
   Con: editable fields cramped; less room for analytical detail.
   ─────────────────────────────────────────────────────────── */
function PatternC() {
  const [tab, setTab] = React.useState('performance');
  const d = BRAND_DETAIL;

  return (
    <div className="detail-art">
      <div className="detail-art-label">Pattern · Two-pane (sidebar + tabs)</div>
      <ConceptTag letter="C" title="Sidebar + right-pane tabs" sub="Identity on the left, analysis on the right" />

      {/* Slim header — meta lives in the sidebar in this pattern */}
      <div className="detail-header" style={{ paddingBottom: 14, marginBottom: 14, borderBottom: 'none' }}>
        <div className="detail-header-meta" style={{ padding: 0 }}>
          <div className="crumb" style={{ marginBottom: 6 }}>
            <a>Brands</a><span className="sep">/</span><span className="current">{d.name}</span>
          </div>
          <div className="detail-header-row1">
            <h1 className="detail-header-title" style={{ fontSize: 28 }}>{d.name}</h1>
            <StatusTag label={d.status.label} tone={d.status.tone} />
          </div>
        </div>
        <div className="detail-header-actions">
          <DetailActions mode="perf" />
        </div>
      </div>

      <div className="twin-pane">
        {/* SIDEBAR — entity identity, always editable */}
        <div className="twin-pane-side">
          <div className="twin-pane-side-head">
            <BrandAvatarSm initials={d.initials} hue={d.hue} size={56} />
            <h2 className="name">{d.name}</h2>
            <div className="meta">{d.category} · {d.region}</div>
          </div>
          <div className="side-fact-list">
            <div className="side-fact"><span className="l">Carried since</span><span className="v text">{d.carriedSince}</span></div>
            <div className="side-fact"><span className="l">Principal</span><span className="v text">{d.principalContact.name}</span></div>
            <div className="side-fact"><span className="l">Phone</span><span className="v">{d.principalContact.phone}</span></div>
            <div className="side-fact"><span className="l">GSTIN</span><span className="v">{d.gstin}</span></div>
            <div className="side-fact"><span className="l">Payment terms</span><span className="v text">{d.paymentTerms}</span></div>
            <div className="side-fact"><span className="l">Margin agreement</span><span className="v text">{d.marginAgreement}</span></div>
            <div className="side-fact"><span className="l">Default cohort</span><span className="v text" style={{ color: 'var(--teal-500)' }}>{d.defaultCohort}</span></div>
            <div className="side-fact"><span className="l">Price list</span><span className="v text" style={{ color: 'var(--teal-500)' }}>{d.masterPriceList}</span></div>
          </div>
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--cream-300)' }}>
            <button className="cockpit-btn cockpit-btn-secondary cockpit-btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
              Edit identity
            </button>
          </div>
        </div>

        {/* RIGHT PANE — perf tabs */}
        <div>
          <MetaStrip tiles={BRAND_META_TILES.slice(0, 4)} />
          <DetailTabs
            tabs={[
              { id: 'performance', label: 'Performance' },
              { id: 'buyers',      label: 'Buyers',      badge: d.perf.activeBuyers },
              { id: 'catalogs',    label: 'Catalogs',    badge: 12 },
              { id: 'activity',    label: 'Activity' },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === 'performance' && <BrandPerf d={d} />}
          {tab !== 'performance' && (
            <div className="section-card section-card-body padded" style={{ textAlign: 'center', color: 'var(--cream-700)', padding: 40 }}>
              <em>{tab} — same chrome, different body.</em>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PatternA, PatternB, PatternC });
