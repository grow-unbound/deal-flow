// Badge — pill label with shape glyph + text.
// NEVER use colour alone. Every variant has a distinct SVG glyph.

var BADGE_GLYPHS = {
  copper: (
    <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
      <circle cx="3.5" cy="3.5" r="3.5" fill="#B5642F" />
    </svg>
  ),
  success: (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
      <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#1F6B3A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  warning: (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
      <path d="M4.5 1.5L8.2 7.5H.8Z" stroke="#8A5700" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
      <line x1="4.5" y1="3.8" x2="4.5" y2="5.6" stroke="#8A5700" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="4.5" cy="6.6" r=".55" fill="#8A5700"/>
    </svg>
  ),
  error: (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
      <line x1="2" y1="2" x2="7" y2="7" stroke="#9C3026" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="2" x2="2" y2="7" stroke="#9C3026" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  neutral: (
    <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
      <circle cx="3.5" cy="3.5" r="3" stroke="#6F665C" strokeWidth="1.2" strokeDasharray="2 1.4" fill="none"/>
    </svg>
  ),
};

var BADGE_TOKENS = {
  copper:  { color: '#6a3d18', bg: 'rgba(181,100,47,.14)', border: 'rgba(181,100,47,.22)' },
  success: { color: '#1F6B3A', bg: 'rgba(31,107,58,.12)',  border: 'rgba(31,107,58,.22)'  },
  warning: { color: '#8A5700', bg: 'rgba(138,87,0,.10)',   border: 'rgba(138,87,0,.20)'   },
  error:   { color: '#9C3026', bg: 'rgba(156,48,38,.12)',  border: 'rgba(156,48,38,.22)'  },
  neutral: { color: '#64594E', bg: 'rgba(100,89,78,.08)',  border: 'rgba(100,89,78,.18)'  },
};

export function Badge(props) {
  var variant  = props.variant != null ? props.variant : 'neutral';
  var text     = props.children || props.label;
  var tok      = BADGE_TOKENS[variant] || BADGE_TOKENS.neutral;
  var glyph    = BADGE_GLYPHS[variant];

  var style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '.09em',
    textTransform: 'uppercase',
    padding: '4px 9px',
    borderRadius: '9999px',
    border: '1px solid ' + tok.border,
    color: tok.color,
    background: tok.bg,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  return (
    <span style={style}>
      {glyph && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{glyph}</span>}
      {text}
    </span>
  );
}


