// v2/DetailsV2.jsx
// v2 entity detail chrome — 1440px wrap, 4-tile meta strip, varied tabs per entity.
//
// Reuses from v1:
//   DetailHeader, DetailTabs, DetailActions (from details/Shared.jsx)
//   BrandPerf, ProductPerf, CustomerPerf, CohortPerf, CatalogPerf (from details/Perf.jsx)
// Plus the BRAND_DETAIL / PRODUCT_DETAIL / etc. records from details/data.jsx.

/* ────────────────────────────────────────────────
   EntityPageV2 — width-capped wrapper
   ──────────────────────────────────────────────── */
function EntityPageV2({ label, header, meta, tabs, active, body, mode }) {
  return (
    <div className="v2-page">
      {label && <div className="v2-page-label">{label}</div>}
      <div className="v2-page-inner" style={{ paddingTop: 28 }}>
        <DetailHeader {...header} actions={<DetailActions mode={mode} />} mode={mode} />
        <MetaStrip4 tiles={meta} />
        <DetailTabs tabs={tabs} active={active} onChange={() => {}} />
        <div className="v2-detail-body">
          {body}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   MetaStrip4 — always 4 tiles, fixed grid
   ──────────────────────────────────────────────── */
function MetaStrip4({ tiles }) {
  return (
    <div className="meta-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {tiles.map((t, i) => (
        <div className="meta-tile" key={i}>
          <div className="eyebrow">{t.label}</div>
          <div className="value">{t.value}</div>
          {t.sub && <div className="sub">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════
   ENTITY CONFIGS — trimmed meta strips, varied tabs
   ════════════════════════════════════════════════ */

/* ── BRAND · 5 tabs, 4 meta tiles ───────────────── */
const BRAND_V2_META = (() => {
  const p = BRAND_DETAIL.perf;
  return [
    { label: 'GMV · this month', value: inrShort(p.gmv), sub: <span><span className="up">↑ +{p.growth}%</span> vs last month</span> },
    { label: 'Active buyers',    value: `${p.activeBuyers}/${p.totalBuyers}`, sub: 'bought this month' },
    { label: 'Low-stock SKUs',   value: p.lowStock, sub: 'reorder this week' },
    { label: 'Catalog freshness', value: `${p.daysSinceCatalog}d ago`, sub: 'last sent Jun 24' },
    // dropped: Share of portfolio (35.5%) → demoted to header subtitle
  ];
})();
const BRAND_V2_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'performance', label: 'Performance' },
  { id: 'buyers', label: 'Buyers', badge: BRAND_DETAIL.perf.activeBuyers },
  { id: 'catalogs', label: 'Catalogs', badge: 12 },
  { id: 'activity', label: 'Activity' },
];
const BRAND_V2_HEADER = {
  crumbPath: [{ label: 'Brands' }, { label: BRAND_DETAIL.name, current: true }],
  avatar: { kind: 'brand', initials: BRAND_DETAIL.initials, hue: BRAND_DETAIL.hue },
  title: BRAND_DETAIL.name,
  status: BRAND_DETAIL.status,
  subtitle: [
    BRAND_DETAIL.category,
    BRAND_DETAIL.region,
    `Carried since ${BRAND_DETAIL.carriedSince}`,
    `${BRAND_DETAIL.perf.skus} SKUs · ${BRAND_DETAIL.perf.share}% of portfolio`,
  ],
};

/* ── PRODUCT · 4 tabs, 4 meta tiles ─────────────── */
const PRODUCT_V2_META = (() => {
  const p = PRODUCT_DETAIL.perf;
  return [
    { label: 'Units · MTD',  value: p.units, sub: <span><span className="up">↑ +{p.growth}%</span> vs last month</span> },
    { label: 'Days of cover', value: `${p.daysOfCover} d`, sub: 'at current pace' },
    { label: 'On hand',       value: p.onHand, sub: 'bottles' },
    { label: 'Sell-through', value: `${p.sellThrough}%`, sub: 'last 30 days' },
    // dropped: Revenue (redundant with units × ASP)
  ];
})();
const PRODUCT_V2_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'performance', label: 'Performance' },
  { id: 'pricing', label: 'Pricing & cohorts' },
  { id: 'activity', label: 'Activity' },
  // dropped: Stock — folded into Performance
];
const PRODUCT_V2_HEADER = {
  crumbPath: [{ label: 'Products' }, { label: PRODUCT_DETAIL.name, current: true }],
  avatar: { kind: 'product' },
  title: PRODUCT_DETAIL.name,
  status: PRODUCT_DETAIL.status,
  subtitle: [PRODUCT_DETAIL.brand, PRODUCT_DETAIL.sku, PRODUCT_DETAIL.pack, `MRP ${inrFmt(PRODUCT_DETAIL.mrp)}`],
};

/* ── CUSTOMER · 4 tabs, 4 meta tiles ────────────── */
const CUSTOMER_V2_META = (() => {
  const p = CUSTOMER_DETAIL.perf;
  return [
    { label: 'Spend · MTD',  value: inrShort(p.spend), sub: <span><span className="up">↑ +{p.growth}%</span> vs last month</span> },
    { label: 'Orders · MTD', value: p.orders, sub: `AOV ${inrShort(p.aov)}` },
    { label: 'Last order',   value: p.lastOrder, sub: 'Cabernet Sauvignon ×24' },
    { label: 'Credit used',  value: inrShort(CUSTOMER_DETAIL.creditUsed), sub: `of ${inrShort(CUSTOMER_DETAIL.creditLimit)} · 64%` },
    // dropped: Buyer since "5 yrs · loyal" — sentiment, not metric. Moved to header subtitle.
  ];
})();
const CUSTOMER_V2_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'performance', label: 'Performance' },
  { id: 'orders', label: 'Orders', badge: CUSTOMER_DETAIL.perf.orders },
  { id: 'activity', label: 'Activity' },
  // dropped: Invoices — folded into Activity log
];
const CUSTOMER_V2_HEADER = {
  crumbPath: [{ label: 'Customers' }, { label: CUSTOMER_DETAIL.name, current: true }],
  avatar: { kind: 'brand', initials: CUSTOMER_DETAIL.initials, hue: CUSTOMER_DETAIL.hue },
  title: CUSTOMER_DETAIL.name,
  status: CUSTOMER_DETAIL.status,
  subtitle: [
    <span><span className="pill" style={{ background: 'var(--ember-50)', color: 'var(--ember-700)', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500 }}>Tier {CUSTOMER_DETAIL.tier}</span></span>,
    CUSTOMER_DETAIL.city,
    `Buyer since ${CUSTOMER_DETAIL.buyerSince} · 5 yrs loyal`,
    'Net 21 terms',
  ],
};

