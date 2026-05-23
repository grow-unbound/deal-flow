// ui_kits/cockpit/Common.jsx
// Reusable small components: StatusPill, Avatar, Card, KPITile, EmptyState, PageHeader.

function StatusPill({ status }) {
  const m = DF_DATA.statusMeta[status] || { label: status, bg: '#EFE9DF', fg: '#3D3A35' };
  return (
    <span className="status-pill" style={{ background: m.bg, color: m.fg }}>
      {m.label}
    </span>
  );
}

function BrandAvatar({ initials, size = 40, hue = 'cream' }) {
  const map = {
    cream: { bg: '#F4EFE6', fg: '#1F3A34', border: '#EFE9DF' },
    teal:  { bg: '#EAF1EE', fg: '#1F3A34', border: '#C6DAD3' },
    ember: { bg: '#FBEFE3', fg: '#874720', border: '#F5DAB8' },
  };
  const c = map[hue] || map.cream;
  return (
    <div className="brand-avatar" style={{
      width: size, height: size, background: c.bg, color: c.fg, borderColor: c.border,
      fontSize: size * 0.38,
    }}>{initials}</div>
  );
}

function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function KPITile({ label, value, delta, deltaTone = 'up', hint }) {
  const isUp = deltaTone === 'up';
  return (
    <div className="kpi-tile">
      <div className="eyebrow">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta && (
        <div className={'kpi-delta ' + (isUp ? 'is-up' : 'is-down')}>
          {isUp ? <IconArrowUp size={12} stroke={2} /> : <IconArrowDn size={12} stroke={2} />}
          <span>{delta}</span>
          {hint && <span className="kpi-hint">{hint}</span>}
        </div>
      )}
    </div>
  );
}

function ProductThumb({ hue = 'cream', size = 56 }) {
  // Stylized bottle silhouette on tinted ground.
  const grounds = {
    teal:  'linear-gradient(180deg, #EAF1EE 0%, #C6DAD3 100%)',
    ember: 'linear-gradient(180deg, #FBEFE3 0%, #F5DAB8 100%)',
    cream: 'linear-gradient(180deg, #F4EFE6 0%, #EFE9DF 100%)',
  };
  const bottle = {
    teal:  'linear-gradient(180deg, #1F3A34, #142823)',
    ember: 'linear-gradient(180deg, #874720, #4F2A12)',
    cream: 'linear-gradient(180deg, #6B6760, #3D3A35)',
  };
  return (
    <div className="product-thumb" style={{ width: size, height: size, background: grounds[hue] }}>
      <div className="product-thumb-bottle" style={{
        width: size * 0.34, height: size * 0.78, background: bottle[hue],
      }}>
        <div className="product-thumb-label"></div>
      </div>
    </div>
  );
}

function EmptyState({ illustration, title, body, cta }) {
  return (
    <div className="empty-state">
      {illustration && <img src={illustration} alt="" width={180} />}
      <div className="empty-state-text">
        <h3 className="empty-state-title">{title}</h3>
        <p className="empty-state-body">{body}</p>
        {cta}
      </div>
    </div>
  );
}

Object.assign(window, { StatusPill, BrandAvatar, PageHeader, KPITile, ProductThumb, EmptyState });
