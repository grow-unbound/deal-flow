// dialogs/composers.jsx
//
// Composer system — refactored per Phani's feedback:
//   · Drop the 3-step flow. The summary card on the right already shows what a
//     "review" step would. The publish click opens a Tier-1 modal only when
//     there's a risk (live orders, big margin drop).
//   · Drop the inline "step 1" pane. Basics live in a horizontal strip at the
//     top of the body — always editable, never gating.
//   · Single ComposerFrame holds the chrome; Create/Edit are mode flavors.
//
// Exports (window):
//   ComposerPricelistEmpty       — fresh, basics partially filled
//   ComposerPricelistCreate      — mid-build, summary populated
//   ComposerPricelistEdit        — existing live pricelist, diff view
//   ComposerRationaleCard        — small explainer artboard
//   InlineTeamRows               — unchanged, escape-hatch demo

/* ──────────────── DATA: shared rows used in both Create and Edit ────── */
const PRICE_ROWS = [
  { sku: 'SKU‑2026‑00471', name: 'Vinikus Shiraz Reserve · 750ml', mrp: 1850, base: 1280, np: 1180, prevNp: 1240, av: 'VE', hue: 'teal' },
  { sku: 'SKU‑2026‑00472', name: 'Vinikus Sauvignon Blanc · 750ml', mrp: 1450, base: 980,  np: 920,  prevNp: 940,  av: 'VE', hue: 'teal' },
  { sku: 'SKU‑2026‑00473', name: 'Vinikus Cabernet Estate · 750ml', mrp: 2200, base: 1540, np: 1480, prevNp: 1480, av: 'VE', hue: 'teal' },
  { sku: 'SKU‑2026‑00474', name: 'Vinikus Rosé Garden · 750ml',    mrp: 1200, base: 860,  np: 820,  prevNp: 820,  av: 'VE', hue: 'teal' },
  { sku: 'SKU‑2026‑00481', name: 'Casa del Sol Tempranillo · 750ml', mrp: 2400, base: 1680, np: 1620, prevNp: 1620, av: 'CS', hue: 'ember' },
  { sku: 'SKU‑2026‑00482', name: 'Casa del Sol Albariño · 750ml',   mrp: 1950, base: 1380, np: 1340, prevNp: 1380, av: 'CS', hue: 'ember' },
  { sku: 'SKU‑2026‑00483', name: 'Casa del Sol Reserva Roble · 750ml', mrp: 3200, base: 2240, np: 2120, prevNp: 2120, av: 'CS', hue: 'ember' },
];

const inr = (n) => '₹' + n.toLocaleString('en-IN');

/* ──────────────── SHARED CHROME ──────────────── */

function ComposerTop({ crumbCurrent, modeChip, draftSaved }) {
  return (
    <div className="composer-top">
      <div className="crumb">
        <a style={{ color: 'var(--cream-700)' }}>Pricelists</a>
        <span className="sep">/</span>
        <span className="current">{crumbCurrent}</span>
      </div>
      {modeChip && <span className={`mode-chip mode-chip--${modeChip.tone}`}>{modeChip.label}</span>}
      <div className="spacer"></div>
      {draftSaved && (
        <span className="status-chip">
          <span className="dot"></span>
          {draftSaved}
        </span>
      )}
      <button className="btn btn-ghost btn-sm">
        <Icon name="x" size={13} />
        Close
      </button>
    </div>
  );
}

function ComposerTitle({ title, subtitle, rightActions }) {
  return (
    <div className="composer-title-row">
      <div>
        <h1>{title}</h1>
        <div className="sub">{subtitle}</div>
      </div>
      {rightActions}
    </div>
  );
}

function BasicsStrip({ name, cohort, validity, tier, editing }) {
  return (
    <div className="composer-basics">
      <div className={'basics-field' + (editing === 'name' ? ' basics-field--editing' : '')}>
        <div className="label">Name</div>
        <div className="value">
          {name.input
            ? <input defaultValue={name.value} placeholder={name.placeholder} />
            : <span className={name.placeholder ? 'placeholder' : ''}>{name.value || name.placeholder}</span>}
        </div>
      </div>
      <div className="basics-field">
        <div className="label">Cohort</div>
        <div className="value">
          {cohort.value
            ? <span className="inline-pill"><Icon name="users" size={11} />{cohort.value}</span>
            : <span className="placeholder">Pick a cohort</span>}
          <Icon name="chevronDown" size={13} className="chevron" />
        </div>
      </div>
      <div className="basics-field">
        <div className="label">Validity</div>
        <div className="value">
          {validity
            ? <span style={{ fontFamily: 'var(--font-body)' }}>{validity}</span>
            : <span className="placeholder">Set date range</span>}
        </div>
      </div>
      <div className="basics-field">
        <div className="label">Tier</div>
        <div className="value">
          {tier
            ? <span className="inline-pill" style={{ background: 'var(--ember-50)', color: 'var(--ember-700)', borderColor: 'var(--ember-100)' }}>{tier}</span>
            : <span className="placeholder">Optional</span>}
        </div>
      </div>
    </div>
  );
}