/* ── COHORT · 3 tabs, 4 meta tiles ──────────────── */
const COHORT_V2_META = (() => {
  const p = COHORT_DETAIL.perf;
  return [
    { label: 'GMV · MTD',       value: inrShort(p.gmv), sub: <span><span className="up">↑ +{p.growth}%</span> vs last month</span> },
    { label: 'Active members', value: `${p.activeMembers}/${COHORT_DETAIL.members}`, sub: 'ordered this month' },
    { label: 'AOV',             value: inrShort(p.avgOrderValue), sub: 'across this cohort' },
    { label: 'Conversion',     value: `${p.conversionRate}%`, sub: 'catalog → order' },
    // dropped: Members count — moved to header subtitle
  ];
})();
const COHORT_V2_TABS = [
  { id: 'details', label: 'Details & rules' },
  { id: 'performance', label: 'Performance' },
  { id: 'activity', label: 'Activity' },
  // dropped: Members (merged into Details), Catalogs (merged into Activity)
];
const COHORT_V2_HEADER = {
  crumbPath: [{ label: 'Cohorts' }, { label: COHORT_DETAIL.name, current: true }],
  avatar: { kind: 'brand', initials: 'MP', hue: 'ember' },
  title: COHORT_DETAIL.name,
  status: COHORT_DETAIL.status,
  subtitle: [
    `${COHORT_DETAIL.members} of ${COHORT_DETAIL.totalBuyers} buyers`,
    COHORT_DETAIL.description.slice(0, 56) + '…',
    COHORT_DETAIL.createdBy,
  ],
};

/* ── CATALOG · 3 tabs, 4 meta tiles ─────────────── */
const CATALOG_V2_META = (() => {
  const p = CATALOG_DETAIL.perf;
  return [
    { label: 'GMV',              value: inrShort(p.gmv), sub: <span><span className="up">↑ +{p.growth}%</span> vs previous catalog</span> },
    { label: 'Orders',          value: p.orders, sub: `${p.conversionRate}% conversion` },
    { label: 'Unique viewers',  value: `${p.uniqueViewers}/${CATALOG_DETAIL.cohortMembers}`, sub: 'opened in app' },
    { label: 'Days left',        value: `${CATALOG_DETAIL.daysLeft} d`, sub: `valid until ${CATALOG_DETAIL.validUntil}` },
    // dropped: Products count — moved to header subtitle
  ];
})();
const CATALOG_V2_TABS = [
  { id: 'details', label: 'Composition' },
  { id: 'performance', label: 'Performance' },
  { id: 'buyers', label: 'Buyers', badge: CATALOG_DETAIL.cohortMembers },
  // dropped: Activity — for catalogs the funnel IS the activity
];
const CATALOG_V2_HEADER = {
  crumbPath: [{ label: 'Catalogs' }, { label: CATALOG_DETAIL.name, current: true }],
  avatar: { kind: 'catalog', initials: 'SP' },
  title: CATALOG_DETAIL.name,
  status: CATALOG_DETAIL.status,
  subtitle: [
    `${CATALOG_DETAIL.products} products · ${CATALOG_DETAIL.brandsCovered} brands`,
    `Cohort: ${CATALOG_DETAIL.cohort}`,
    `Valid ${CATALOG_DETAIL.validFrom} → ${CATALOG_DETAIL.validUntil}`,
    `Published by ${CATALOG_DETAIL.publishedBy}`,
  ],
};

Object.assign(window, {
  EntityPageV2, MetaStrip4,
  BRAND_V2_META, BRAND_V2_TABS, BRAND_V2_HEADER,
  PRODUCT_V2_META, PRODUCT_V2_TABS, PRODUCT_V2_HEADER,
  CUSTOMER_V2_META, CUSTOMER_V2_TABS, CUSTOMER_V2_HEADER,
  COHORT_V2_META, COHORT_V2_TABS, COHORT_V2_HEADER,
  CATALOG_V2_META, CATALOG_V2_TABS, CATALOG_V2_HEADER,
});
