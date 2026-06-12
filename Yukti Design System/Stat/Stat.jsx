export function Stat(props) {
  var value        = props.value;
  var label        = props.label;
  var trend        = props.trend;
  var trendDir     = props.trendDir     != null ? props.trendDir     : 'neutral';
  var trendContext = props.trendContext;
  var prefix       = props.prefix;
  var icon         = props.icon;
  var dark         = props.dark         != null ? props.dark         : false;

  var bg      = dark ? '#2B2825' : '#FCFBF8';
  var border  = dark ? 'rgba(255,255,255,.08)' : '#EAE3D9';
  var ink     = dark ? '#F3EEE6' : '#221E1A';
  var sub     = dark ? 'rgba(243,238,230,.55)' : '#6F665C';

  var trendColor = trendDir === 'up' ? '#1F6B3A' : trendDir === 'down' ? '#9C3026' : '#64594E';

  function TrendArrow() {
    if (trendDir === 'up') return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 9L5 5.5L8 8L10.5 4.5" stroke={trendColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    if (trendDir === 'down') return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 4.5L5 7L8 5L10.5 8.5" stroke={trendColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6H10" stroke={trendColor} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }

  return (
    <div style={{
      background: bg, border: '1px solid ' + border, borderRadius: '12px',
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px',
      fontFamily: "'Mukta', sans-serif", WebkitFontSmoothing: 'antialiased',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '.10em', textTransform: 'uppercase', color: sub }}>{label}</span>
        {icon && <span style={{ color: sub, display: 'flex', alignItems: 'center' }}>{icon}</span>}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '28px', fontWeight: 500, color: ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {prefix && <span style={{ fontSize: '18px', marginRight: '3px' }}>{prefix}</span>}
        {value}
      </div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <TrendArrow />
          <span style={{ fontSize: '12px', fontWeight: 600, color: trendColor }}>{trend}</span>
          {trendContext && <span style={{ fontSize: '12px', color: sub }}>{trendContext}</span>}
        </div>
      )}
    </div>
  );
}
