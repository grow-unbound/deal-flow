// details/Shared.jsx — shared chrome for entity detail pages.

function StatusTag({ label, tone = 'neutral' }) {
  return <span className={`status-tag is-${tone}`}>{label}</span>;
}

function ModeBadge({ mode }) {
  // For artboards that only show one mode at a time.
  return (
    <span className={`mode-badge ${mode === 'perf' ? 'is-perf' : 'is-edit'}`}>
      <span style={{
        width: 6, height: 6, borderRadius: 50, background: 'currentColor', display: 'inline-block',
      }}></span>
      {mode === 'perf' ? 'Performance mode' : 'Edit mode'}
    </span>
  );
}

function ConceptTag({ letter, title, sub }) {
  const cls = letter === 'B' ? 'concept-tag is-b' : letter === 'C' ? 'concept-tag is-c' : 'concept-tag';
  return (
    <div className={cls}>
      <i>Pattern {letter}</i>
      <span>{title}</span>
      {sub && <span style={{ color: 'var(--cream-700)', letterSpacing: 0, textTransform: 'none', fontWeight: 400, fontSize: 11 }}>· {sub}</span>}
    </div>
  );
}

function Crumb({ path }) {
  // path: array of { label, current? }
  return (
    <div className="crumb">
      {path.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep">/</span>}
          {p.current
            ? <span className="current">{p.label}</span>
            : <a>{p.label}</a>}
        </React.Fragment>
      ))}
    </div>
  );
}

function DetailHeader({ crumbPath, avatar, title, status, subtitle, actions, mode, onMode }) {
  // avatar: { initials, hue, kind: 'brand' | 'product' | 'catalog' }
  return (
    <React.Fragment>
      {crumbPath && <Crumb path={crumbPath} />}
      <div className="detail-header">
        <div className="detail-header-thumb">
          {avatar.kind === 'catalog' ? (
            <div style={{
              width: 64, height: 64, borderRadius: 14,
              background: 'linear-gradient(135deg, #346A5C 0%, #1F3A34 100%)',
              color: '#fff',
              fontFamily: 'var(--font-display)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              textAlign: 'center',
              lineHeight: 1.1,
            }}>{avatar.initials}</div>
          ) : avatar.kind === 'product' ? (
            <div style={{
              width: 64, height: 64, borderRadius: 14,
              background: 'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: '0 0 6px',
            }}>
              <div style={{
                width: 18, height: 44,
                borderRadius: '20% 20% 8% 8% / 8% 8% 4% 4%',
                background: 'linear-gradient(180deg, #1F3A34, #142823)',
              }}></div>
            </div>
          ) : (
            <BrandAvatarSm initials={avatar.initials} hue={avatar.hue} size={64} />
          )}
        </div>
        <div className="detail-header-meta">
          <div className="detail-header-row1">
            <h1 className="detail-header-title">{title}</h1>
            {status && <StatusTag label={status.label} tone={status.tone} />}
          </div>
          {subtitle && (
            <div className="detail-header-sub">
              {subtitle.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="dot"></span>}
                  <span>{s}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        <div className="detail-header-actions">
          {mode && onMode && (
            <div className="mode-toggle">
              <button className={mode === 'edit' ? 'is-active' : ''} onClick={() => onMode('edit')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
                Details
              </button>
              <button className={mode === 'perf' ? 'is-active' : ''} onClick={() => onMode('perf')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-6"/></svg>
                Performance
              </button>
            </div>
          )}
          {actions}
        </div>
      </div>
    </React.Fragment>
  );
}

/* Meta strip — small KPI strip between header and tabs.
   tiles: [{ label, value, sub, deltaTone? }] */
function MetaStrip({ tiles }) {
  return (
    <div className="meta-strip" style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}>
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

/* Tabs — Pattern A uses these. */
function DetailTabs({ tabs, active, onChange }) {
  return (
    <div className="detail-tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          className={'detail-tab' + (active === t.id ? ' is-active' : '')}
          onClick={() => onChange && onChange(t.id)}
        >
          <span>{t.label}</span>
          {t.badge != null && <span className="badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/* Common action buttons. */
function DetailActions({ primary = 'Save changes', primaryHidden, secondary, mode }) {
  return (
    <React.Fragment>
      {secondary || (
        <React.Fragment>
          <button className="cockpit-btn cockpit-btn-ghost" title="Share">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>
          </button>
          <button className="cockpit-btn cockpit-btn-secondary">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              <span>Export</span>
            </span>
          </button>
        </React.Fragment>
      )}
      {!primaryHidden && (
        <button className="cockpit-btn cockpit-btn-primary">
          {mode === 'perf' ? 'Open buyer app preview' : primary}
        </button>
      )}
    </React.Fragment>
  );
}

/* Trend area chart — reused on every performance panel. */
function TrendChart({ data, height = 160, accent = 'var(--teal-500)', accentSoft = 'rgba(31,58,52,0.10)', labels }) {
  const width = 600;     // viewBox; will scale via preserveAspectRatio
  const padTop = 8;
  const padBottom = 10;
  const padX = 8;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const pts = data.map((v, i) => {
    const x = padX + (i / (data.length - 1)) * innerW;
    const y = padTop + (1 - (v - min) / range) * innerH;
    return [x, y];
  });
  const line = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pts[0][0]},${height - padBottom} ` + line + ` ${pts[pts.length-1][0]},${height - padBottom}`;
  // Last point dot
  const lastX = pts[pts.length-1][0], lastY = pts[pts.length-1][1];
  return (
    <div className="perf-chart-wrap">
      <svg className="perf-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ color: accent }}>
        {/* horizontal grid */}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1={padX} x2={width - padX}
            y1={padTop + innerH * p} y2={padTop + innerH * p}
            stroke="#EFE9DF" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        <polygon points={area} fill={accentSoft} />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={lastX} cy={lastY} r="3.5" fill="#fff" stroke="currentColor" strokeWidth="2" />
      </svg>
      {labels && (
        <div className="perf-chart-axis">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

/* Field (Edit-mode form row) */
function Field({ label, value, mono, muted, required, full, multiline }) {
  return (
    <div className="field" style={full ? { gridColumn: '1 / -1' } : null}>
      <div className="field-label">
        <span>{label}</span>
        {required && <span className="req">*</span>}
      </div>
      <div className={'field-value' + (muted ? ' muted' : '')}>
        {mono
          ? <span className="mono">{value}</span>
          : multiline
            ? <span style={{ fontWeight: 400, lineHeight: 1.55, color: 'var(--cream-800)' }}>{value}</span>
            : <span>{value}</span>}
      </div>
      <span className="field-edit-cue">↵ edit</span>
    </div>
  );
}

function SectionCard({ title, sub, right, children, flush }) {
  return (
    <div className="section-card">
      {title && (
        <div className="section-card-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div className={'section-card-body' + (flush ? '' : ' padded')}>
        {children}
      </div>
    </div>
  );
}

Object.assign(window, {
  StatusTag, ModeBadge, ConceptTag, Crumb,
  DetailHeader, MetaStrip, DetailTabs, DetailActions,
  TrendChart, Field, SectionCard,
});
