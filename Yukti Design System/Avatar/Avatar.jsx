var AVATAR_SIZES = {
  xs: { px: 24, fontSize: '10px', radius: '6px'  },
  sm: { px: 32, fontSize: '12px', radius: '8px'  },
  md: { px: 40, fontSize: '14px', radius: '10px' },
  lg: { px: 52, fontSize: '18px', radius: '12px' },
  xl: { px: 72, fontSize: '24px', radius: '16px' },
};

// Warm palettes derived from name hash — no brand colour collisions
var AVATAR_PALETTES = [
  { bg: 'rgba(181,100,47,.16)', color: '#6a3d18' },
  { bg: 'rgba(31,107,58,.14)',  color: '#1F6B3A' },
  { bg: 'rgba(42,95,138,.14)',  color: '#1e4873' },
  { bg: 'rgba(100,89,78,.14)',  color: '#4a4038' },
  { bg: 'rgba(138,87,0,.12)',   color: '#6b4300' },
];

function hashName(name) {
  if (!name) return 0;
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name) {
  if (!name) return '?';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Avatar(props) {
  var name  = props.name;
  var src   = props.src;
  var alt   = props.alt;
  var size  = props.size  != null ? props.size  : 'md';
  var shape = props.shape != null ? props.shape : 'circle';

  var sz  = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  var pal = AVATAR_PALETTES[hashName(name) % AVATAR_PALETTES.length];
  var r   = shape === 'circle' ? '50%' : sz.radius;

  var baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: sz.px,
    height: sz.px,
    borderRadius: r,
    flexShrink: 0,
    overflow: 'hidden',
    userSelect: 'none',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased',
    border: '1px solid rgba(34,30,26,.10)',  /* R11.1 — subtle ring reads cleaner than borderless */
  };

  if (src) {
    return (
      <div style={baseStyle}>
        <img src={src} alt={alt || name || 'Avatar'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div style={Object.assign({}, baseStyle, { background: pal.bg })}>
      <span style={{ fontSize: sz.fontSize, fontWeight: 700, letterSpacing: '.02em', color: pal.color, lineHeight: 1 }}>
        {initials(name)}
      </span>
    </div>
  );
}


