export function SearchBar(props) {
  var placeholder  = props.placeholder  != null ? props.placeholder  : 'Search…';
  var value        = props.value;
  var defaultValue = props.defaultValue;
  var shortcut     = props.shortcut;
  var size         = props.size         != null ? props.size         : 'md';
  var disabled     = props.disabled     != null ? props.disabled     : false;
  var fullWidth    = props.fullWidth    != null ? props.fullWidth    : false;
  var onChange     = props.onChange;
  var onClear      = props.onClear;
  var onSubmit     = props.onSubmit;

  var heights = { sm: '32px', md: '38px', lg: '44px' };
  var fontSizes = { sm: '12.5px', md: '14px', lg: '15px' };
  var radii = { sm: '8px', md: '10px', lg: '11px' };
  var pads = { sm: '0 10px', md: '0 12px', lg: '0 14px' };

  var hasValue = value != null ? value.length > 0 : false;

  function handleKeyDown(e) {
    if (e.key === 'Enter' && onSubmit) onSubmit(e.target.value);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: disabled ? 'rgba(248,246,242,.6)' : '#FCFBF8',
      border: '1px solid #EAE3D9', borderRadius: radii[size] || radii.md,
      padding: pads[size] || pads.md, height: heights[size] || heights.md,
      opacity: disabled ? 0.6 : 1,
      width: fullWidth ? '100%' : undefined,
      transition: 'border-color 120ms ease, box-shadow 120ms ease',
      fontFamily: "'Mukta', sans-serif",
    }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: '#6F665C' }}>
        <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: "'Mukta', sans-serif", fontSize: fontSizes[size] || fontSizes.md,
          color: '#221E1A', letterSpacing: '-0.01em', minWidth: 0,
          cursor: disabled ? 'not-allowed' : undefined,
        }}
      />
      {hasValue && onClear && (
        <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6F665C', padding: '1px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><line x1="3" y1="3" x2="10" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="10" y1="3" x2="3" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      )}
      {shortcut && !hasValue && (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#6F665C', background: '#EAE3D9', padding: '2px 6px', borderRadius: '4px', flexShrink: 0, letterSpacing: '.04em' }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}
