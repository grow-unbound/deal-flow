export function Select(props) {
  var label        = props.label;
  var placeholder  = props.placeholder  != null ? props.placeholder  : 'Select…';
  var options      = props.options      || [];
  var value        = props.value;
  var defaultValue = props.defaultValue;
  var hint         = props.hint;
  var error        = props.error;
  var disabled     = props.disabled     != null ? props.disabled : false;
  var required     = props.required     != null ? props.required : false;
  var id           = props.id;
  var name         = props.name;
  var onChange     = props.onChange;

  var hasError = !!error;
  var inputId  = id || (label ? 'yk-sel-' + label.toLowerCase().replace(/\s+/g, '-') : undefined);

  var openState = React.useState(false);
  var open = openState[0], setOpen = openState[1];
  var hovState = React.useState(false);
  var hovered = hovState[0], setHovered = hovState[1];
  // uncontrolled internal value falls back to defaultValue
  var internal = React.useState(defaultValue != null ? defaultValue : '');
  var curr = value != null ? value : internal[0];

  function choose(v) {
    if (value == null) internal[1](v);
    setOpen(false);
    if (onChange) onChange(v);
  }

  var selected = options.filter(function(o){ return o.value === curr; })[0];

  var border = hasError ? '#9C3026' : (open ? '#B5642F' : (hovered ? '#DBD1C2' : '#EAE3D9'));
  var ring   = hasError ? '0 0 0 3px rgba(156,48,38,.10)' : (open ? '0 0 0 3px rgba(181,100,47,.14)' : undefined);

  var wrapStyle  = { display: 'flex', flexDirection: 'column', gap: '5px', fontFamily: "'Mukta', sans-serif", WebkitFontSmoothing: 'antialiased' };
  var labelStyle = { fontSize: '12.5px', fontWeight: 600, letterSpacing: '.04em', color: '#64594E', userSelect: 'none', lineHeight: 1.3 };
  var triggerStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    width: '100%', height: '42px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
    border: '1px solid ' + border, borderRadius: '10px', padding: '0 12px',
    fontFamily: "'Mukta', sans-serif", fontSize: '15px', fontWeight: 400,
    color: selected ? '#221E1A' : '#6F665C', letterSpacing: '-0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    boxShadow: ring, outline: 'none', textAlign: 'left',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
  };
  var hintStyle = { fontSize: '12.5px', color: hasError ? '#9C3026' : '#6F665C', lineHeight: 1.45, letterSpacing: '-0.005em' };

  return (
    <div style={wrapStyle}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
          {required && <span style={{ color: '#9C3026', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {/* hidden native input keeps forms working */}
        <input type="hidden" name={name} value={curr} />
        <button
          id={inputId} type="button" style={triggerStyle} disabled={disabled}
          aria-haspopup="listbox" aria-expanded={open}
          onClick={function(){ if (!disabled) setOpen(!open); }}
          onMouseEnter={function(){ setHovered(true); }}
          onMouseLeave={function(){ setHovered(false); }}
          onBlur={function(){ setTimeout(function(){ setOpen(false); }, 120); }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.label : placeholder}
          </span>
          <span style={{ flexShrink: 0, color: '#6F665C', display: 'flex', alignItems: 'center', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms cubic-bezier(.22,1,.36,1)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 5.5L7 9L10.5 5.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>

        {open && !disabled && (
          <div role="listbox" style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 100,
            background: '#FFFFFF', border: '1px solid #EAE3D9', borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(34,30,26,.12), 0 4px 8px rgba(34,30,26,.06)',
            padding: '5px', maxHeight: '264px', overflowY: 'auto',
            animation: 'ykSelIn 140ms cubic-bezier(.22,1,.36,1)',
          }}>
            <style>{'@keyframes ykSelIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'}</style>
            {options.map(function(opt, i) {
              var isSel = opt.value === curr;
              return (
                <Opt key={i} opt={opt} isSel={isSel} onPick={choose} />
              );
            })}
          </div>
        )}
      </div>
      {(hint || error) && <span style={hintStyle}>{error || hint}</span>}
    </div>
  );
}

function Opt(props) {
  var opt = props.opt, isSel = props.isSel, onPick = props.onPick;
  var hs = React.useState(false);
  var hov = hs[0], setHov = hs[1];
  return (
    <div role="option" aria-selected={isSel}
      onMouseDown={function(e){ e.preventDefault(); if (!opt.disabled) onPick(opt.value); }}
      onMouseEnter={function(){ setHov(true); }}
      onMouseLeave={function(){ setHov(false); }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: '9px 10px', borderRadius: '8px',
        fontFamily: "'Mukta', sans-serif", fontSize: '15px', letterSpacing: '-0.01em',
        color: opt.disabled ? '#9b9088' : (isSel ? '#221E1A' : '#3a342e'),
        fontWeight: isSel ? 600 : 400,
        background: opt.disabled ? 'transparent' : (hov ? 'rgba(34,30,26,.05)' : (isSel ? 'rgba(34,30,26,.07)' : 'transparent')),
        cursor: opt.disabled ? 'not-allowed' : 'pointer',
        opacity: opt.disabled ? 0.5 : 1,
        transition: 'background 110ms ease',
      }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
      {isSel && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="#221E1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}
