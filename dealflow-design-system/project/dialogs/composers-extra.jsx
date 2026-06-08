// dialogs/composers-extra.jsx
//
// Composer pattern applied to Cohort and Catalog — same chrome as the
// Pricelist composer (composers.jsx). The frame stays identical; what
// changes is the data shape:
//
//   · Pricelist · rows = SKUs     · summary = pricing impact
//   · Cohort    · rows = buyers   · summary = group profile
//   · Catalog   · rows = products · summary = what the cohort will see
//
// Reuses ComposerTop and ComposerTitle from composers.jsx (window).
//
// Exports (window):
//   ComposerCohortCreate   ComposerCohortEdit
//   ComposerCatalogCreate  ComposerCatalogEdit

/* ──────────────── shared utilities ──────────────── */
const _inr   = (n) => '₹' + n.toLocaleString('en-IN');
const _inrL  = (n) => n >= 100000 ? '₹' + (n / 100000).toFixed(1) + ' L' : '₹' + n.toLocaleString('en-IN');

/* ──────────────── DATA ──────────────── */

const BUYERS = [
  { id: 'B‑2024‑0114', name: 'Bharat Stores',     geo: 'Karol Bagh, North Delhi',    tier: 'A', lastOrder: '2 days ago',  mtd: 240000, credit: 'Net 21', av: 'BS', hue: 'teal'  },
  { id: 'B‑2024‑0122', name: 'Mehra Stores',      geo: 'Rohini, North Delhi',        tier: 'A', lastOrder: '1 day ago',   mtd: 210000, credit: 'Net 21', av: 'MS', hue: 'ember' },
  { id: 'B‑2024‑0138', name: 'Singh Liquor Mart', geo: 'Pitampura, North Delhi',     tier: 'A', lastOrder: '3 days ago',  mtd: 190000, credit: 'Net 21', av: 'SL', hue: 'cream' },
  { id: 'B‑2024‑0151', name: 'Sehgal & Sons',     geo: 'Greater Kailash, South Delhi', tier: 'A', lastOrder: '1 day ago', mtd: 320000, credit: 'Net 30', av: 'SS', hue: 'teal'  },
  { id: 'B‑2024‑0163', name: 'Gupta Wines',       geo: 'CR Park, South Delhi',       tier: 'A', lastOrder: '5 days ago',  mtd: 110000, credit: 'Net 15', av: 'GW', hue: 'ember' },
  { id: 'B‑2024‑0177', name: 'Khurana Cellars',   geo: 'Rajouri Garden, West Delhi', tier: 'B', lastOrder: '12 days ago', mtd: 60000,  credit: 'Net 15', av: 'KC', hue: 'cream' },
  { id: 'B‑2024‑0189', name: 'Patel Provisions',  geo: 'Janakpuri, West Delhi',      tier: 'B', lastOrder: '8 days ago',  mtd: 80000,  credit: 'Net 15', av: 'PP', hue: 'teal'  },
];

const PRODUCTS = [
  { sku: 'SKU‑2026‑00471', name: 'Vinikus Shiraz Reserve · 750ml',    brand: 'Vinikus Estates',   av: 'VE', hue: 'teal',  base: 1280, stock: 142, state: 'in',  tag: 'NEW' },
  { sku: 'SKU‑2026‑00472', name: 'Vinikus Sauvignon Blanc · 750ml',   brand: 'Vinikus Estates',   av: 'VE', hue: 'teal',  base: 980,  stock: 88,  state: 'in',  tag: null  },
  { sku: 'SKU‑2026‑00473', name: 'Vinikus Cabernet Estate · 750ml',   brand: 'Vinikus Estates',   av: 'VE', hue: 'teal',  base: 1540, stock: 36,  state: 'in',  tag: null  },
  { sku: 'SKU‑2026‑00481', name: 'Casa del Sol Tempranillo · 750ml',  brand: 'Casa del Sol',      av: 'CS', hue: 'ember', base: 1680, stock: 56,  state: 'in',  tag: 'NEW' },
  { sku: 'SKU‑2026‑00482', name: 'Casa del Sol Albariño · 750ml',     brand: 'Casa del Sol',      av: 'CS', hue: 'ember', base: 1380, stock: 12,  state: 'low', tag: null  },
  { sku: 'SKU‑2026‑00483', name: 'Casa del Sol Reserva Roble · 750ml',brand: 'Casa del Sol',      av: 'CS', hue: 'ember', base: 2240, stock: 0,   state: 'out', tag: null  },
  { sku: 'SKU‑2026‑00501', name: 'Konkan Cellars Feni · 750ml',       brand: 'Konkan Cellars',    av: 'KC', hue: 'cream', base: 740,  stock: 64,  state: 'in',  tag: 'NEW' },
];

