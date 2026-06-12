var ALERT_CFG = {
  info: {
    color: '#2A5F8A',
    bg: 'rgba(42,95,138,.09)',
    border: 'rgba(42,95,138,.20)',
    icon: function(c) {
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke={c} strokeWidth="1.5"/>
          <circle cx="8" cy="5.2" r=".8" fill={c}/>
          <line x1="8" y1="7.5" x2="8" y2="11.2" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    },
  },
  success: {
    color: '#1F6B3A',
    bg: 'rgba(31,107,58,.09)',
    border: 'rgba(31,107,58,.20)',
    icon: function(c) {
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke={c} strokeWidth="1.5"/>
          <path d="M5 8.2L7.2 10.4L11 6" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    },
  },
  warning: {
    color: '#8A5700',
    bg: 'rgba(138,87,0,.08)',
    border: 'rgba(138,87,0,.18)',
    icon: function(c) {
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L14.7 13.5H1.3Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
          <line x1="8" y1="7" x2="8" y2="10.2" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="11.8" r=".8" fill={c}/>
        </svg>
      );
    },
  },
  error: {
    color: '#9C3026',
    bg: 'rgba(156,48,38,.08)',
    border: 'rgba(156,48,38,.18)',
    icon: function(c) {
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke={c} strokeWidth="1.5"/>
          <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
    },
  },
};

export function Alert(props) {
  var variant   = props.variant   != null ? props.variant   : 'info';
  var title     = props.title;
  var body      = props.body;
  var children  = props.children;
  var onDismiss = props.onDismiss;

  var cfg = ALERT_CFG[variant] || ALERT_CFG.info;

  var wrapStyle = {
    display: 'flex',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid ' + cfg.border,
    background: cfg.bg,
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased',
    alignItems: 'flex-start',
  };

  return (
    <div style={wrapStyle} role="alert">
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, paddingTop: '1px' }}>
        {cfg.icon(cfg.color)}
      </span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {title && (
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: cfg.color, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
            {title}
          </p>
        )}
        {body && (
          <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: cfg.color, opacity: 0.85 }}>
            {body}
          </p>
        )}
        {children}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.color, opacity: 0.55, padding: '1px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}


