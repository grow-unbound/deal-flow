// brands/Shared.jsx — Reusable chrome for entity landing pages.
// PageHeader, InsightStrip, SectionBar (with view switcher), MiniSpark,
// GrowthPill, VerbPill, ShareBar, BrandAvatar (local copy for sizing).

function MiniSpark({ data, width = 110, height = 30, tone = 'auto' }) {
  // tone: 'auto' = green if last > first, red if last < first.
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 4 - ((v - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  let cls = 'spark';
  if (tone === 'auto') {
    if (data[data.length - 1] < data[0]) cls += ' is-down';
    else if (data[data.length - 1] === data[0]) cls += ' is-flat';
  } else if (tone === 'down') cls += ' is-down';
  else if (tone === 'flat') cls += ' is-flat';

  // Fill area below the line for atmosphere.
  const areaPts = pts.concat([`${width},${height}`, `0,${height}`]).join(' ');
  const linePts = pts.join(' ');
  return (
    <svg className={cls} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width, height }}>
      <polygon points={areaPts} fill="currentColor" opacity="0.10" />
      <polyline points={linePts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GrowthPill({ value }) {
  const tone = value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-flat';
  const sign = value > 0 ? '+' : '';
  // Use Unicode arrows (allowed per design system).
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '·';
  return (
    <span className={`growth-pill ${tone}`}>
      <span aria-hidden="true">{arrow}</span>
      <span>{sign}{value.toFixed(1)}%</span>
    </span>
  );
}

function VerbPill({ label, tone = 'neutral' }) {
  return <span className={`verb-pill is-${tone}`}>{label}</span>;
}

function ShareBar({ pct, hue = 'teal' }) {
  return (
    <div className={`share-bar is-${hue}`}>
      <div className="fill" style={{ width: pct + '%' }}></div>
    </div>
  );
}

function BrandAvatarSm({ initials, hue = 'cream', size = 38 }) {
  const map = {
    cream: { bg: '#F4EFE6', fg: '#1F3A34', border: '#EFE9DF' },
    teal:  { bg: '#EAF1EE', fg: '#1F3A34', border: '#C6DAD3' },
    ember: { bg: '#FBEFE3', fg: '#874720', border: '#F5DAB8' },
  };
  const c = map[hue] || map.cream;
  return (
    <div className="brand-avatar" style={{
      width: size, height: size, background: c.bg, color: c.fg, borderColor: c.border,
      fontSize: size * 0.36,
    }}>{initials}</div>
  );
}

/* =========================================================
   PageHeader — shared across every entity landing page
   ========================================================= */
function PageHeaderStd({ eyebrow, title, subtitle, horizon = 'This month', actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      <div className="page-actions">
        <button className="horizon-picker">
          <span className="label">Showing</span>
          <span>{horizon}</span>
          <span style={{ fontSize: 10, color: 'var(--cream-600)' }}>▾</span>
        </button>
        {actions}
      </div>
    </div>
  );
}

/* =========================================================
   InsightStrip — 4 portfolio-level KPI tiles.
   This component shape is reused for Products / Customers / etc.
   ========================================================= */
function InsightStrip({ tiles }) {
  return (
    <div className="insight-strip">
      {tiles.map((t, i) => (
        <div key={i} className={'insight-tile ' + (t.tone === 'accent' ? 'is-accent' : t.tone === 'warn' ? 'is-warn' : '')}>
          <div className="eyebrow">{t.label}</div>
          <div className="value">{t.value}</div>
          <div className="sub">
            {t.delta && (
              <span className={t.deltaTone === 'down' ? 'delta-down' : 'delta-up'}>
                {t.deltaTone === 'down' ? '↓' : '↑'} {t.delta}
              </span>
            )}
            {t.hint && <span>{t.hint}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   SectionBar — title + count, with the Overview/List view switch
   + filters/sort on the right. The view-switch lives here so every
   entity page has the same toggle anatomy.
   ========================================================= */
function SectionBar({
  title, count,
  view = 'overview', onView,
  sortBy = 'GMV (high → low)',
  searchPlaceholder = 'Search…',
}) {
  return (
    <div className="section-bar">
      <div className="section-bar-left">
        <div className="title">
          {title}
          {count != null && <span className="count">{count}</span>}
        </div>
        <div className="section-bar-inline">
          <div className="inline-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/>
              <path d="M21 21l-4-4"/>
            </svg>
            <input type="text" placeholder={searchPlaceholder} />
          </div>
          <button className="sort-btn">
            <span className="label">Sort</span>
            <span>{sortBy}</span>
            <span style={{ fontSize: 10, color: 'var(--cream-600)' }}>▾</span>
          </button>
        </div>
      </div>
      <div className="controls">
        <div className="view-switch">
          <button
            className={view === 'overview' ? 'is-active' : ''}
            onClick={() => onView && onView('overview')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/></svg>
            <span>Report</span>
          </button>
          <button
            className={view === 'list' ? 'is-active' : ''}
            onClick={() => onView && onView('list')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
            <span>List</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ConceptTag — variation label inside artboard
   ========================================================= */
function ConceptTag({ letter, title, sub }) {
  const cls = letter === 'B' ? 'concept-tag is-b' : letter === 'C' ? 'concept-tag is-c' : 'concept-tag';
  return (
    <div className={cls}>
      <i>Concept {letter}</i>
      <span>{title}</span>
      {sub && <span style={{ color: 'var(--cream-700)', letterSpacing: 0, textTransform: 'none', fontWeight: 400, fontSize: 11 }}>· {sub}</span>}
    </div>
  );
}

Object.assign(window, {
  MiniSpark, GrowthPill, VerbPill, ShareBar, BrandAvatarSm,
  PageHeaderStd, InsightStrip, SectionBar, ConceptTag,
});