/* Left filter rail — same for all stages.
   strategy: 'each' | 'margin' | 'flat'
   marginValue: number   (e.g. 15 means "15% off MRP")
   flatValue:   number   (e.g. 150 means "₹150 off base")
   The chosen strategy's input lights up; the other two are visible but disabled
   so the location of the central value is obvious before the user picks. */
function FilterRail({
  checkedBrands = [],
  checkedCats = [],
  strategy = 'each',
  marginValue = 15,
  flatValue = 150,
  ratePerm = 'enabled', // for the radio name uniqueness
}) {
  const brands = [
    { name: 'Vinikus Estates', count: 82 },
    { name: 'Casa del Sol', count: 47 },
    { name: 'Marwadi Spice Co.', count: 128 },
    { name: 'Asha Tea Garden', count: 31 },
    { name: 'Konkan Cellars', count: 64 },
  ];
  const cats = [
    { name: 'Red wine', count: 42 },
    { name: 'White wine', count: 28 },
    { name: 'Sparkling', count: 12 },
  ];

  const hintFor = {
    each:   <><strong>Edit each price inline.</strong> No global rule; every row is independent.</>,
    margin: <><strong>−{marginValue}% from MRP</strong> applies to every selected product. Click any New price to override that row.</>,
    flat:   <><strong>−₹{flatValue} off base</strong> applies to every selected product. Click any New price to override that row.</>,
  };

  return (
    <div className="filter-rail">
      <div>
        <h4>Brands</h4>
        <div className="filter-group">
          {brands.map(b => (
            <label key={b.name} className="filter-check">
              <span><input type="checkbox" defaultChecked={checkedBrands.includes(b.name)} /> {b.name}</span>
              <span className="count">{b.count}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h4>Category</h4>
        <div className="filter-group">
          {cats.map(c => (
            <label key={c.name} className="filter-check">
              <span><input type="checkbox" defaultChecked={checkedCats.includes(c.name)} /> {c.name}</span>
              <span className="count">{c.count}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h4>Pricing strategy</h4>
        <div className="filter-group">
          <div className="strat-option">
            <label className="filter-check">
              <span><input type="radio" name="strat" defaultChecked={strategy === 'each'} /> Edit each price</span>
            </label>
          </div>

          <div className="strat-option">
            <label className="filter-check">
              <span><input type="radio" name="strat" defaultChecked={strategy === 'margin'} /> % margin from MRP</span>
            </label>
            <div className={'strategy-input ' + (strategy === 'margin' ? 'strategy-input--active' : 'strategy-input--disabled')}>
              <span className="unit">−</span>
              <input defaultValue={marginValue} disabled={strategy !== 'margin'} />
              <span className="unit">%</span>
            </div>
          </div>

          <div className="strat-option">
            <label className="filter-check">
              <span><input type="radio" name="strat" defaultChecked={strategy === 'flat'} /> Flat ₹ off base</span>
            </label>
            <div className={'strategy-input ' + (strategy === 'flat' ? 'strategy-input--active' : 'strategy-input--disabled')}>
              <span className="unit">−₹</span>
              <input defaultValue={flatValue} disabled={strategy !== 'flat'} />
            </div>
          </div>

          <div className="strat-hint">{hintFor[strategy]}</div>
        </div>
      </div>
    </div>
  );
}

/* Price table — variants:
   mode:    'create' | 'edit'
   strategy:'each' | 'margin' | 'flat'
   marginValue / flatValue — used to compute the New price when strategy != 'each'.
   Per-row overrides (overrideSkus) skip the global computation. */
function PriceTable({
  mode = 'create',
  strategy = 'each',
  marginValue = 15,
  flatValue = 150,
  changedSkus = [],
  overrideSkus = [],
  searchTerm = '',
}) {
  const computeNp = (r) => {
    if (overrideSkus.includes(r.sku)) return r.np; // user-set override
    if (strategy === 'margin') return Math.round(r.mrp * (1 - marginValue / 100));
    if (strategy === 'flat')   return r.base - flatValue;
    return r.np;
  };

  return (
    <div className="comp-table-wrap">
      <div className="comp-table-head">
        <div>
          <div className="title">
            {mode === 'edit'
              ? '129 products · 3 modified'
              : strategy === 'each'
                ? '129 products match · 14 hidden by filters'
                : `129 products · global rule applied · ${overrideSkus.length} row override${overrideSkus.length === 1 ? '' : 's'}`}
          </div>
          <div className="sub">
            {mode === 'edit'
              ? <>Inline edits flag the row. <strong style={{ color: 'var(--cream-900)' }}>Show only changed</strong> to focus.</>
              : strategy === 'each'
                ? <>Edit prices inline. Hold ⌘‑drag to apply a value down a column.</>
                : <>Change the global value in the filter rail. Click any row to override that one.</>}
          </div>
        </div>
        <div className="spacer"></div>

        <div className="comp-table-search">
          <Icon name="search" size={13} color="var(--cream-700)" />
          <input placeholder="Search SKU or product name" defaultValue={searchTerm} />
          <kbd>⌘F</kbd>
        </div>

        {mode === 'edit' && (
          <button className="btn btn-ghost btn-sm">
            <Icon name="sliders" size={13} />
            Show only changed
          </button>
        )}
        <button className="btn btn-secondary btn-sm">
          <Icon name="sliders" size={13} />
          Bulk adjust
        </button>
      </div>

      {/* Bulk-applied banner — only when a global strategy is active */}
      {strategy !== 'each' && mode === 'create' && (
        <div className="bulk-banner">
          <Icon name="sliders" size={15} color="var(--ember-500)" />
          <div className="meta">
            <strong>
              {strategy === 'margin'
                ? `Applying −${marginValue}% from MRP`
                : `Applying −₹${flatValue} off base`}
              {' '}to all 129 selected products.
            </strong>
            <div className="sub">
              {overrideSkus.length === 0
                ? <>No row overrides yet. Click any New price to override that row.</>
                : <>{overrideSkus.length} row override{overrideSkus.length === 1 ? '' : 's'} preserved — Reset will discard them.</>}
            </div>
          </div>
          <button className="reset">Reset overrides</button>
        </div>
      )}

      <table className="comp-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal-500)' }} />
            </th>
            <th>Product</th>
            <th style={{ width: 84 }} className="num">MRP</th>
            <th style={{ width: 92 }} className="num">Base</th>
            {mode === 'edit' && <th style={{ width: 92 }} className="num">Was</th>}
            <th style={{ width: 108 }} className="num">New price</th>
            <th style={{ width: 70 }} className="num">Δ</th>
          </tr>
        </thead>
        <tbody>
          {PRICE_ROWS.map((r, i) => {
            const changed = mode === 'edit' && changedSkus.includes(r.sku);
            const overridden = overrideSkus.includes(r.sku);
            const np = computeNp(r);
            const delta = ((np - r.base) / r.base) * 100;
            return (
              <tr key={r.sku} className={changed ? 'is-changed' : ''}>
                <td><input type="checkbox" defaultChecked style={{ accentColor: 'var(--teal-500)' }} /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={`b-av b-av--${r.hue}`} style={{ width: 28, height: 28, borderRadius: 6, fontSize: 10 }}>{r.av}</div>
                    <div>
                      <div style={{ fontSize: 13.5, color: 'var(--cream-900)', fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cream-700)', marginTop: 1 }}>{r.sku}</div>
                    </div>
                  </div>
                </td>
                <td className="num">{inr(r.mrp)}</td>
                <td className="num">{inr(r.base)}</td>
                {mode === 'edit' && (
                  <td className="num" style={{ color: 'var(--cream-700)', textDecoration: changed ? 'line-through' : 'none' }}>
                    {changed ? inr(r.prevNp) : '—'}
                  </td>
                )}
                <td className="num">
                  <span className={'price-edit ' + (changed || overridden || (mode === 'create' && strategy === 'each' && i === 0) ? 'price-edit-focus' : '')}>
                    {inr(np)}
                  </span>
                  {overridden && (
                    <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 999, background: 'var(--ember-50)', color: 'var(--ember-700)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', verticalAlign: 'middle' }}>OVR</span>
                  )}
                </td>
                <td className="num">
                  <span className="delta-down">{delta.toFixed(1)}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Empty table state for the very-first composer view */
function EmptyTable() {
  return (
    <div className="comp-empty">
      <div className="illus">
        <Icon name="layers" size={36} stroke={1.25} color="var(--cream-600)" />
      </div>
      <div>
        <h3>No products selected yet</h3>
        <p>Pick a brand or category on the left and the SKUs that match will appear here. You can also <strong style={{ color: 'var(--cream-900)' }}>import a CSV</strong> or copy another pricelist as a starting point.</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary btn-sm">
          <Icon name="download" size={13} />
          Import CSV
        </button>
        <button className="btn btn-ghost btn-sm">
          <Icon name="sparkle" size={13} />
          Copy another pricelist
        </button>
      </div>
    </div>
  );
}

/* Summary card — variants: 'empty' | 'create' | 'edit' */
function SummaryCard({ mode = 'create' }) {
  if (mode === 'empty') {
    return (
      <div className="summary-card">
        <h4>Pricelist summary</h4>
        <div>
          <div className="name" style={{ color: 'var(--cream-600)' }}>Untitled pricelist</div>
          <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 4 }}>
            Set a cohort and pick filters — the impact appears here in real time.
          </div>
        </div>
        <div className="summary-divider"></div>
        <div className="summary-stat"><span className="l">Products</span><span className="v">0</span></div>
        <div className="summary-stat"><span className="l">Brands</span><span className="v">0</span></div>
        <div className="summary-stat"><span className="l">Avg discount vs base</span><span className="v" style={{ color: 'var(--cream-600)' }}>—</span></div>
        <div className="summary-stat"><span className="l">Avg margin retained</span><span className="v" style={{ color: 'var(--cream-600)' }}>—</span></div>
        <div className="summary-divider"></div>
        <div style={{
          background: 'var(--cream-50)',
          border: '1px dashed var(--cream-400)',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 12,
          color: 'var(--cream-700)',
          lineHeight: 1.5,
        }}>
          Tip · the summary replaces a separate &ldquo;review&rdquo; step. Once it looks right, publish in one click.
        </div>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <div className="summary-card">
        <h4>Diff · what will change</h4>
        <div>
          <div className="name">North Delhi A‑class · Summer ’26</div>
          <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 4 }}>
            Applies to 12 buyers · live
          </div>
        </div>
        <div className="summary-divider"></div>
        <div className="diff-stat">
          <div className="l">Modified rows</div>
          <div className="row">
            <span className="now">3</span>
            <span className="delta delta--neutral">of 129</span>
          </div>
        </div>
        <div className="diff-stat">
          <div className="l">Avg discount vs base</div>
          <div className="row">
            <span className="was">−4.2%</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">−4.8%</span>
            <span className="delta delta--bad">+0.6 pts</span>
          </div>
        </div>
        <div className="diff-stat">
          <div className="l">Avg margin retained</div>
          <div className="row">
            <span className="was">23.9%</span>
            <Icon name="arrowRight" size={12} color="var(--cream-600)" />
            <span className="now">23.4%</span>
            <span className="delta delta--bad">−0.5 pts</span>
          </div>
        </div>
        <div className="summary-divider"></div>
        <div style={{
          background: 'var(--warning-50)',
          border: '1px solid #F3E2BD',
          borderRadius: 10,
          padding: '10px 12px',
          fontSize: 12,
          color: 'var(--warning-700)',
          display: 'flex', gap: 8,
        }}>
          <Icon name="alertTriangle" size={14} stroke={1.6} color="var(--warning-500)" />
          <span>
            Saving will affect 12 live buyers. 4 are mid‑order — they keep their current prices.
            A confirm modal opens on Save.
          </span>
        </div>
      </div>
    );
  }

  // create / mid-build
  return (
    <div className="summary-card">
      <h4>Pricelist summary</h4>
      <div>
        <div className="name">North Delhi A‑class · Summer ’26</div>
        <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 4 }}>
          Applies to 12 buyers in <strong style={{ color: 'var(--cream-900)' }}>North Delhi · A‑class</strong>
        </div>
      </div>
      <div className="summary-divider"></div>
      <div className="summary-stat"><span className="l">Products</span><span className="v">129</span></div>
      <div className="summary-stat"><span className="l">Brands</span><span className="v">2</span></div>
      <div className="summary-stat"><span className="l">Avg discount vs base</span><span className="v">−4.8%</span></div>
      <div className="summary-stat"><span className="l">Avg margin retained</span><span className="v">23.4%</span></div>
      <div className="summary-divider"></div>
      <div className="summary-stat"><span className="l">Valid from</span><span className="v" style={{ fontFamily: 'var(--font-body)' }}>1 Jun</span></div>
      <div className="summary-stat"><span className="l">Valid until</span><span className="v" style={{ fontFamily: 'var(--font-body)' }}>31 Aug</span></div>
      <div className="summary-divider"></div>
      <div style={{
        background: 'var(--teal-50)',
        border: '1px solid var(--teal-100)',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--teal-700)',
        display: 'flex', gap: 8,
      }}>
        <Icon name="check" size={14} stroke={1.75} color="var(--teal-500)" />
        <span>Ready to publish. No live orders blocked.</span>
      </div>
    </div>
  );
}

/* ──────────────── STAGE 1 · CREATE · EMPTY ──────────────── */
function ComposerPricelistEmpty() {
  return (
    <div className="ab">
      <div className="composer">
        <ComposerTop crumbCurrent="New pricelist" modeChip={{ tone: 'draft', label: 'Draft' }} draftSaved="Draft created · 2 sec ago" />
        <div>
          <ComposerTitle
            title="Add a pricelist"
            subtitle="Name it, pick the cohort it applies to, then choose which SKUs and how to price them."
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-secondary btn-sm">
                  <Icon name="download" size={13} />
                  Import from CSV
                </button>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="sparkle" size={13} />
                  Copy from another pricelist
                </button>
              </div>
            }
          />

          <BasicsStrip
            name={{ value: '', placeholder: 'e.g. North Delhi A‑class · Summer ’26', input: true }}
            cohort={{ value: '' }}
            validity={null}
            tier={null}
            editing="name"
          />

          <div className="composer-body">
            <FilterRail strategy="each" />
            <EmptyTable />
            <SummaryCard mode="empty" />
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta">
            <span className="dot"></span>
            Auto‑saves as you type
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Discard</button>
          <button className="btn btn-disabled" disabled>
            Publish pricelist
          </button>
        </div>
      </div>
    </div>);

}

/* ──────────────── STAGE 2 · CREATE · IN PROGRESS ──────────────── */
function ComposerPricelistCreate() {
  return (
    <div className="ab">
      <div className="composer">
        <ComposerTop crumbCurrent="New pricelist" modeChip={{ tone: 'draft', label: 'Draft' }} draftSaved="Draft saved · 6 sec ago by Phani" />
        <div>
          <ComposerTitle
            title="Add a pricelist"
            subtitle="Filter the SKUs, edit prices inline, publish when the summary looks right."
            rightActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-secondary btn-sm">
                  <Icon name="download" size={13} />
                  Import from CSV
                </button>
              </div>
            }
          />

          <BasicsStrip
            name={{ value: 'North Delhi A‑class · Summer ’26' }}
            cohort={{ value: 'North Delhi · A‑class' }}
            validity="1 Jun → 31 Aug 2026"
            tier="A‑class"
          />

          <div className="composer-body">
            <FilterRail
              checkedBrands={['Vinikus Estates', 'Casa del Sol']}
              checkedCats={['Red wine', 'White wine']}
              strategy="margin"
              marginValue={15}
            />
            <PriceTable
              mode="create"
              strategy="margin"
              marginValue={15}
              overrideSkus={['SKU‑2026‑00473']}
              searchTerm=""
            />
            <SummaryCard mode="create" />
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
            Publish pricelist
          </button>
        </div>
      </div>
    </div>);

}

/* ──────────────── STAGE 3 · EDIT · EXISTING LIVE PRICELIST ──────────────── */
function ComposerPricelistEdit() {
  return (
    <div className="ab">
      <div className="composer">
        <ComposerTop
          crumbCurrent="North Delhi A‑class · Summer ’26"
          modeChip={{ tone: 'live', label: 'Live · 12 buyers' }}
          draftSaved="3 unsaved changes"
        />
        <div>
          <ComposerTitle
            title="Edit pricelist"
            subtitle={
              <span>
                You&rsquo;re editing a live pricelist. Changes apply to <strong style={{ color: 'var(--cream-900)' }}>new orders</strong>;
                in‑flight orders keep their current prices. Modified rows are flagged.
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
                  Archive pricelist
                </button>
              </div>
            }
          />

          <BasicsStrip
            name={{ value: 'North Delhi A‑class · Summer ’26' }}
            cohort={{ value: 'North Delhi · A‑class' }}
            validity="1 Jun → 31 Aug 2026"
            tier="A‑class"
          />

          <div className="composer-body">
            <FilterRail checkedBrands={['Vinikus Estates', 'Casa del Sol']} checkedCats={['Red wine', 'White wine']} strategy="each" />
            <PriceTable mode="edit" strategy="each" changedSkus={['SKU‑2026‑00471', 'SKU‑2026‑00472', 'SKU‑2026‑00482']} searchTerm="shiraz" />
            <SummaryCard mode="edit" />
          </div>
        </div>

        <div className="composer-foot">
          <div className="draft-meta" style={{ color: 'var(--ember-700)' }}>
            <span className="dot" style={{ background: 'var(--ember-400)' }}></span>
            3 unsaved changes · last edit 12 sec ago by Phani
          </div>
          <div className="spacer"></div>
          <button className="btn btn-ghost">Revert changes</button>
          <button className="btn btn-secondary">Save as draft</button>
          <button className="btn btn-primary">
            Save &amp; apply to live
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </div>);

}

/* ──────────────── RATIONALE CARD ──────────────── */
function ComposerRationaleCard() {
  return (
    <div className="ab">
      <div className="composer-rationale">
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--cream-700)', marginBottom: 8,
          }}>What changed in the composer</div>
          <h2>One screen, two modes, no review step.</h2>
          <div className="sub" style={{ marginTop: 8 }}>
            Phani&rsquo;s pushback was right: a persistent summary card on the right makes a
            sequential &ldquo;Review&rdquo; step redundant. We also collapsed the &ldquo;Basics&rdquo;
            step into a horizontal strip at the top, and reused the chrome for Edit.
            The composer is now <strong>one screen</strong>, and the only difference between
            <strong> Create</strong> and <strong>Edit</strong> is the mode chip, the diff‑shaped summary,
            and the modified‑row indicators.
          </div>
        </div>

        <div className="cols">
          <div className="card">
            <h4>Dropped</h4>
            <div className="title">The Continue → Review → Publish flow</div>
            <p>The summary card is the review. Publishing risky changes opens a Tier‑1 confirmation modal — that&rsquo;s where the pause belongs, not in a separate page step.</p>
            <ul>
              <li>No stepper. The header is the title; basics live below it.</li>
              <li>One primary action: <em>Publish pricelist</em> (Create) or <em>Save &amp; apply to live</em> (Edit).</li>
              <li>Live‑pricelist edits with risk → modal confirm before commit.</li>
            </ul>
          </div>

          <div className="card">
            <h4>Reused</h4>
            <div className="title">Same composer for Create and Edit</div>
            <p>Universal chrome (same as Detail pages v2): breadcrumb · mode chip · title · basics strip · 3‑column body · foot. What changes is the mode.</p>
            <ul>
              <li><strong>Create</strong>: cream <em>Draft</em> chip · empty summary tip · &ldquo;Publish&rdquo;.</li>
              <li><strong>Edit</strong>: green <em>Live · 12 buyers</em> chip · diff summary · &ldquo;Save &amp; apply&rdquo; · row markers.</li>
              <li>Same pattern works for Catalog (rows = products) and Cohort (rows = buyers).</li>
            </ul>
          </div>
        </div>

        <div style={{
          marginTop: 4,
          padding: '14px 18px',
          background: 'var(--teal-50)',
          border: '1px solid var(--teal-100)',
          borderRadius: 12,
          display: 'flex', gap: 12,
          fontSize: 13, color: 'var(--teal-700)',
          lineHeight: 1.55,
        }}>
          <Icon name="info" size={16} color="var(--teal-500)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ color: 'var(--teal-900)' }}>Naming.</strong>
            {' '}On the existing Detail pages (Detail Pages v2), the entity has tabs for
            <em> Details · Performance · Activity</em>. Clicking <strong>Edit</strong> from the Details
            tab opens this composer with the same identity. Closing the composer returns to the
            tab the user came from — never to the list.
          </div>
        </div>
      </div>
    </div>);

}

