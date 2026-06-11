// dialogs/documents.jsx — Estimate / Sales order / Invoice composer
// Same chrome reused across Create, Edit, and View(read-only), and across
// the three document kinds — only the kind chip, doc-# prefix, and a few
// labels change. Mirrors the pricelist / cohort / catalog composer pattern.
//
// Exports (window):
//   DocRationale                    — section explainer card
//   DocComposerEstimateEmpty        — state 1: just opened, no buyer
//   DocComposerEstimateBuyer        — state 2: buyer picked, no lines yet
//   DocComposerEstimateInProgress   — state 3: 4 lines, summary live
//   DocComposerInvoiceEdit          — state 4: edit a sent invoice, diff
//   DocComposerSOStockWarning       — state 5: stock warning
//   DocComposerEstimateCreditWarn   — state 6: credit-limit warning
//   DocComposerInvoiceSent          — state 7: read-only after send

/* ───────────────────────────── DATA ──────────────────────────────── */

const inrNum = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const inr = (n) => '₹' + inrNum(n);
const inrShort = (n) => {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  return '₹' + inrNum(n);
};

const BUYER = {
  id: 'CUS-024',
  initials: 'BS',
  hue: 'teal',
  name: 'Bharat Stores',
  loc: 'Karol Bagh, Delhi',
  gstin: '07AAACB1234F1ZX',
  billAddr: '12 Pusa Road, Karol Bagh, New Delhi 110005',
  posState: 'Delhi (intra-state)',
  terms: 'Net 21',
  credit: { limit: 250000, used: 160000 },
  pricelist: { name: "North Delhi A-class · Summer '26", saving: '−4.8% vs base' },
  agent: { name: 'Phani Raju', avatar: 'PR' },
  tier: 'A-class',
};

/* Product catalog for the search popover and line items */
const DOC_PRODUCTS = [
  { sku: 'SKU-2026-00471', name: 'Vinikus Shiraz Reserve · 750ml',     brand: 'VE', hue: 'teal',  mrp: 1850, list: 1180, stock: 142 },
  { sku: 'SKU-2026-00472', name: 'Vinikus Sauvignon Blanc · 750ml',    brand: 'VE', hue: 'teal',  mrp: 1450, list: 920,  stock: 84 },
  { sku: 'SKU-2026-00481', name: 'Casa del Sol Tempranillo · 750ml',   brand: 'CS', hue: 'ember', mrp: 2400, list: 1620, stock: 38 },
  { sku: 'SKU-2026-00482', name: 'Casa del Sol Albariño · 750ml',      brand: 'CS', hue: 'ember', mrp: 1950, list: 1340, stock: 18 },
  { sku: 'SKU-2026-00611', name: 'Marwadi Cardamom Whole · 100g',      brand: 'MS', hue: 'cream', mrp: 480,  list: 384,  stock: 220 },
  { sku: 'SKU-2026-00702', name: 'Asha Darjeeling First Flush · 250g', brand: 'AT', hue: 'cream', mrp: 720,  list: 540,  stock: 64 },
];

const findP = (sku) => DOC_PRODUCTS.find(p => p.sku === sku);

/* Brand avatar shorthand */
const BAv = ({ hue, label, size = 28 }) => (
  <div className={`b-av b-av--${hue}`} style={{ width: size, height: size, borderRadius: 6, fontSize: size <= 22 ? 9 : 10 }}>
    {label}
  </div>
);

