// Shared helpers for the Yukti identity territory boards.

// ---- WCAG contrast math --------------------------------------------------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
}
function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const l1 = lum(a), l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Small badge showing a computed contrast ratio + AA verdict
function AABadge({ fg, bg, label }) {
  const r = contrastRatio(fg, bg);
  const pass = r >= 4.5;
  const passLg = r >= 3;
  const verdict = pass ? 'AA' : passLg ? 'AA-large' : 'graphic only';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5,
      color: '#555', background: '#fff', border: '1px solid #e2e0da',
      borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap'
    }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: '1px solid rgba(0,0,0,.12)', display: 'inline-block', position: 'relative' }}>
        <span style={{ position: 'absolute', inset: 2, background: fg, borderRadius: 1 }}></span>
      </span>
      {label ? label + ' · ' : ''}{r.toFixed(1)}:1 {verdict}
    </span>
  );
}

// Swatch row
function Sw({ c, name, role, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      <div style={{ height: 64, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,.08)' }}></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1c1b18' }}>{name}</span>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, color: '#888' }}>{c}</span>
        {role ? <span style={{ fontSize: 10.5, color: '#777', lineHeight: 1.35 }}>{role}</span> : null}
      </div>
    </div>
  );
}

// Multi-script specimen line
function ScriptLine({ tag, font, size = 26, weight = 600, dir, text, color = '#1c1b18', lh = 1.35, ls }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, alignItems: 'baseline' }}>
      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '.06em' }}>{tag}</span>
      <span dir={dir || 'ltr'} style={{
        fontFamily: font, fontSize: size, fontWeight: weight, color, lineHeight: lh,
        letterSpacing: ls || 'normal', textAlign: dir === 'rtl' ? 'right' : 'left', display: 'block'
      }}>{text}</span>
    </div>
  );
}

// Board scaffolding -------------------------------------------------------
function BoardPad({ children, style }) {
  return <div style={{ padding: 28, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'IBM Plex Sans, sans-serif', ...style }}>{children}</div>;
}
function BoardHead({ kicker, title, note }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#a09a8e' }}>{kicker}</span>
      <span style={{ fontSize: 17, fontWeight: 600, color: '#1c1b18' }}>{title}</span>
      {note ? <span style={{ fontSize: 12, color: '#777', lineHeight: 1.45, maxWidth: 640 }}>{note}</span> : null}
    </div>
  );
}
function CellLabel({ children }) {
  return <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#999' }}>{children}</span>;
}
// A framed lockup cell
function LockupCell({ label, bg, children, grow }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: grow ? 1.4 : 1, minWidth: 0 }}>
      <div style={{
        background: bg || '#fff', border: '1px solid #e7e4dd', borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 104, overflow: 'hidden'
      }}>{children}</div>
      <CellLabel>{label}</CellLabel>
    </div>
  );
}

Object.assign(window, { contrastRatio, AABadge, Sw, ScriptLine, BoardPad, BoardHead, CellLabel, LockupCell });