/* ───────────────────────────────────────────────────────────
   INLINE TEAM ROWS — escape-hatch pattern.
   Now uses the full Customer Detail v2 chrome (breadcrumb,
   header w/ avatar + status + subtitle, 4-tile KPI strip,
   varied tabs) and a standard searchable/filterable/sortable
   table inside the Team tab. The Add Team Member action lives
   at the tab-toolbar level; inline-add row keeps Save / Cancel
   together at the right.
   ─────────────────────────────────────────────────────────── */
function InlineTeamRows() {
  return (
    <div className="ab">
      <div className="dp-page">
        <div className="dp-inner">

          {/* Breadcrumb */}
          <div className="dp-crumb">
            <span>Customers</span>
            <span className="sep">/</span>
            <span className="current">Bharat Stores</span>
          </div>

          {/* Header */}
          <div className="dp-header">
            <div className="dp-header-left">
              <div className="dp-avatar b-av--teal">BS</div>
              <div className="dp-title-block">
                <div className="dp-title-row">
                  <h1 className="dp-title">Bharat Stores</h1>
                  <span className="dp-status"><span className="dot"></span>Active</span>
                </div>
                <div className="dp-subtitle">
                  <span className="pill-tier">Tier A</span>
                  <span>Karol Bagh, Delhi</span>
                  <span className="sep">·</span>
                  <span>Buyer since Mar 2024 · 2 yrs loyal</span>
                  <span className="sep">·</span>
                  <span>Net 21 terms</span>
                </div>
              </div>
            </div>
            <div className="dp-header-actions">
              <button className="btn btn-ghost btn-sm">
                <Icon name="moreVertical" size={14} />
              </button>
              <button className="btn btn-secondary btn-sm">
                <Icon name="fileText" size={13} />
                Activity log
              </button>
              <button className="btn btn-primary btn-sm">Edit buyer</button>
            </div>
          </div>

          {/* 4-tile meta strip */}
          <div className="dp-meta">
            <div className="dp-tile">
              <div className="label">Spend · MTD</div>
              <div className="value">₹2.4 L</div>
              <div className="sub"><span className="up">↑ +18%</span> vs last month</div>
            </div>
            <div className="dp-tile">
              <div className="label">Orders · MTD</div>
              <div className="value">7</div>
              <div className="sub">AOV ₹34,200</div>
            </div>
            <div className="dp-tile">
              <div className="label">Last order</div>
              <div className="value" style={{ fontSize: 22 }}>2 days ago</div>
              <div className="sub">Vinikus Shiraz × 24</div>
            </div>
            <div className="dp-tile">
              <div className="label">Credit used</div>
              <div className="value">₹1.6 L</div>
              <div className="sub">of ₹2.5 L · 64%</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="dp-tabs">
            <button className="dp-tab">Details</button>
            <button className="dp-tab">Performance</button>
            <button className="dp-tab">Orders <span className="badge">7</span></button>
            <button className="dp-tab is-active">Team <span className="badge">3</span></button>
            <button className="dp-tab">Activity</button>
          </div>

          {/* Tab body */}
          <div className="dp-body">
            <div className="dp-tab-head">
              <div>
                <h2>Team at Bharat Stores</h2>
                <div className="sub">People who can place orders on this buyer&rsquo;s behalf in the buyer app.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost btn-sm">
                  <Icon name="download" size={13} />
                  Export
                </button>
                <button className="btn btn-primary btn-sm">
                  <Icon name="plus" size={13} stroke={2} />
                  Add team member
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div>
              <div className="dp-toolbar">
                <div className="search">
                  <Icon name="search" size={13} color="var(--cream-700)" />
                  <input placeholder="Search name, phone, email" />
                </div>
                <button className="filter-chip filter-chip--on">
                  Role
                  <span className="count">2</span>
                  <Icon name="chevronDown" size={11} />
                </button>
                <button className="filter-chip">
                  Status
                  <Icon name="chevronDown" size={11} />
                </button>
                <div className="spacer"></div>
                <div style={{ fontSize: 12, color: 'var(--cream-700)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Sort
                  <button className="filter-chip">
                    Status &middot; Active first
                    <Icon name="chevronDown" size={11} />
                  </button>
                </div>
              </div>

              <div className="dp-table-wrap">
                <table className="dp-table">
                  <thead>
                    <tr>
                      <th style={{ width: '32%' }}>
                        <span className="sortable">Name <Icon name="chevronDown" size={11} /></span>
                      </th>
                      <th style={{ width: '20%' }}>Phone</th>
                      <th style={{ width: '24%' }}>Email</th>
                      <th style={{ width: '12%' }}>
                        <span className="sortable is-sorted">Role <Icon name="chevronDown" size={11} /></span>
                      </th>
                      <th style={{ width: '12%' }}>
                        <span className="sortable is-sorted">Status <Icon name="chevronDown" size={11} /></span>
                      </th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Inline add row — pinned at top so the user sees what they're entering */}
                    <tr className="add-row">
                      <td>
                        <input placeholder="Full name" defaultValue="Vikram Bharat" autoFocus />
                      </td>
                      <td>
                        <input placeholder="+91 …" defaultValue="+91 98101 22011" style={{ fontFamily: 'var(--font-mono)' }} />
                      </td>
                      <td>
                        <input placeholder="Optional" style={{ fontFamily: 'var(--font-mono)' }} />
                      </td>
                      <td>
                        <select defaultValue="Buyer">
                          <option>Admin</option>
                          <option>Buyer</option>
                          <option>Read‑only</option>
                        </select>
                      </td>
                      <td>
                        <span className="status-pill status-pill--invited"><span className="dot"></span>Invite</span>
                      </td>
                      <td className="add-actions">
                        <span className="row">
                          <button className="btn btn-ghost btn-sm">Cancel</button>
                          <button className="btn btn-primary btn-sm">Save</button>
                        </span>
                      </td>
                    </tr>

                    {/* Existing rows — no secondary text, just columns */}
                    <tr>
                      <td>
                        <div className="person">
                          <div className="b-av b-av--ember" style={{ width: 28, height: 28, borderRadius: 6, fontSize: 10 }}>SB</div>
                          <span className="name">Suresh Bharat</span>
                        </div>
                      </td>
                      <td className="mono">+91 98101 22433</td>
                      <td className="mono">suresh@bharatstores.in</td>
                      <td><span className="role-pill role-pill--admin">Admin</span></td>
                      <td><span className="status-pill status-pill--active"><span className="dot"></span>Active</span></td>
                      <td className="row-actions"><button><Icon name="moreVertical" size={14} /></button></td>
                    </tr>

                    <tr>
                      <td>
                        <div className="person">
                          <div className="b-av b-av--cream" style={{ width: 28, height: 28, borderRadius: 6, fontSize: 10 }}>AB</div>
                          <span className="name">Anita Bharat</span>
                        </div>
                      </td>
                      <td className="mono">+91 98101 22877</td>
                      <td className="mono" style={{ color: 'var(--cream-600)' }}>—</td>
                      <td><span className="role-pill">Buyer</span></td>
                      <td><span className="status-pill status-pill--active"><span className="dot"></span>Active</span></td>
                      <td className="row-actions"><button><Icon name="moreVertical" size={14} /></button></td>
                    </tr>

                    <tr>
                      <td>
                        <div className="person">
                          <div className="b-av b-av--teal" style={{ width: 28, height: 28, borderRadius: 6, fontSize: 10 }}>RB</div>
                          <span className="name">Ravi Bharat</span>
                        </div>
                      </td>
                      <td className="mono">+91 98101 22904</td>
                      <td className="mono">ravi@bharatstores.in</td>
                      <td><span className="role-pill">Buyer</span></td>
                      <td><span className="status-pill status-pill--invited"><span className="dot"></span>Invited</span></td>
                      <td className="row-actions"><button><Icon name="moreVertical" size={14} /></button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Why-inline annotation */}
            <div style={{
              padding: '14px 18px',
              background: 'var(--teal-50)',
              border: '1px solid var(--teal-100)',
              borderRadius: 12,
              display: 'flex', gap: 12,
              fontSize: 13, color: 'var(--teal-700)',
              lineHeight: 1.5,
            }}>
              <Icon name="info" size={16} color="var(--teal-500)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong style={{ color: 'var(--teal-900)' }}>Why inline, not a slide‑over?</strong>
                {' '}A buyer‑side team member is just <em>name · phone · email · role</em>. The user is already
                looking at the roster — opening a panel would obscure that context. Standard table chrome
                (search · role &amp; status filters · sort) keeps the surface predictable, while the
                pinned add‑row makes &ldquo;add one more&rdquo; one click away. Same rule as the seller‑side
                <em> Settings → Team</em> page.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>);

}

Object.assign(window, {
  ComposerPricelistEmpty,
  ComposerPricelistCreate,
  ComposerPricelistEdit,
  ComposerRationaleCard,
  InlineTeamRows,
});
