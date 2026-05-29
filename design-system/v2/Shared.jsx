// v2/Shared.jsx — v2 unified chrome for entity landing pages.
//
// The pattern, used identically across Brands / Products / Customers / Cohorts
// / Catalogs / Orders:
//
//   <PageHeaderV2>          eyebrow · title · subtitle · period · CTAs
//   <InsightStrip4>         exactly 4 KPI tiles
//   <AttentionRail>         always 3 callouts (mix actionable + informational)
//   <FilterBar>             inline search + filter chips + sort + view toggle
//   {body — table OR tile grid; default per module}

/* ────────────────────────────────────────────────
   Page header
   ──────────────────────────────────────────────── */
function PageHeaderV2({ eyebrow, title, subtitle, horizon, primary, secondary }) {
  return (
    <header className="v2-page-header">
      <div className="v2-page-header-text">
        {eyebrow && <div className="v2-eyebrow">{eyebrow}</div>}
        <h1 className="v2-page-title">{title}</h1>
        {subtitle && <p className="v2-page-subtitle">{subtitle}</p>}
      </div>

      <div className="v2-page-actions">
        {horizon && (
          <button className="v2-horizon">
            <span className="l">Showing</span>
            <span>{horizon}</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
          </button>
        )}
        {secondary && (
          <button className="cockpit-btn cockpit-btn-secondary">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {secondary.icon}<span>{secondary.label}</span>
            </span>
          </button>
        )}
        {primary && (
          <button className="cockpit-btn cockpit-btn-primary">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              <span>{primary}</span>
            </span>
          </button>
        )}
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────
   Insight strip — exactly 4 tiles
   tiles: [{ label, value, sub?, delta?, deltaTone? ('up'|'down'), tone? ('accent'|'warn') }]
   ──────────────────────────────────────────────── */
function InsightStrip4({ tiles }) {
  if (tiles.length !== 4) {
    console.warn('InsightStrip4 expects exactly 4 tiles, got', tiles.length);
  }
  return (
    <div className="v2-strip">
      {tiles.map((t, i) => (
        <div key={i} className={'v2-strip-tile' + (t.tone === 'accent' ? ' is-accent' : t.tone === 'warn' ? ' is-warn' : '')}>
          <div className="v2-eyebrow sm">{t.label}</div>
          <div className="v2-strip-value">{t.value}</div>
          <div className="v2-strip-sub">
            {t.delta && (
              <span className={t.deltaTone === 'down' ? 'down' : 'up'}>
                {t.deltaTone === 'down' ? '↓' : '↑'} {t.delta}
              </span>
            )}
            {t.sub && <span className="hint">{t.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────
   Attention rail — 3 callouts. Each is one of:
     kind: 'risk'        — actionable, danger tone
     kind: 'opportunity' — actionable, ember tone
     kind: 'info'        — informational (e.g. "highest dues"), neutral tone
   Each callout: { kind, title, subject, hint, action }
   ──────────────────────────────────────────────── */
function AttentionRail({ items }) {
  return (
    <section className="v2-attention">
      <div className="v2-attention-head">
        <div className="v2-eyebrow">Today's read</div>
        <div className="v2-attention-hint">3 things worth your time · refreshed 4 min ago</div>
      </div>
      <div className="v2-attention-grid">
        {items.map((it, i) => (
          <article key={i} className={'v2-attention-card is-' + it.kind}>
            <div className="v2-attention-card-tag">
              <span className="dot"></span>
              <span>{it.kind === 'risk' ? 'Needs a call' : it.kind === 'opportunity' ? 'Worth pushing' : 'Worth knowing'}</span>
            </div>
            <div className="v2-attention-card-subject">{it.subject}</div>
            <div className="v2-attention-card-title">{it.title}</div>
            {it.hint && <div className="v2-attention-card-hint">{it.hint}</div>}
            <div className="v2-attention-card-action">{it.action}<span aria-hidden="true">→</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────
   Filter bar — inline search · filter chips · sort · view toggle
   ──────────────────────────────────────────────── */
function FilterBar({ count, countLabel = 'items', searchPlaceholder, chips = [], activeChip, view = 'list', onView, sortBy = 'GMV (high → low)', hideViewToggle }) {
  return (
    <div className="v2-filter-bar">
      <div className="v2-search-inline">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
        </svg>
        <input placeholder={searchPlaceholder || 'Search this page…'} />
      </div>

      {chips.length > 0 && (
        <div className="v2-chips">
          {chips.map((c, i) => (
            <button key={i} className={'v2-chip' + (activeChip === c ? ' is-on' : '')}>{c}</button>
          ))}
        </div>
      )}

      <div className="v2-filter-meta">
        {count != null && <span className="v2-filter-count">{count} {countLabel}</span>}
      </div>

      <div className="v2-filter-right">
        <button className="v2-sort">
          <span className="l">Sort</span>
          <span>{sortBy}</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
        </button>
        {!hideViewToggle && (
          <div className="v2-view-toggle">
            <button className={view === 'list' ? 'is-active' : ''} onClick={() => onView && onView('list')} title="List">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
            </button>
            <button className={view === 'grid' ? 'is-active' : ''} onClick={() => onView && onView('grid')} title="Grid">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
   Status tag — quiet pill used across rows
   ──────────────────────────────────────────────── */
function StatusTagV2({ label, tone = 'neutral' }) {
  return <span className={'v2-status is-' + tone}>{label}</span>;
}

/* ────────────────────────────────────────────────
   Module title — small one above filter bar, naming
   the list. Optional; mostly the page title carries it.
   ──────────────────────────────────────────────── */
function ModuleNote({ children }) {
  return <div className="v2-module-note">{children}</div>;
}

/* ────────────────────────────────────────────────
   Page wrap — width-capped at 1440px, centered.
   This is the v2 width decision.
   ──────────────────────────────────────────────── */
function PageWrap({ children, label }) {
  return (
    <div className="v2-page">
      {label && <div className="v2-page-label">{label}</div>}
      <div className="v2-page-inner">
        {children}
      </div>
    </div>
  );
}

Object.assign(window, {
  PageHeaderV2, InsightStrip4, AttentionRail, FilterBar,
  StatusTagV2, ModuleNote, PageWrap,
});
