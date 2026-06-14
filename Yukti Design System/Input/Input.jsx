export function Input(props) {
  var label        = props.label;
  var placeholder  = props.placeholder  != null ? props.placeholder  : '';
  var hint         = props.hint;
  var error        = props.error;
  var type         = props.type         != null ? props.type         : 'text';
  var value        = props.value;
  var defaultValue = props.defaultValue;
  var disabled     = props.disabled     != null ? props.disabled     : false;
  var required     = props.required     != null ? props.required     : false;
  var prefix       = props.prefix;
  var suffix       = props.suffix;
  var id           = props.id;
  var name         = props.name;
  var onChange     = props.onChange;
  var onBlur       = props.onBlur;

  var hasError = !!error;
  var inputId  = id || (label ? 'yk-' + label.toLowerCase().replace(/\s+/g, '-') : undefined);

  var fState = React.useState(false);
  var focused = fState[0], setFocused = fState[1];
  var hState = React.useState(false);
  var hovered = hState[0], setHovered = hState[1];

  var wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased',
  };

  var labelStyle = {
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '.04em',
    color: '#64594E',
    userSelect: 'none',
    lineHeight: 1.3,
  };

  var fieldBorder = hasError ? '#9C3026' : (focused ? '#B5642F' : (hovered ? '#DBD1C2' : '#EAE3D9'));
  var fieldRing   = hasError ? '0 0 0 3px rgba(156,48,38,.10)' : (focused ? '0 0 0 3px rgba(181,100,47,.14)' : undefined);
  var fieldWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
    border: '1px solid ' + fieldBorder,
    borderRadius: '10px',
    padding: '0 12px',
    height: '42px',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
    boxShadow: fieldRing,
    opacity: disabled ? 0.6 : 1,
  };

  var inputStyle = {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '15px',
    fontWeight: 400,
    color: '#221E1A',
    letterSpacing: '-0.01em',
    lineHeight: 1.55,
    cursor: disabled ? 'not-allowed' : undefined,
    minWidth: 0,
  };

  var affixStyle = {
    fontSize: '14px',
    color: '#6F665C',
    userSelect: 'none',
    flexShrink: 0,
    fontFamily: "'Mukta', sans-serif",
  };

  var hintStyle = {
    fontSize: '12px',
    color: hasError ? '#9C3026' : '#6F665C',
    lineHeight: 1.45,
    letterSpacing: '-0.005em',
  };

  return (
    <div style={wrapStyle}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
          {required && <span style={{ color: '#9C3026', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <div style={fieldWrapStyle}
        onMouseEnter={function(){ setHovered(true); }}
        onMouseLeave={function(){ setHovered(false); }}>
        {prefix && <span style={affixStyle}>{prefix}</span>}
        <input
          id={inputId}
          name={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={function(e){ setFocused(false); if (onBlur) onBlur(e); }}
          onFocus={function(){ setFocused(true); }}
          required={required}
          style={inputStyle}
        />
        {suffix && <span style={affixStyle}>{suffix}</span>}
      </div>
      {(hint || error) && <span style={hintStyle}>{error || hint}</span>}
    </div>
  );
}


