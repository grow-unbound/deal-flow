export function Tabs(props) {
  var items    = props.items    || [];
  var activeId = props.activeId;
  var onChange = props.onChange;
  var size     = props.size     != null ? props.size : 'md';

  var fontSize = size === 'sm' ? '13px' : '13.5px';
  var padding  = size === 'sm' ? '8px 12px' : '10px 16px';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid #EAE3D9', fontFamily: "'Mukta', sans-serif", WebkitFontSmoothing: 'antialiased' }}>
      {items.map(function(item) {
        return (
          <TabBtn key={item.id} item={item} isActive={item.id === activeId} fontSize={fontSize} padding={padding} onChange={onChange} />
        );
      })}
    </div>
  );
}

function TabBtn(props) {
  var item = props.item, isActive = props.isActive;
  var fontSize = props.fontSize, padding = props.padding, onChange = props.onChange;
  var isDisabled = !!item.disabled;

  var hState = React.useState(false);
  var hovered = hState[0], setHovered = hState[1];
  var pState  = React.useState(false);
  var pressed = pState[0], setPressed = pState[1];

  /* Active = ink text + copper underline (accent line only, not text colour).
     Hover  = warm-tint background + slightly darkened text.            */
  var textColor = isActive
    ? '#221E1A'
    : (isDisabled ? '#C4B9AD' : (hovered ? '#3D3128' : '#6F665C'));
  var bg = (!isActive && !isDisabled && hovered) ? 'rgba(34,30,26,.05)' : 'transparent';

  return (
    <button
      disabled={isDisabled}
      onClick={function() { if (!isDisabled && onChange) onChange(item.id); }}
      onMouseEnter={function(){ if (!isDisabled) setHovered(true); }}
      onMouseLeave={function(){ setHovered(false); setPressed(false); }}
      onMouseDown={function(){ if (!isDisabled) setPressed(true); }}
      onMouseUp={function(){ setPressed(false); }}
      style={{
        padding:      padding,
        fontSize:     fontSize,
        fontWeight:   isActive ? 700 : 500,
        color:        textColor,
        border:       'none',
        background:   bg,
        cursor:       isDisabled ? 'not-allowed' : 'pointer',
        borderBottom: '2px solid ' + (isActive ? '#B5642F' : 'transparent'),
        marginBottom: '-1px',
        letterSpacing:  '-0.01em',
        lineHeight:     1.3,
        display:        'flex',
        alignItems:     'center',
        gap:            '6px',
        borderRadius:   '6px 6px 0 0',
        transform:      pressed ? 'scale(0.98)' : 'scale(1)',
        transition:     'color 120ms ease, background 120ms ease, transform 80ms ease',
        whiteSpace:     'nowrap',
        fontFamily:     "'Mukta', sans-serif",
        outline:        'none',
        userSelect:     'none',
      }}
    >
      {item.label}
      {item.count != null && (
        <span style={{
          fontFamily:  "'JetBrains Mono', monospace",
          fontSize:    '10px',
          fontWeight:  500,
          background:  isActive ? 'rgba(34,30,26,.11)' : (hovered ? 'rgba(34,30,26,.08)' : '#EAE3D9'),
          color:       isActive ? '#221E1A' : '#64594E',
          padding:     '2px 6px',
          borderRadius:'99px',
          letterSpacing: '.02em',
          transition:  'background 120ms ease, color 120ms ease',
        }}>
          {item.count}
        </span>
      )}
    </button>
  );
}
