var BTN_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontFamily: "'Mukta', sans-serif",
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: 1,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'background 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  WebkitFontSmoothing: 'antialiased',
  textDecoration: 'none',
  outline: 'none',
};

var BTN_SIZES = {
  sm: { fontSize: '12.5px', padding: '0 12px', height: '32px', borderRadius: '8px',  gap: '5px' },
  md: { fontSize: '14px',   padding: '0 18px', height: '38px', borderRadius: '10px', gap: '6px' },
  lg: { fontSize: '16px',   padding: '0 24px', height: '46px', borderRadius: '11px', gap: '8px' },
};

var BTN_VARIANTS = {
  primary: {
    background: '#B5642F',
    color: '#F8F6F2',
    borderColor: 'transparent',
    boxShadow: '0 1px 3px rgba(34,30,26,.18), inset 0 1px 0 rgba(255,255,255,.10)',
  },
  secondary: {
    background: '#FCFBF8',
    color: '#221E1A',
    borderColor: '#EAE3D9',
    boxShadow: '0 1px 2px rgba(34,30,26,.06)',
  },
  ghost: {
    background: 'transparent',
    color: '#221E1A',
    borderColor: 'transparent',
    boxShadow: 'none',
  },
  danger: {
    background: 'rgba(156,48,38,.10)',
    color: '#9C3026',
    borderColor: 'rgba(156,48,38,.20)',
    boxShadow: 'none',
  },
};

export function Button(props) {
  var variant   = props.variant   != null ? props.variant   : 'primary';
  var size      = props.size      != null ? props.size      : 'md';
  var label     = props.label;
  var children  = props.children;
  var disabled  = props.disabled  != null ? props.disabled  : false;
  var loading   = props.loading   != null ? props.loading   : false;
  var fullWidth = props.fullWidth  != null ? props.fullWidth : false;
  var icon      = props.icon;
  var type      = props.type      != null ? props.type      : 'button';
  var onClick   = props.onClick;

  var sz  = BTN_SIZES[size]    || BTN_SIZES.md;
  var vr  = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  var off = disabled || loading;

  var style = Object.assign({}, BTN_BASE, sz, vr, {
    width:  fullWidth ? '100%' : undefined,
    opacity: off ? 0.45 : 1,
    cursor:  off ? 'not-allowed' : 'pointer',
  });

  return (
    <button type={type} style={style} disabled={off} onClick={onClick}>
      {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>}
      {loading ? '…' : (children || label)}
    </button>
  );
}


