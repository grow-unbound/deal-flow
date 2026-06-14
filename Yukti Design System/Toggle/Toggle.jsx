export function Toggle(props) {
  var checked        = props.checked        != null ? props.checked        : false;
  var disabled       = props.disabled       != null ? props.disabled       : false;
  var label          = props.label;
  var hint           = props.hint;
  var size           = props.size           != null ? props.size           : 'md';
  var onChange       = props.onChange;

  var tHov = React.useState(false);
  var trackHovered = tHov[0], setTrackHovered = tHov[1];

  var sizes = {
    sm: { w: 32, h: 18, knob: 12, off: 3 },
    md: { w: 40, h: 22, knob: 16, off: 3 },
  };
  var sz = sizes[size] || sizes.md;
  var knobLeft = checked ? (sz.w - sz.knob - sz.off) : sz.off;

  function handleClick() { if (!disabled && onChange) onChange(!checked); }

  var track = (
    <div
      onClick={handleClick}
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      style={{
        display: 'inline-flex', alignItems: 'center',
        width: sz.w, height: sz.h, borderRadius: '9999px',
        background: checked
          ? (trackHovered && !disabled ? '#A1572A' : '#B5642F')
          : (trackHovered && !disabled ? '#DBD4CB' : '#EAE3D9'),
        border: '1px solid ' + (checked
          ? (trackHovered && !disabled ? 'rgba(181,100,47,.65)' : 'rgba(181,100,47,.5)')
          : (trackHovered && !disabled ? 'rgba(100,89,78,.35)' : 'rgba(100,89,78,.2)')),
        boxShadow: (trackHovered && !disabled && !checked) ? '0 0 0 3px rgba(34,30,26,.06)' : 'none',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={function(){ if (!disabled) setTrackHovered(true); }}
      onMouseLeave={function(){ setTrackHovered(false); }}
      onKeyDown={function(e){ if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleClick(); } }}
    >
      <div style={{
        position: 'absolute', left: knobLeft,
        width: sz.knob, height: sz.knob, borderRadius: '50%',
        background: checked ? '#F8F6F2' : '#FFFFFF',
        boxShadow: '0 1px 3px rgba(34,30,26,.2)',
        transition: 'left 150ms cubic-bezier(0.22,1,.36,1)',
      }} />
    </div>
  );

  if (!label) return track;

  return (
    <div
      onClick={handleClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: "'Mukta', sans-serif", WebkitFontSmoothing: 'antialiased' }}
    >
      {track}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#221E1A', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{label}</span>
        {hint && <span style={{ fontSize: '12px', color: '#64594E', lineHeight: 1.4 }}>{hint}</span>}
      </div>
    </div>
  );
}
