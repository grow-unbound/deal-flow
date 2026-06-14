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

  var focState  = React.useState(false);
  var focused    = focState[0], setFocused = focState[1];
  var hovState   = React.useState(false);
  var hovered    = hovState[0], setHovered = hovState[1];

  var hasValue = value != null ? value.length > 0 : false;

  var borderColor = focused ? '#B5642F' : (hovered ? '#DBD1C2' : '#EAE3D9');
  var ringStyle   = focused ? '0 0 0 3px rgba(181,100,47,.14)' : undefined;

  function handleKeyDown(e) {
    if (e.key === 'Enter' && onSubmit) onSubmit(e.target.value);
  }

  return (
    <div
      onMouseEnter={function(){ if (!disabled) setHovered(true); }}
      onMouseLeave={function(){ setHovered(false); }}
      style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
      border: '1px solid ' + borderColor, borderRadius: radii[size] || radii.md,
      padding: pads[size] || pads.md, height: heights[size] || heights.md,
      opacity: disabled ? 0.6 : 1,
      width: fullWidth ? '100%' : undefined,
      boxShadow: ringStyle,
      transition: 'border-color 140ms ease, box-shadow 140ms ease',
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
        onFocus={function(){ setFocused(true); }}
        onBlur={function(){ setFocused(false); }}
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
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#6F665C', background: '#EAE3D9', padding: '2px 6px', borderRadius: '4px', flexShrink: 0, letterSpacing: '.04em' }}>
          {shortcut}
        </span>
      )}
    </div>
  );
}
