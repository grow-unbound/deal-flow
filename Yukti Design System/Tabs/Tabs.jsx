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
        var isActive   = item.id === activeId;
        var isDisabled = item.disabled;

        return (
          <button
            key={item.id}
            disabled={isDisabled}
            onClick={function() { if (!isDisabled && onChange) onChange(item.id); }}
            style={{
              padding: padding, fontSize: fontSize,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#B5642F' : (isDisabled ? '#C4B9AD' : '#6F665C'),
              border: 'none', background: 'transparent',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              borderBottom: '2px solid ' + (isActive ? '#B5642F' : 'transparent'),
              marginBottom: '-1px',
              letterSpacing: '-0.01em', lineHeight: 1.3,
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'color 100ms ease',
              whiteSpace: 'nowrap',
              fontFamily: "'Mukta', sans-serif",
            }}
          >
            {item.label}
            {item.count != null && (
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '10px', fontWeight: 500,
                background: isActive ? 'rgba(181,100,47,.18)' : '#EAE3D9',
                color: isActive ? '#6a3d18' : '#64594E',
                padding: '2px 6px', borderRadius: '99px',
                letterSpacing: '.02em',
              }}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
