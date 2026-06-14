// StatusChip — order lifecycle + catalog statuses.
// Every status = colour + shape glyph + label. Never colour alone.

var STATUS_MAP = {
  draft:      { label: 'Draft',       color: '#64594E', bg: 'rgba(100,89,78,.08)',  border: 'rgba(100,89,78,.18)',  glyph: 'dashed'  },
  published:  { label: 'Published',   color: '#1A1714', bg: 'rgba(34,30,26,.10)',  border: 'rgba(34,30,26,.20)',  glyph: 'dot'     },
  archived:   { label: 'Archived',    color: '#64594E', bg: 'rgba(100,89,78,.06)',  border: 'rgba(100,89,78,.14)',  glyph: 'square'  },
  received:   { label: 'Received',    color: '#2A5F8A', bg: 'rgba(42,95,138,.10)',  border: 'rgba(42,95,138,.20)',  glyph: 'ring'    },
  confirmed:  { label: 'Confirmed',   color: '#1E4D72', bg: 'rgba(42,95,138,.10)',  border: 'rgba(42,95,138,.20)',  glyph: 'check'   },
  dispatched: { label: 'Dispatched',  color: '#2A5F8A', bg: 'rgba(42,95,138,.12)',  border: 'rgba(42,95,138,.22)',  glyph: 'arrow'   },
  delivered:  { label: 'Delivered',   color: '#1F6B3A', bg: 'rgba(31,107,58,.12)',  border: 'rgba(31,107,58,.22)',  glyph: 'check'   },
  cancelled:  { label: 'Cancelled',   color: '#9C3026', bg: 'rgba(156,48,38,.10)',  border: 'rgba(156,48,38,.20)',  glyph: 'cross'   },
  active:     { label: 'Active',      color: '#1F6B3A', bg: 'rgba(31,107,58,.12)',  border: 'rgba(31,107,58,.22)',  glyph: 'dot'     },
  inactive:   { label: 'Inactive',    color: '#64594E', bg: 'rgba(100,89,78,.08)',  border: 'rgba(100,89,78,.18)',  glyph: 'dashed'  },
  pending:    { label: 'Pending',     color: '#8A5700', bg: 'rgba(138,87,0,.10)',   border: 'rgba(138,87,0,.20)',   glyph: 'ring'    },
};

function StatusGlyph(props) {
  var type  = props.type;
  var color = props.color;
  var s     = { display: 'flex', alignItems: 'center', flexShrink: 0 };
  if (type === 'dot')    return <span style={s}><svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3.5" fill={color}/></svg></span>;
  if (type === 'dashed') return <span style={s}><svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3" stroke={color} strokeWidth="1.2" strokeDasharray="2 1.4" fill="none"/></svg></span>;
  if (type === 'ring')   return <span style={s}><svg width="7" height="7" viewBox="0 0 7 7"><circle cx="3.5" cy="3.5" r="3" stroke={color} strokeWidth="1.3" fill="none"/></svg></span>;
  if (type === 'square') return <span style={s}><svg width="8" height="8" viewBox="0 0 8 8"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke={color} strokeWidth="1.2" fill="none"/></svg></span>;
  if (type === 'check')  return <span style={s}><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
  if (type === 'cross')  return <span style={s}><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><line x1="2" y1="2" x2="7" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="2" x2="2" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg></span>;
  if (type === 'arrow')  return <span style={s}><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5H7.5M5 2L7.5 4.5L5 7" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
  return null;
}

export function StatusChip(props) {
  var status = props.status || 'draft';
  var cfg    = STATUS_MAP[status] || STATUS_MAP.draft;
  var text   = props.label || cfg.label;

  var style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '12.5px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    padding: '4px 10px',
    borderRadius: '8px',
    border: '1px solid ' + cfg.border,
    color: cfg.color,
    background: cfg.bg,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  return (
    <span style={style}>
      <StatusGlyph type={cfg.glyph} color={cfg.color} />
      {text}
    </span>
  );
}