/* ─────────────────────────────────────────────────────────────
   COHORT
   ───────────────────────────────────────────────────────────── */

/* Filter rail — geography / tier / activity. The "activity" radio
   slot replaces the pricelist's "pricing strategy" — same shape, so
   the rail reads identically across composers. */
function CohortFilterRail({ areas = [], tiers = [], recent = '30' }) {
  const allAreas = [
    { name: 'North Delhi', count: 28 },
    { name: 'South Delhi', count: 19 },
    { name: 'West Delhi', count: 24 },
    { name: 'East Delhi', count: 11 },
    { name: 'NCR · Gurgaon', count: 16 },
    { name: 'NCR · Noida', count: 14 },
  ];
  const allTiers = [
    { name: 'A‑class',  count: 31 },
    { name: 'B‑class',  count: 48 },
    { name: 'C‑class',  count: 22 },
    { name: 'Unsorted', count: 11 },
  ];
  const recencyHint = {
    any:     <><strong>No recency filter.</strong> Every matching buyer is in the cohort, including dormant ones.</>,
    '30':    <><strong>Ordered in the last 30 days.</strong> The cohort recomputes nightly — dormant buyers drop off automatically.</>,
    '90':    <><strong>Ordered in the last 90 days.</strong> A wider net — good for seasonal pricelists that need to reach lapsed buyers.</>,
    dormant: <><strong>Dormant 90+ days.</strong> Win‑back targeting. Pair with a discount pricelist to re‑engage.</>,
  };

  return (
    <div className="filter-rail">
      <div>
        <h4>Geography</h4>
        <div className="filter-group">
          {allAreas.map(a => (
            <label key={a.name} className="filter-check">
              <span><input type="checkbox" defaultChecked={areas.includes(a.name)} /> {a.name}</span>
              <span className="count">{a.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4>Tier</h4>
        <div className="filter-group">
          {allTiers.map(t => (
            <label key={t.name} className="filter-check">
              <span><input type="checkbox" defaultChecked={tiers.includes(t.name)} /> {t.name}</span>
              <span className="count">{t.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4>Last ordered</h4>
        <div className="filter-group">
          {[
            { k: 'any',     label: 'Anytime' },
            { k: '30',      label: 'Within 30 days' },
            { k: '90',      label: 'Within 90 days' },
            { k: 'dormant', label: 'Dormant 90+ days' },
          ].map(opt => (
            <div className="strat-option" key={opt.k}>
              <label className="filter-check">
                <span><input type="radio" name="cohort-recent" defaultChecked={recent === opt.k} /> {opt.label}</span>
              </label>
            </div>
          ))}
          <div className="strat-hint">{recencyHint[recent]}</div>
        </div>
      </div>
    </div>
  );
}

/* Buyer table — same chrome as the pricelist's price table.
   `mode='edit'` shows the "Was" column equivalent here as a status pill
   (Added / Removed / Live) and the ember bar on changed rows. */
function BuyerTable({ mode = 'create', addedIds = [], removedIds = [], searchTerm = '' }) {
  const tierStyle = (t) => t === 'A'
    ? { background: 'var(--ember-50)', color: 'var(--ember-700)', borderColor: 'var(--ember-100)' }
    : { background: 'var(--cream-100)', color: 'var(--cream-800)', borderColor: 'var(--cream-300)' };

  return (
    <div className="comp-table-wrap">
      <div className="comp-table-head">
        <div>
          <div className="title">
            {mode === 'edit'
              ? `${BUYERS.length} buyers · ${addedIds.length} added · ${removedIds.length} removed`
              : `${BUYERS.length} buyers match the rules above`}
          </div>
          <div className="sub">
            {mode === 'edit'
              ? <>Added rows sit at the top. Removed buyers stay visible — struck through — until you save.</>
              : <>Untick to exclude. Switch <strong style={{ color: 'var(--cream-900)' }}>Type</strong> to <em>Manual pick</em> to ignore the rules above.</>}
          </div>
        </div>
        <div className="spacer"></div>

        <div className="comp-table-search">
          <Icon name="search" size={13} color="var(--cream-700)" />
          <input placeholder="Search name, code, area" defaultValue={searchTerm} />
          <kbd>⌘F</kbd>
        </div>
        <button className="btn btn-secondary btn-sm">
          <Icon name="plus" size={13} />
          Add buyer manually
        </button>
      </div>

      <table className="comp-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal-500)' }} />
            </th>
            <th>Buyer</th>
            <th>Geography</th>
            <th style={{ width: 82 }}>Tier</th>
            <th style={{ width: 116 }}>Last order</th>
            <th style={{ width: 104 }} className="num">MTD spend</th>
            <th style={{ width: 84 }}>Credit</th>
            {mode === 'edit' && <th style={{ width: 92 }}>Δ</th>}
          </tr>
        </thead>
        <tbody>
          {BUYERS.map(b => {
            const added = addedIds.includes(b.id);
            const removed = removedIds.includes(b.id);
            const changed = added || removed;
            return (
              <tr key={b.id} className={changed ? 'is-changed' : ''}>
                <td>
                  <input type="checkbox" defaultChecked={!removed} style={{ accentColor: 'var(--teal-500)' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={`b-av b-av--${b.hue}`} style={{ width: 28, height: 28, borderRadius: 6, fontSize: 10 }}>{b.av}</div>
                    <div>
                      <div style={{ fontSize: 13.5, color: removed ? 'var(--cream-700)' : 'var(--cream-900)', fontWeight: 500, textDecoration: removed ? 'line-through' : 'none' }}>{b.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)', marginTop: 1 }}>{b.id}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 12.5, color: 'var(--cream-800)' }}>{b.geo}</td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '2px 9px', borderRadius: 999,
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                    border: '1px solid', ...tierStyle(b.tier),
                  }}>{b.tier}‑class</span>
                </td>
                <td style={{ fontSize: 12.5, color: 'var(--cream-800)' }}>{b.lastOrder}</td>
                <td className="num">{_inrL(b.mtd)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--cream-700)' }}>{b.credit}</td>
                {mode === 'edit' && (
                  <td>
                    {added && <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 999, background: 'var(--success-50)', color: 'var(--success-700)', border: '1px solid #C8DDC9', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}>ADDED</span>}
                    {removed && <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 999, background: 'var(--danger-50)', color: 'var(--danger-700)', border: '1px solid #EAC8C0', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}>REMOVED</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Summary card — Create profile vs Edit diff. */
function CohortSummary({ mode = 'create' }) {
  if (mode === 'edit') {
    return (
      <div className="summary-card">
        <h4>Diff · what will change</h4>
        <div>
          <div className="name">North Delhi · A‑class</div>
          <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 4 }}>
            Referenced by 3 pricelists, 2 catalogs · live
          </div>
        </div>
        <div className="summary-divider"></div>
        <div className="diff-stat">
          <div className="l">Members</div>
          <div className="row">
            <span className="was">12</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">13</span>
            <span className="delta delta--good">+1 net</span>
          </div>
        </div>
        <div className="diff-stat">
          <div className="l">MTD spend</div>
          <div className="row">
            <span className="was">₹19.6 L</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">₹22.7 L</span>
            <span className="delta delta--good">+₹3.1 L</span>
          </div>
        </div>
        <div className="diff-stat">
          <div className="l">Avg AOV</div>
          <div className="row">
            <span className="was">₹38,200</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">₹41,500</span>
            <span className="delta delta--good">+8.6%</span>
          </div>
        </div>
        <div className="summary-divider"></div>
        <div style={{
          background: 'var(--warning-50)', border: '1px solid #F3E2BD', borderRadius: 10,
          padding: '10px 12px', fontSize: 12, color: 'var(--warning-700)', display: 'flex', gap: 8,
        }}>
          <Icon name="alertTriangle" size={14} stroke={1.6} color="var(--warning-500)" />
          <span>
            3 pricelists &amp; 2 catalogs reference this cohort. Their reach updates on save.
            A confirm modal opens before commit.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-card">
      <h4>Cohort profile</h4>
      <div>
        <div className="name">North Delhi · A‑class</div>
        <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 4 }}>
          Rule‑based · auto‑updates as buyers join
        </div>
      </div>
      <div className="summary-divider"></div>
      <div className="summary-stat"><span className="l">Members</span><span className="v">12</span></div>
      <div className="summary-stat"><span className="l">Areas covered</span><span className="v">2</span></div>
      <div className="summary-stat"><span className="l">MTD spend</span><span className="v">₹19.6 L</span></div>
      <div className="summary-stat"><span className="l">Avg AOV</span><span className="v">₹38,200</span></div>
      <div className="summary-stat"><span className="l">Active · 30d</span><span className="v">11 / 12</span></div>
      <div className="summary-divider"></div>
      <div style={{
        background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 10,
        padding: '10px 12px', fontSize: 12, color: 'var(--teal-700)', display: 'flex', gap: 8,
      }}>
        <Icon name="check" size={14} stroke={1.75} color="var(--teal-500)" />
        <span>Ready to save. You can target this cohort from any pricelist or catalog after.</span>
      </div>
    </div>
  );
}

/* Inline basics strip — Cohort flavor (Name · Type · Geography · Tier) */
function CohortBasics({ editing = null }) {
  return (
    <div className="composer-basics">
      <div className="basics-field">
        <div className="label">Name</div>
        <div className="value">North Delhi · A‑class</div>
      </div>
      <div className="basics-field">
        <div className="label">Type</div>
        <div className="value">
          <span className="inline-pill" style={{ background: 'var(--ember-50)', color: 'var(--ember-700)', borderColor: 'var(--ember-100)' }}>
            <Icon name="sliders" size={11} />Rule‑based
          </span>
          <Icon name="chevronDown" size={13} className="chevron" />
        </div>
      </div>
      <div className="basics-field">
        <div className="label">Geography</div>
        <div className="value">
          <span className="inline-pill"><Icon name="layers" size={11} />North Delhi</span>
          <Icon name="chevronDown" size={13} className="chevron" />
        </div>
      </div>
      <div className="basics-field">
        <div className="label">Tier</div>
        <div className="value">
          <span className="inline-pill" style={{ background: 'var(--ember-50)', color: 'var(--ember-700)', borderColor: 'var(--ember-100)' }}>A‑class</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── COHORT · CREATE ──────────────── */
function ComposerCohortCreate() {
  return (
    <div className="ab">
      <div className="composer">
        <ComposerTop
          crumbCurrent="New cohort"
          modeChip={{ tone: 'draft', label: 'Draft' }}
          draftSaved="Draft saved · 4 sec ago by Phani"
        />
        <div>
          <ComposerTitle
            title="Add a cohort"
            subtitle="Group buyers by geography, tier, or activity. Pricelists and catalogs target a cohort — never an individual list of buyers."
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-secondary btn-sm">
                  <Icon name="download" size={13} />
                  Import from CSV
                </button>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="users" size={13} />
                  Copy another cohort
                </button>
              </div>
            }
          />

          <CohortBasics />

          <div className="composer-body">
            <CohortFilterRail areas={['North Delhi']} tiers={['A‑class']} recent="30" />
            <BuyerTable mode="create" />
            <CohortSummary mode="create" />
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot"></span>
            Draft saved · auto‑resumes if you close
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard draft</button>
          <button className="btn btn-secondary">Save &amp; close</button>
          <button className="btn btn-primary">
            <Icon name="check" size={14} stroke={1.75} />
            Save cohort
          </button>
        </div>
      </div>
    </div>);
}

/* ──────────────── COHORT · EDIT ──────────────── */
function ComposerCohortEdit() {
  return (
    <div className="ab">
      <div className="composer">
        <ComposerTop
          crumbCurrent="North Delhi · A‑class"
          modeChip={{ tone: 'live', label: 'Live · 3 pricelists · 2 catalogs' }}
          draftSaved="2 unsaved changes"
        />
        <div>
          <ComposerTitle
            title="Edit cohort"
            subtitle={
              <span>
                You&rsquo;re editing a live cohort.{' '}
                <strong style={{ color: 'var(--cream-900)' }}>3 pricelists</strong> and{' '}
                <strong style={{ color: 'var(--cream-900)' }}>2 catalogs</strong> target it —
                their reach updates on save. Added rows show first; removals stay visible until commit.
              </span>
            }
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="fileText" size={13} />
                  Activity log
                </button>
                <button className="btn btn-secondary btn-sm">
                  <Icon name="archive" size={13} />
                  Archive cohort
                </button>
              </div>
            }
          />

          <CohortBasics />

          <div className="composer-body">
            <CohortFilterRail areas={['North Delhi']} tiers={['A‑class']} recent="30" />
            <BuyerTable
              mode="edit"
              addedIds={['B‑2024‑0122', 'B‑2024‑0138']}
              removedIds={['B‑2024‑0177']}
            />
            <CohortSummary mode="edit" />
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta" style={{ color: 'var(--ember-700)' }}>
            <span className="dot" style={{ background: 'var(--ember-400)' }}></span>
            2 unsaved changes · last edit 14 sec ago by Phani
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Revert changes</button>
          <button className="btn btn-secondary">Save as draft</button>
          <button className="btn btn-primary">
            Save &amp; apply
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>);
}

/* ─────────────────────────────────────────────────────────────
   CATALOG
   ───────────────────────────────────────────────────────────── */

function CatalogFilterRail({ brands = [], cats = [], availability = 'in' }) {
  const allBrands = [
    { name: 'Vinikus Estates', count: 82 },
    { name: 'Casa del Sol', count: 47 },
    { name: 'Marwadi Spice Co.', count: 128 },
    { name: 'Asha Tea Garden', count: 31 },
    { name: 'Konkan Cellars', count: 64 },
  ];
  const allCats = [
    { name: 'Red wine', count: 42 },
    { name: 'White wine', count: 28 },
    { name: 'Sparkling', count: 12 },
    { name: 'Spirits · Local', count: 18 },
  ];
  const availHint = {
    in:  <><strong>Hiding 18 out‑of‑stock SKUs.</strong> Buyers see only what you can ship today.</>,
    low: <><strong>Showing in‑stock + 6 low‑stock SKUs.</strong> Low stock flagged in the buyer app.</>,
    all: <><strong>Including 18 out‑of‑stock SKUs.</strong> Buyers can place back‑orders; you confirm dispatch later.</>,
  };

  return (
    <div className="filter-rail">
      <div>
        <h4>Brands</h4>
        <div className="filter-group">
          {allBrands.map(b => (
            <label key={b.name} className="filter-check">
              <span><input type="checkbox" defaultChecked={brands.includes(b.name)} /> {b.name}</span>
              <span className="count">{b.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4>Category</h4>
        <div className="filter-group">
          {allCats.map(c => (
            <label key={c.name} className="filter-check">
              <span><input type="checkbox" defaultChecked={cats.includes(c.name)} /> {c.name}</span>
              <span className="count">{c.count}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4>Availability</h4>
        <div className="filter-group">
          {[
            { k: 'in',  label: 'In stock only' },
            { k: 'low', label: 'Include low stock' },
            { k: 'all', label: 'Show everything · allow back‑order' },
          ].map(opt => (
            <div className="strat-option" key={opt.k}>
              <label className="filter-check">
                <span><input type="radio" name="cat-avail" defaultChecked={availability === opt.k} /> {opt.label}</span>
              </label>
            </div>
          ))}
          <div className="strat-hint">{availHint[availability]}</div>
        </div>
      </div>
    </div>
  );
}

/* Product table — same chrome. Pricing is intentionally absent past
   "Base" — the catalog only controls visibility; the buyer's pricelist
   provides the price they actually see. */
function ProductTable({ mode = 'create', addedSkus = [], removedSkus = [], searchTerm = '' }) {
  const stockPill = (state, n) => {
    const base = {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      border: '1px solid',
    };
    if (state === 'in')  return { ...base, background: 'var(--success-50)', color: 'var(--success-700)', borderColor: '#C8DDC9' };
    if (state === 'low') return { ...base, background: 'var(--warning-50)', color: 'var(--warning-700)', borderColor: '#F3E2BD' };
    return { ...base, background: 'var(--cream-100)', color: 'var(--cream-700)', borderColor: 'var(--cream-300)' };
  };
  const dotColor = (state) => state === 'in' ? 'var(--success-500)' : state === 'low' ? 'var(--warning-500)' : 'var(--cream-500)';

  return (
    <div className="comp-table-wrap">
      <div className="comp-table-head">
        <div>
          <div className="title">
            {mode === 'edit'
              ? `${PRODUCTS.length} products · ${addedSkus.length} added · ${removedSkus.length} removed`
              : `${PRODUCTS.length} products match · 14 hidden by filters`}
          </div>
          <div className="sub">
            {mode === 'edit'
              ? <>Modified rows flagged. Buyers see updates within a minute of save.</>
              : <>Untick to exclude. Prices come from each buyer&rsquo;s pricelist; the catalog controls visibility only.</>}
          </div>
        </div>
        <div className="spacer"></div>

        <div className="comp-table-search">
          <Icon name="search" size={13} color="var(--cream-700)" />
          <input placeholder="Search SKU or product name" defaultValue={searchTerm} />
          <kbd>⌘F</kbd>
        </div>
        <button className="btn btn-secondary btn-sm">
          <Icon name="sparkle" size={13} />
          Mark as new
        </button>
      </div>

      <table className="comp-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal-500)' }} />
            </th>
            <th>Product</th>
            <th style={{ width: 152 }}>Brand</th>
            <th style={{ width: 108 }}>Stock</th>
            <th style={{ width: 88 }} className="num">Base</th>
            <th style={{ width: 72 }}>Tag</th>
            {mode === 'edit' && <th style={{ width: 92 }}>Δ</th>}
          </tr>
        </thead>
        <tbody>
          {PRODUCTS.map(p => {
            const added = addedSkus.includes(p.sku);
            const removed = removedSkus.includes(p.sku);
            const changed = added || removed;
            return (
              <tr key={p.sku} className={changed ? 'is-changed' : ''}>
                <td>
                  <input type="checkbox" defaultChecked={!removed} style={{ accentColor: 'var(--teal-500)' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={`b-av b-av--${p.hue}`} style={{ width: 28, height: 28, borderRadius: 6, fontSize: 10 }}>{p.av}</div>
                    <div>
                      <div style={{ fontSize: 13.5, color: removed ? 'var(--cream-700)' : 'var(--cream-900)', fontWeight: 500, textDecoration: removed ? 'line-through' : 'none' }}>{p.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)', marginTop: 1 }}>{p.sku}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 12.5, color: 'var(--cream-800)' }}>{p.brand}</td>
                <td>
                  <span style={stockPill(p.state, p.stock)}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(p.state) }}></span>
                    {p.state === 'out' ? 'Out' : p.stock}
                  </span>
                </td>
                <td className="num">{_inr(p.base)}</td>
                <td>
                  {p.tag && (
                    <span style={{
                      display: 'inline-block', padding: '1px 7px', borderRadius: 999,
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                      background: 'var(--ember-50)', color: 'var(--ember-700)', border: '1px solid var(--ember-100)',
                    }}>{p.tag}</span>
                  )}
                </td>
                {mode === 'edit' && (
                  <td>
                    {added && <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 999, background: 'var(--success-50)', color: 'var(--success-700)', border: '1px solid #C8DDC9', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}>ADDED</span>}
                    {removed && <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 999, background: 'var(--danger-50)', color: 'var(--danger-700)', border: '1px solid #EAC8C0', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em' }}>REMOVED</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CatalogSummary({ mode = 'create' }) {
  if (mode === 'edit') {
    return (
      <div className="summary-card">
        <h4>Diff · what will change</h4>
        <div>
          <div className="name">Summer &rsquo;26 · New Arrivals</div>
          <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 4 }}>
            Live to 12 buyers · expires 31 Aug
          </div>
        </div>
        <div className="summary-divider"></div>
        <div className="diff-stat">
          <div className="l">Products in catalog</div>
          <div className="row">
            <span className="was">45</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">47</span>
            <span className="delta delta--good">+2 net</span>
          </div>
        </div>
        <div className="diff-stat">
          <div className="l">Marked &ldquo;new&rdquo;</div>
          <div className="row">
            <span className="was">8</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">12</span>
            <span className="delta delta--good">+4</span>
          </div>
        </div>
        <div className="diff-stat">
          <div className="l">Out of stock visible</div>
          <div className="row">
            <span className="was">2</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">0</span>
            <span className="delta delta--good">−2</span>
          </div>
        </div>
        <div className="summary-divider"></div>
        <div style={{
          background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 10,
          padding: '10px 12px', fontSize: 12, color: 'var(--teal-700)', display: 'flex', gap: 8,
        }}>
          <Icon name="info" size={14} stroke={1.6} color="var(--teal-500)" />
          <span>
            Buyers see updates within a minute. Carts in progress keep their current view until checkout.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-card">
      <h4>Catalog summary</h4>
      <div>
        <div className="name">Summer &rsquo;26 · New Arrivals</div>
        <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 4 }}>
          Publishes to <strong style={{ color: 'var(--cream-900)' }}>North Delhi · A‑class</strong> (12 buyers)
        </div>
      </div>
      <div className="summary-divider"></div>
      <div className="summary-stat"><span className="l">Products</span><span className="v">47</span></div>
      <div className="summary-stat"><span className="l">Brands</span><span className="v">4</span></div>
      <div className="summary-stat"><span className="l">In stock</span><span className="v">38</span></div>
      <div className="summary-stat"><span className="l">Marked &ldquo;new&rdquo;</span><span className="v">12</span></div>
      <div className="summary-divider"></div>
      <div className="summary-stat"><span className="l">Valid from</span><span className="v" style={{ fontFamily: 'var(--font-body)' }}>1 Jun</span></div>
      <div className="summary-stat"><span className="l">Valid until</span><span className="v" style={{ fontFamily: 'var(--font-body)' }}>31 Aug</span></div>
      <div className="summary-divider"></div>
      <div style={{
        background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 10,
        padding: '10px 12px', fontSize: 12, color: 'var(--teal-700)', display: 'flex', gap: 8,
      }}>
        <Icon name="check" size={14} stroke={1.75} color="var(--teal-500)" />
        <span>Ready to publish. Buyers see it within a minute.</span>
      </div>
    </div>
  );
}

/* Inline basics strip — Catalog flavor (Name · Cohort · Validity · Theme) */
function CatalogBasics() {
  return (
    <div className="composer-basics">
      <div className="basics-field">
        <div className="label">Name</div>
        <div className="value">Summer &rsquo;26 · New Arrivals</div>
      </div>
      <div className="basics-field">
        <div className="label">Cohort</div>
        <div className="value">
          <span className="inline-pill"><Icon name="users" size={11} />North Delhi · A‑class</span>
          <Icon name="chevronDown" size={13} className="chevron" />
        </div>
      </div>
      <div className="basics-field">
        <div className="label">Validity</div>
        <div className="value">
          <span style={{ fontFamily: 'var(--font-body)' }}>1 Jun → 31 Aug 2026</span>
        </div>
      </div>
      <div className="basics-field">
        <div className="label">Theme</div>
        <div className="value">
          <span className="inline-pill" style={{ background: 'var(--ember-50)', color: 'var(--ember-700)', borderColor: 'var(--ember-100)' }}>Seasonal launch</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── CATALOG · CREATE ──────────────── */
function ComposerCatalogCreate() {
  return (
    <div className="ab">
      <div className="composer">
        <ComposerTop
          crumbCurrent="New catalog"
          modeChip={{ tone: 'draft', label: 'Draft' }}
          draftSaved="Draft saved · 8 sec ago by Phani"
        />
        <div>
          <ComposerTitle
            title="Add a catalog"
            subtitle="Curate which products a cohort sees. Prices come from their pricelist — the catalog only controls visibility, validity, and what&rsquo;s marked new."
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-secondary btn-sm">
                  <Icon name="download" size={13} />
                  Import from CSV
                </button>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="sparkle" size={13} />
                  Copy from another catalog
                </button>
              </div>
            }
          />

          <CatalogBasics />

          <div className="composer-body">
            <CatalogFilterRail
              brands={['Vinikus Estates', 'Casa del Sol', 'Konkan Cellars']}
              cats={['Red wine', 'White wine']}
              availability="in"
            />
            <ProductTable mode="create" />
            <CatalogSummary mode="create" />
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot"></span>
            Draft saved · auto‑resumes if you close
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard draft</button>
          <button className="btn btn-secondary">Save &amp; close</button>
          <button className="btn btn-primary">
            <Icon name="check" size={14} stroke={1.75} />
            Publish catalog
          </button>
        </div>
      </div>
    </div>);
}

/* ──────────────── CATALOG · EDIT ──────────────── */
function ComposerCatalogEdit() {
  return (
    <div className="ab">
      <div className="composer">
        <ComposerTop
          crumbCurrent="Summer &rsquo;26 · New Arrivals"
          modeChip={{ tone: 'live', label: 'Live · 12 buyers' }}
          draftSaved="4 unsaved changes"
        />
        <div>
          <ComposerTitle
            title="Edit catalog"
            subtitle={
              <span>
                This catalog is <strong style={{ color: 'var(--cream-900)' }}>live</strong> to 12 buyers.
                Changes propagate within a minute of save. Carts in progress keep their current view until checkout.
              </span>
            }
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="fileText" size={13} />
                  Activity log
                </button>
                <button className="btn btn-secondary btn-sm">
                  <Icon name="archive" size={13} />
                  Archive catalog
                </button>
              </div>
            }
          />

          <CatalogBasics />

          <div className="composer-body">
            <CatalogFilterRail
              brands={['Vinikus Estates', 'Casa del Sol', 'Konkan Cellars']}
              cats={['Red wine', 'White wine']}
              availability="low"
            />
            <ProductTable
              mode="edit"
              addedSkus={['SKU‑2026‑00501', 'SKU‑2026‑00481']}
              removedSkus={['SKU‑2026‑00483']}
            />
            <CatalogSummary mode="edit" />
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta" style={{ color: 'var(--ember-700)' }}>
            <span className="dot" style={{ background: 'var(--ember-400)' }}></span>
            4 unsaved changes · last edit 8 sec ago by Phani
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Revert changes</button>
          <button className="btn btn-secondary">Save as draft</button>
          <button className="btn btn-primary">
            Save &amp; publish
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>);
}

Object.assign(window, {
  ComposerCohortCreate,
  ComposerCohortEdit,
  ComposerCatalogCreate,
  ComposerCatalogEdit,
});
