// settings/SettingsShared.jsx — shared primitives for the Settings module

const { useState: useStateS } = React;

/* ── Extended icon set ─────────────────────────────────────────── */
const SI = ({ name, size = 16, stroke = 1.5, color = 'currentColor', style }) => {
  const p = {
    x:            <path d="M18 6L6 18M6 6l12 12" />,
    check:        <path d="M20 6L9 17l-5-5" />,
    chevronRight: <path d="M9 18l6-6-6-6" />,
    chevronLeft:  <path d="M15 18l-6-6 6-6" />,
    chevronDown:  <path d="M6 9l6 6 6-6" />,
    chevronUp:    <path d="M18 15l-6-6-6 6" />,
    plus:         <path d="M12 5v14M5 12h14" />,
    search:       <><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></>,
    trash:        <><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></>,
    edit:         <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    moreVert:     <><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
    user:         <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    users:        <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
    mail:         <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></>,
    settings:     <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    building:     <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    bell:         <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>,
    creditCard:   <><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></>,
    mapPin:       <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>,
    link:         <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
    zap:          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    smartphone:   <><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></>,
    tag:          <><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    lock:         <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>,
    unlock:       <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></>,
    refresh:      <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></>,
    checkCircle:  <><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    alertCircle:  <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    info:         <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
    arrowLeft:    <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    arrowRight:   <path d="M5 12h14M13 5l7 7-7 7" />,
    barChart:     <path d="M12 20V10M18 20V4M6 20v-4" />,
    layers:       <><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
    package:      <><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></>,
    fileText:     <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></>,
    ticket:       <><path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 100-4V9z"/></>,
    shield:       <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    download:     <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>,
    uploadCloud:  <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></>,
    eye:          <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff:       <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    layoutGrid:   <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    sliders:      <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></>,
    warehouse:    <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><rect x="9" y="12" width="6" height="10"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      {p[name] || <circle cx="12" cy="12" r="10"/>}
    </svg>
  );
};

/* ── Toggle switch ─────────────────────────────────────────────── */
function Toggle({ value, onChange, disabled = false }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => !disabled && onChange(!value)}
      className={`toggle-switch${value ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

/* ── Section card ──────────────────────────────────────────────── */
function SCard({ title, subtitle, children, footer, icon }) {
  return (
    <div className="s-card">
      <div className="s-card-head">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {icon && (
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'var(--teal-50)', color: 'var(--teal-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginTop: 1,
            }}>
              <SI name={icon} size={15} stroke={1.6} />
            </div>
          )}
          <div>
            <div className="s-card-title">{title}</div>
            {subtitle && <div className="s-card-sub">{subtitle}</div>}
          </div>
        </div>
      </div>
      <div className="s-card-body">{children}</div>
      {footer && <div className="s-card-foot">{footer}</div>}
    </div>
  );
}

/* ── Form field row ────────────────────────────────────────────── */
function FRow({ label, hint, required, children, style: st }) {
  return (
    <div className="field" style={st}>
      <label className="field-label">
        {label}{required && <span className="req" style={{ color: 'var(--ember-400)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/* ── Select field ──────────────────────────────────────────────── */
function SSelect({ label, value, onChange, options, hint }) {
  return (
    <FRow label={label} hint={hint}>
      <select className="field-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FRow>
  );
}

/* ── Toggle row (notification-style) ──────────────────────────── */
function TRow({ label, desc, value, onChange, disabled, systemOn }) {
  return (
    <div className="toggle-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="toggle-row-label">{label}</div>
        {desc && <div className="toggle-row-desc">{desc}</div>}
      </div>
      {systemOn
        ? <span className="always-on-badge">Always on</span>
        : <Toggle value={value} onChange={onChange} disabled={disabled} />
      }
    </div>
  );
}

/* ── Avatar ────────────────────────────────────────────────────── */
function SAv({ name, size = 30 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const variants = ['teal', 'ember', 'cream'];
  const v = variants[(name || '').charCodeAt(0) % 3];
  return (
    <div className={`s-avatar s-avatar--${v}`}
      style={{ width: size, height: size, fontSize: size * 0.38, borderRadius: '50%' }}>
      {initials}
    </div>
  );
}

/* ── Feature card header ───────────────────────────────────────── */
function FeatHeader({ icon, title, desc, enabled, onToggle, alwaysOn, locked, lockTier, children }) {
  return (
    <div className={`feature-card-header${enabled && !locked ? ' feature-card-header--on' : ''}${locked ? ' feature-card-header--locked' : ''}`}>
      <div className={`feature-icon${enabled && !locked ? ' feature-icon--on' : ''}`}>
        <SI name={icon} size={18} stroke={1.6} />
      </div>
      <div className="feature-card-meta">
        <div className="feature-card-title">
          {title}
          {alwaysOn && <span className="always-on-badge">Always on</span>}
          {locked && <span className={`tier-badge tier-badge--${lockTier}`}>{lockTier === 'growth' ? 'Growth' : 'Scale'}</span>}
        </div>
        <div className="feature-card-desc">{desc}</div>
      </div>
      {children}
      {!alwaysOn && !locked && onToggle && <Toggle value={enabled} onChange={onToggle} />}
      {locked && (
        <button className="btn btn-secondary btn-sm">
          <SI name="unlock" size={13} /> Upgrade
        </button>
      )}
    </div>
  );
}

/* ── Info / warn banners ───────────────────────────────────────── */
function InfoBanner({ children }) {
  return (
    <div className="info-banner">
      <SI name="info" size={15} color="var(--teal-600)" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}
function WarnBanner({ children }) {
  return (
    <div className="warn-banner">
      <SI name="alertCircle" size={15} color="var(--warning-700)" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

/* ── Status pill ───────────────────────────────────────────────── */
function StatusPill({ status }) {
  const map = {
    active:      { bg: 'var(--success-50)',  color: 'var(--success-700)',  border: '#C8DDC9',          dot: 'var(--success-500)',  label: 'Active'      },
    invited:     { bg: 'var(--warning-50)',  color: 'var(--warning-700)',  border: '#F3E2BD',          dot: 'var(--warning-500)', label: 'Invited'     },
    deactivated: { bg: 'var(--cream-100)',   color: 'var(--cream-700)',    border: 'var(--cream-300)', dot: 'var(--cream-400)',   label: 'Deactivated' },
  };
  const s = map[status] || map.active;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

/* ── Row actions icon button ───────────────────────────────────── */
function IBtn({ icon, title, onClick, danger }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 7, border: '1px solid transparent',
      background: 'transparent', color: danger ? 'var(--danger-500)' : 'var(--cream-700)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>
      <SI name={icon} size={13} />
    </button>
  );
}

Object.assign(window, {
  SI, Toggle, SCard, FRow, SSelect, TRow, SAv, FeatHeader, InfoBanner, WarnBanner, StatusPill, IBtn,
});
