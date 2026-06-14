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
  transition: 'background 140ms cubic-bezier(.22,1,.36,1), border-color 140ms ease, box-shadow 140ms ease, transform 90ms ease, opacity 120ms ease',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  WebkitFontSmoothing: 'antialiased',
  textDecoration: 'none',
  outline: 'none',
};

// R11.1 — base sizes follow the 16px body scale. md is the DEFAULT button.
var BTN_SIZES = {
  sm: { fontSize: '13px', padding: '0 13px', height: '34px', borderRadius: '8px',  gap: '5px' },
  md: { fontSize: '16px', padding: '0 18px', height: '40px', borderRadius: '10px', gap: '7px' },
  lg: { fontSize: '17px', padding: '0 24px', height: '48px', borderRadius: '12px', gap: '8px' },
};

// Each variant carries a rest + hover surface. Hover shifts are deliberate but quiet.
var BTN_VARIANTS = {
  primary: {
    background: '#221E1A', hoverBackground: '#332D27',
    color: '#F8F6F2', borderColor: 'transparent',
    boxShadow: '0 1px 3px rgba(34,30,26,.22), inset 0 1px 0 rgba(255,255,255,.06)',
    hoverShadow: '0 3px 10px rgba(34,30,26,.26), inset 0 1px 0 rgba(255,255,255,.08)',
  },
  accent: {
    background: '#B5642F', hoverBackground: '#A1572A',
    color: '#F8F6F2', borderColor: 'transparent',
    boxShadow: '0 1px 3px rgba(181,100,47,.30), inset 0 1px 0 rgba(255,255,255,.10)',
    hoverShadow: '0 3px 12px rgba(181,100,47,.34), inset 0 1px 0 rgba(255,255,255,.12)',
  },
  secondary: {
    background: '#FCFBF8', hoverBackground: '#F2EDE4',
    color: '#221E1A', borderColor: '#EAE3D9', hoverBorderColor: '#DBD1C2',
    boxShadow: '0 1px 2px rgba(34,30,26,.06)',
    hoverShadow: '0 2px 6px rgba(34,30,26,.10)',
  },
  ghost: {
    background: 'transparent', hoverBackground: 'rgba(34,30,26,.05)',
    color: '#221E1A', borderColor: 'transparent',
    boxShadow: 'none', hoverShadow: 'none',
  },
  danger: {
    background: 'rgba(156,48,38,.10)', hoverBackground: 'rgba(156,48,38,.16)',
    color: '#9C3026', borderColor: 'rgba(156,48,38,.20)', hoverBorderColor: 'rgba(156,48,38,.32)',
    boxShadow: 'none', hoverShadow: 'none',
  },
};

export function Button(props) {
  var variant   = props.variant   != null ? props.variant   : 'primary';
  var size      = props.size      != null ? props.size      : 'md';
  var label     = props.label;
  var children  = props.children;
  var disabled  = props.disabled  != null ? props.disabled  : false;
  var loading   = props.loading   != null ? props.loading   : false;
  var fullWidth = props.fullWidth != null ? props.fullWidth : false;
  var icon      = props.icon;
  var type      = props.type      != null ? props.type      : 'button';
  var onClick   = props.onClick;

  var hoverState = React.useState(false);
  var hovered = hoverState[0], setHovered = hoverState[1];
  var pressState = React.useState(false);
  var pressed = pressState[0], setPressed = pressState[1];

  var sz  = BTN_SIZES[size]       || BTN_SIZES.md;
  var vr  = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  var off = disabled || loading;
  var live = !off && hovered;

  var style = Object.assign({}, BTN_BASE, sz, {
    background:   live && vr.hoverBackground ? vr.hoverBackground : vr.background,
    color:        vr.color,
    borderColor:  live && vr.hoverBorderColor ? vr.hoverBorderColor : vr.borderColor,
    boxShadow:    live && vr.hoverShadow ? vr.hoverShadow : vr.boxShadow,
    width:        fullWidth ? '100%' : undefined,
    opacity:      off ? 0.45 : 1,
    cursor:       off ? 'not-allowed' : 'pointer',
    transform:    (!off && pressed) ? 'scale(0.97)' : 'scale(1)',
  });

  return (
    <button
      type={type} style={style} disabled={off} onClick={onClick}
      onMouseEnter={function(){ setHovered(true); }}
      onMouseLeave={function(){ setHovered(false); setPressed(false); }}
      onMouseDown={function(){ setPressed(true); }}
      onMouseUp={function(){ setPressed(false); }}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>}
      {loading ? '…' : (children || label)}
    </button>
  );
}