/* Small inline icon glyphs not in shared.jsx — keep the set tiny. */
const DocIcon = ({ name, size = 14, stroke = 1.5, color = 'currentColor', style }) => {
  const paths = {
    send: (
      <>
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </>
    ),
    creditCard: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
    tag: (
      <>
        <path d="M20.59 13.41L13.42 20.58a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
        <path d="M7 7h.01" />
      </>
    ),
    gift: (
      <>
        <polyline points="20 12 20 22 4 22 4 12" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 100-5C13 2 12 7 12 7z" />
      </>
    ),
    mapPin: (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M21 12a9 9 0 11-3.5-7.1L21 3l-1.9 3.4A9 9 0 0121 12z" />
        <path d="M8.5 9c0 4 3 6.5 6.5 6.5l1.5-1.5-2.5-1-1 1c-1.5-.5-2.5-1.5-3-3l1-1-1-2.5L8.5 9z" />
      </>
    ),
    printer: (
      <>
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </>
    ),
    rotateCcw: (
      <>
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
      </>
    ),
    minus: <line x1="5" y1="12" x2="19" y2="12" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

/* ────────────────── KIND CONFIG ─────────────────────────────────── */
/* Same composer, different copy & colors per kind. */
const KIND = {
  estimate: {
    label: 'Estimate',
    chipClass: 'doc-type-chip--estimate',
    crumbList: 'Estimates',
    crumbListPath: 'Sales',
    docPrefix: 'EST',
    titleVerb: 'Add an estimate',
    titleEditVerb: 'Edit estimate',
    titleSentVerb: 'Estimate',
    dateLabel: 'Date issued',
    secondDateLabel: 'Valid until',
    primary: { label: 'Send estimate', icon: 'send' },
    primaryEdit: { label: 'Save & resend', icon: 'send' },
    sentActions: 'estimate',
  },
  so: {
    label: 'Sales order',
    chipClass: 'doc-type-chip--so',
    crumbList: 'Sales orders',
    crumbListPath: 'Sales',
    docPrefix: 'SO',
    titleVerb: 'Add a sales order',
    titleEditVerb: 'Edit sales order',
    titleSentVerb: 'Sales order',
    dateLabel: 'Order date',
    secondDateLabel: 'Expected delivery',
    primary: { label: 'Confirm order', icon: 'check' },
    primaryEdit: { label: 'Save changes', icon: 'check' },
    sentActions: 'so',
  },
  invoice: {
    label: 'Invoice',
    chipClass: 'doc-type-chip--invoice',
    crumbList: 'Invoices',
    crumbListPath: 'Sales',
    docPrefix: 'INV',
    titleVerb: 'Add an invoice',
    titleEditVerb: 'Edit invoice',
    titleSentVerb: 'Invoice',
    dateLabel: 'Invoice date',
    secondDateLabel: 'Due date',
    primary: { label: 'Send invoice', icon: 'send' },
    primaryEdit: { label: 'Save & resend', icon: 'send' },
    sentActions: 'invoice',
  },
};

/* ────────────────── SHARED CHROME ────────────────────────────────── */

function DocTop({ kind, docNumber, statusChip, autoSave, modeChip, crumbCurrentOverride }) {
  const K = KIND[kind];
  const current = crumbCurrentOverride || (docNumber ? docNumber : `New ${K.label.toLowerCase()}`);
  return (
    <div className="composer-top">
      <div className="crumb">
        <a style={{ color: 'var(--cream-700)' }}>{K.crumbListPath}</a>
        <span className="sep">/</span>
        <a style={{ color: 'var(--cream-700)' }}>{K.crumbList}</a>
        <span className="sep">/</span>
        <span className="current">{current}</span>
      </div>
      <span className={`doc-type-chip ${K.chipClass}`}>
        <span className="dot"></span>
        {K.label}
      </span>
      {statusChip}
      {modeChip && <span className={`mode-chip mode-chip--${modeChip.tone}`}>{modeChip.label}</span>}
      <div className="spacer"></div>
      {autoSave && (
        <span className="status-chip">
          <span className="dot" style={autoSave.dot}></span>
          {autoSave.label}
        </span>
      )}
      <button className="btn btn-ghost btn-sm">
        <Icon name="x" size={13} />
        Close
      </button>
    </div>
  );
}

function DocTitleRow({ kind, mode = 'create', subtitle, rightActions }) {
  const K = KIND[kind];
  const title = mode === 'edit' ? K.titleEditVerb : mode === 'sent' ? K.titleSentVerb : K.titleVerb;
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

/* Doc strip — 5 fields: doc #, date, second date (valid/due/delivery), ref PO, place of supply */
function DocStrip({ kind, docNumber, date, secondDate, refPO, posState, editingDocNumber = false }) {
  const K = KIND[kind];
  return (
    <div className="doc-strip">
      <div className="field">
        <div className="label">{K.label} #</div>
        <div className="value">
          {editingDocNumber
            ? <input defaultValue={docNumber} style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }} />
            : <span className="mono">{docNumber}</span>}
        </div>
      </div>
      <div className="field">
        <div className="label">{K.dateLabel}</div>
        <div className="value">
          <span style={{ fontWeight: 400 }}>{date}</span>
          <Icon name="chevronDown" size={12} className="chevron" />
        </div>
      </div>
      <div className="field">
        <div className="label">{K.secondDateLabel}</div>
        <div className="value">
          <span style={{ fontWeight: 400 }}>{secondDate}</span>
          <Icon name="chevronDown" size={12} className="chevron" />
        </div>
      </div>
      <div className="field">
        <div className="label">Buyer PO ref</div>
        <div className="value">
          {refPO
            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{refPO}</span>
            : <span className="placeholder">Optional</span>}
        </div>
      </div>
      <div className="field">
        <div className="label">Place of supply</div>
        <div className="value">
          <span style={{ fontWeight: 400 }}>{posState}</span>
          <Icon name="chevronDown" size={12} className="chevron" />
        </div>
      </div>
    </div>
  );
}

/* ────────────────── BUYER CARD ───────────────────────────────────── */

function BuyerCardEmpty({ focused = true }) {
  return (
    <div className="buyer-card--empty buyer-card">
      <div className="eyebrow">Buyer</div>
      <h4>Who is this for?</h4>
      <div className={`search ${focused ? 'is-focus' : ''}`}>
        <Icon name="search" size={13} color="var(--cream-700)" />
        <input placeholder="Search by name, phone, GST…" autoFocus={focused} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cream-700)', padding: '1px 5px', background: 'var(--cream-100)', borderRadius: 4 }}>⌘K</span>
      </div>
      <div className="hint">
        Picking a buyer applies their pricelist, terms, and place of supply automatically — you can override any of it.
      </div>

      <div className="buyer-suggest">
        {[
          { i: 'BS', hue: 'teal',  name: 'Bharat Stores',   sub: 'Karol Bagh, Delhi · A-class', bal: '₹1.6 L due' },
          { i: 'GW', hue: 'ember', name: 'Gupta Wines',     sub: 'CR Park, Delhi · A-class',    bal: '₹0' },
          { i: 'SP', hue: 'cream', name: 'Sehgal & Sons',   sub: 'Greater Kailash · B-class',   bal: '₹84 K due' },
        ].map((b, idx) => (
          <div key={b.i} className={'row' + (idx === 0 ? ' is-hl' : '')}>
            <BAv hue={b.hue} label={b.i} size={26} />
            <div className="meta">
              <div className="name">{b.name}</div>
              <div className="sub">{b.sub}</div>
            </div>
            <div className="balance">{b.bal}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreditBar({ buyer, addToCart = 0, isOver = false }) {
  const { limit, used } = buyer.credit;
  const pctUsed = (used / limit) * 100;
  const pctPreview = Math.min(((used + addToCart) / limit) * 100, 100) - pctUsed;
  const overBy = used + addToCart - limit;
  const avail = limit - used - addToCart;

  return (
    <div className="credit-bar">
      <div className="row1">
        <span className="l">Credit</span>
        <span className="right">
          <span className="used">{inrShort(used + addToCart)}</span>
          <span className="sep">/</span>
          <span className="limit">{inrShort(limit)}</span>
        </span>
      </div>
      <div className="track">
        <div className="used" style={{ width: pctUsed + '%' }}></div>
        {addToCart > 0 && (
          <div className={isOver ? 'preview--over' : 'preview'} style={{ width: pctPreview + '%' }}></div>
        )}
      </div>
      {addToCart === 0 && (
        <div className="footnote">
          <strong>{inrShort(avail)}</strong> available · Net 21 terms
        </div>
      )}
      {addToCart > 0 && !isOver && (
        <div className="footnote">
          This {KIND.estimate.label.toLowerCase()} adds <strong>{inrShort(addToCart)}</strong>. <strong>{inrShort(avail)}</strong> still available after.
        </div>
      )}
      {isOver && (
        <div className="footnote is-warning">
          This adds <strong>{inrShort(addToCart)}</strong> — <strong>{inrShort(overBy)}</strong> over the credit limit.
        </div>
      )}
    </div>
  );
}

function BuyerCardFilled({ buyer = BUYER, addToCart = 0, isOver = false }) {
  return (
    <div className="buyer-card">
      <div className="head">
        <BAv hue={buyer.hue} label={buyer.initials} size={36} />
        <div className="meta">
          <h3 className="name">{buyer.name}</h3>
          <div className="loc">{buyer.loc}</div>
          <div className="pill-tier">Tier {buyer.tier.replace('-class', '')}</div>
        </div>
        <button className="swap">Swap</button>
      </div>
      <div className="kv">
        <div className="row">
          <span className="l">GSTIN</span>
          <span className="v mono">{buyer.gstin}</span>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="l">Bill to</span>
          <span className="v" style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--cream-800)', lineHeight: 1.4 }}>
            {buyer.billAddr}
          </span>
        </div>
      </div>
      <CreditBar buyer={buyer} addToCart={addToCart} isOver={isOver} />
      <div className="terms">
        <div className="row">
          <span className="l">Sales agent</span>
          <span className="v">
            <BAv hue="ember" label={buyer.agent.avatar} size={20} />
            {buyer.agent.name}
          </span>
        </div>
        <div className="row">
          <span className="l">Payment</span>
          <span className="v">{buyer.terms}<Icon name="chevronDown" size={11} className="chev" /></span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── LINES TABLE ──────────────────────────────────── */

/* A single line object:
   { sku, qty, price, discPct, taxPct, scheme?, stockWarn?, status? }
   status is 'normal' | 'changed' | 'added' | 'removed'  (edit mode)
*/

function calcLine(line) {
  const p = findP(line.sku);
  if (!p) return { gross: 0, net: 0 };
  const base = p.list * line.qty;
  const disc = base * (line.discPct || 0) / 100;
  const net = base - disc;
  return { p, base, disc, net };
}

function LinesAddRow({ open = true, searchTerm = '', highlightSku }) {
  return (
    <div className="doc-add-row" style={{ position: 'relative' }}>
      <span className="row-num" style={{ textAlign: 'center', color: 'var(--cream-600)' }}>
        <Icon name="plus" size={13} stroke={2} />
      </span>
      <div className="search-cell">
        <Icon name="search" size={13} color="var(--ember-700)" />
        <input defaultValue={searchTerm} placeholder="Type product name, SKU, or scan a barcode…" autoFocus />
        <span className="kbd">↵ to add</span>
      </div>
      <div className="hint">Tab through · ⌘↵ saves the line</div>

      {open && (
        <div className="doc-search-pop">
          <div className="eyebrow">Matches · pricelist {BUYER.pricelist.name}</div>
          {DOC_PRODUCTS.filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5).map((p) => (
            <div key={p.sku} className={'item' + (p.sku === highlightSku ? ' is-hl' : '')}>
              <BAv hue={p.hue} label={p.brand} size={22} />
              <div>
                <div className="name">{p.name}</div>
                <div className="sku">{p.sku}</div>
              </div>
              <div className={'stock ' + (p.stock < 20 ? 'is-low' : '')}>{p.stock} in stock</div>
              <div className="price">{inr(p.list)}</div>
              <Icon name="arrowRight" size={12} color="var(--cream-500)" />
            </div>
          ))}
          <div className="foot">
            <span>Press <kbd>↑↓</kbd> to navigate, <kbd>↵</kbd> to add, <kbd>esc</kbd> to close</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cream-700)' }}>{DOC_PRODUCTS.length} products</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LineRow({ line, n, mode = 'create' }) {
  const { p, base, disc, net } = calcLine(line);
  if (!p) return null;
  const cls = [];
  if (line.status === 'changed') cls.push('is-changed');
  if (line.status === 'added')   cls.push('is-added');
  if (line.status === 'removed') cls.push('is-removed');

  return (
    <tr className={cls.join(' ')}>
      <td className="row-num">{n}</td>
      <td>
        <div className="prod">
          <BAv hue={p.hue} label={p.brand} size={30} />
          <div className="meta">
            <div className="name">
              {p.name}
              {line.stockWarn && (
                <span className="stock-warn">
                  <Icon name="alertTriangle" size={10} stroke={2} />
                  Only {line.stockAvail} in stock
                </span>
              )}
            </div>
            <div className="sub">
              <span>{p.sku}</span>
              <span className="sep">·</span>
              <span>{p.brand === 'VE' ? 'Vinikus' : p.brand === 'CS' ? 'Casa del Sol' : p.brand === 'MS' ? 'Marwadi Spice' : p.brand === 'AT' ? 'Asha Tea' : ''}</span>
              <span className="sep">·</span>
              <span>HSN 2204</span>
            </div>
            {line.scheme && (
              <div className="row-meta">
                <span className="scheme-tag">
                  <Icon name="sparkle" size={9} stroke={2} />
                  {line.scheme}
                </span>
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="num">
        <span className="qty-cell">
          <button>−</button>
          <input defaultValue={line.qty} />
          <button>+</button>
        </span>
      </td>
      <td className="num">
        {line.wasPrice && <span className="was">{inr(line.wasPrice)}</span>}
        <span className={'editable' + (line.priceOverride ? ' is-override' : '')}>
          <span className="unit">₹</span>{inrNum(line.price || p.list)}
        </span>
      </td>
      <td className="num">
        <span className="editable">
          <span>{line.discPct || 0}</span><span className="unit">%</span>
        </span>
      </td>
      <td className="num">
        <span className="tax-cell">
          {line.taxPct || 18}<span style={{ color: 'var(--cream-600)' }}>%</span>
        </span>
      </td>
      <td className="num" style={{ fontSize: 13.5, color: 'var(--cream-900)' }}>
        {line.wasNet && <span className="was">{inr(line.wasNet)}</span>}
        {inr(net)}
      </td>
      <td className="row-actions">
        <button title="Remove"><Icon name="trash" size={13} /></button>
      </td>
    </tr>
  );
}

function LinesTable({ lines = [], mode = 'create', showAddRow = true, addRowProps = {}, emptyMsg = null, readOnly = false }) {
  const totalLines = lines.filter(l => l.status !== 'removed').length;
  return (
    <div className="doc-lines">
      <div className="doc-lines-head">
        <div>
          <div className="title">
            {readOnly
              ? `${lines.length} line${lines.length === 1 ? '' : 's'}`
              : mode === 'edit'
                ? `${totalLines} lines · ${lines.filter(l => l.status === 'changed').length} changed · ${lines.filter(l => l.status === 'added').length} added · ${lines.filter(l => l.status === 'removed').length} removed`
                : totalLines === 0 ? 'Add your first product' : `${totalLines} line${totalLines === 1 ? '' : 's'}`}
          </div>
          <div className="sub">
            {readOnly
              ? 'View only — clone or revise to make changes.'
              : 'Pricelist auto-applies. Click any price, qty, or discount to override.'}
          </div>
        </div>
        <div className="spacer"></div>
        {!readOnly && (
          <>
            <button className="btn btn-ghost btn-sm">
              <Icon name="download" size={13} />
              Import CSV
            </button>
            <button className="btn btn-ghost btn-sm">
              <Icon name="sliders" size={13} />
              Bulk adjust
            </button>
          </>
        )}
      </div>

      <table className="lines-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Product</th>
            <th className="num" style={{ width: 96 }}>Qty</th>
            <th className="num" style={{ width: 110 }}>Price</th>
            <th className="num" style={{ width: 78 }}>Disc</th>
            <th className="num" style={{ width: 70 }}>Tax</th>
            <th className="num" style={{ width: 108 }}>Amount</th>
            <th style={{ width: 36 }}></th>
          </tr>
        </thead>
        <tbody>
          {showAddRow && !readOnly && (
            <tr><td colSpan={8} style={{ padding: 0, background: 'transparent' }}>
              <LinesAddRow {...addRowProps} />
            </td></tr>
          )}

          {lines.length === 0 && !showAddRow && (
            <tr><td colSpan={8} style={{ padding: 0 }}>
              <div className="lines-empty">
                <div className="illus"><Icon name="package" size={24} stroke={1.25} /></div>
                <h4>No products yet</h4>
                <p>{emptyMsg || 'Start typing in the search row above to add products.'}</p>
              </div>
            </td></tr>
          )}

          {lines.map((line, i) => (
            <LineRow key={i} line={line} n={i + 1} mode={mode} />
          ))}
        </tbody>
      </table>

      {lines.length > 0 && !readOnly && (
        <div className="doc-lines-foot">
          <span><span className="count">{lines.reduce((s, l) => s + (l.status === 'removed' ? 0 : l.qty), 0)}</span> units across <span className="count">{totalLines}</span> SKU{totalLines === 1 ? '' : 's'}</span>
          <span className="spacer"></span>
          <button>Add notes for buyer</button>
          <button>Add freight / packing</button>
          <button>Add internal note</button>
        </div>
      )}
    </div>
  );
}

/* ────────────────── TOTALS + INSIGHTS ────────────────────────────── */

function TotalsCard({ lines = [], discountFlat = 0, freight = 0, mode = 'create', diff = null, over = false }) {
  let subtotal = 0, taxAmt = 0;
  lines.forEach(l => {
    if (l.status === 'removed') return;
    const { p, net } = calcLine(l);
    if (!p) return;
    subtotal += net;
    taxAmt += net * (l.taxPct || 18) / 100;
  });
  const afterDoc = subtotal - discountFlat;
  const taxOnAfterDoc = afterDoc / subtotal * taxAmt || 0;
  const total = afterDoc + taxOnAfterDoc + freight;
  const rounded = Math.round(total);
  const roundOff = rounded - total;
  const showZero = subtotal === 0;

  if (showZero) {
    return (
      <div className="totals-card">
        <div className="head">Totals</div>
        <div className="row"><span className="l">Subtotal</span><span className="v" style={{ color: 'var(--cream-600)' }}>—</span></div>
        <div className="row"><span className="l">Discount</span><span className="v" style={{ color: 'var(--cream-600)' }}>—</span></div>
        <div className="row"><span className="l">Tax</span><span className="v" style={{ color: 'var(--cream-600)' }}>—</span></div>
        <div className="grand">
          <span className="l">Total</span>
          <span className="v" style={{ color: 'var(--cream-500)' }}>₹0</span>
        </div>
      </div>
    );
  }

  return (
    <div className={'totals-card' + (mode === 'edit' && diff ? ' is-diff' : '')}>
      <div className="head">Totals</div>
      <div className="row">
        <span className="l">Subtotal <span className="meta">({lines.filter(l => l.status !== 'removed').length} lines)</span></span>
        <span className="v">
          {diff && diff.subtotal && <span className="was">{inr(diff.subtotal)}</span>}
          <span className="now">{inr(subtotal)}</span>
        </span>
      </div>
      {discountFlat > 0 && (
        <div className="row is-discount">
          <span className="l">Document discount</span>
          <span className="v">−{inr(discountFlat)}</span>
        </div>
      )}
      <div className="row">
        <span className="l">Tax (GST avg 18%)</span>
        <span className="v">
          {diff && diff.tax && <span className="was">{inr(diff.tax)}</span>}
          <span className="now">{inr(Math.round(taxOnAfterDoc))}</span>
        </span>
      </div>
      {freight > 0 && (
        <div className="row">
          <span className="l">Freight & packing</span>
          <span className="v">{inr(freight)}</span>
        </div>
      )}
      {Math.abs(roundOff) > 0.01 && (
        <div className="row">
          <span className="l">Round off</span>
          <span className="v" style={{ color: 'var(--cream-700)' }}>{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
        </div>
      )}
      <div className="grand">
        <span className="l">Total</span>
        <span className={'v' + (over ? ' over' : '')}>
          {diff && diff.total && <span className="was" style={{ fontSize: 13 }}>{inr(diff.total)}</span>}
          {inr(rounded)}
        </span>
      </div>
    </div>
  );
}

function InsightsCard({ buyer = BUYER, schemeSavings = 0, creditState = 'ok', addToCart = 0 }) {
  return (
    <div className="insights-card">
      <div className="head">Why this price</div>

      <div className="item">
        <div className="title">
          <DocIcon name="tag" size={11} />
          Pricelist applied
        </div>
        <div className="value">
          <span className="chip teal">{buyer.pricelist.name}</span>
          <button className="swap">Swap</button>
        </div>
        <div className="sub">
          Auto-picked from <strong>{buyer.name}</strong>'s cohort. {buyer.pricelist.saving}.
        </div>
      </div>

      {schemeSavings > 0 && (
        <div className="item">
          <div className="title">
            <DocIcon name="gift" size={11} />
            Scheme savings
          </div>
          <div className="value">
            <span className="chip success">−{inr(schemeSavings)} saved</span>
          </div>
          <div className="sub">
            <strong>Buy 12, get 1 free</strong> applied on Vinikus Shiraz. <strong>Slab ≥ ₹20K</strong> unlocked an extra 2%.
          </div>
        </div>
      )}

      <div className="item">
        <div className="title">
          <DocIcon name="creditCard" size={11} />
          Credit status
        </div>
        <div className="value">
          {creditState === 'ok' && <span className="chip success">Healthy</span>}
          {creditState === 'tight' && <span className="chip warning">Tight</span>}
          {creditState === 'over' && <span className="chip danger">Over limit</span>}
        </div>
        <div className="sub">
          {creditState === 'ok' && (
            <>₹{((buyer.credit.limit - buyer.credit.used - addToCart) / 1000).toFixed(0)}K available after this. Average days-to-pay <strong>14 days</strong>, last 6 months.</>
          )}
          {creditState === 'tight' && (
            <>Buyer would be over <strong>80%</strong> utilised after this. They normally pay in <strong>14 days</strong>, so likely fine.</>
          )}
          {creditState === 'over' && (
            <>This {KIND.estimate.label.toLowerCase()} pushes the buyer <strong>over their ₹{(buyer.credit.limit / 1e5).toFixed(1)}L limit</strong>. Approval needed before send.</>
          )}
        </div>
      </div>
    </div>
  );
}

/* Right-rail "totals stack" — composes totals + insights + optional callout */
function TotalsStack({ children }) {
  return <div className="totals-stack">{children}</div>;
}

Object.assign(window, {
  DocIcon, BAv,
  BUYER, DOC_PRODUCTS, KIND, findP, inr, inrShort, inrNum, calcLine,
  DocTop, DocTitleRow, DocStrip,
  BuyerCardEmpty, BuyerCardFilled, CreditBar,
  LinesAddRow, LineRow, LinesTable,
  TotalsCard, InsightsCard, TotalsStack,
});
