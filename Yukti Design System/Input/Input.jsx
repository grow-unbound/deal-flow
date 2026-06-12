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

  var fieldWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FCFBF8',
    border: '1px solid ' + (hasError ? '#9C3026' : '#EAE3D9'),
    borderRadius: '10px',
    padding: '0 12px',
    height: '40px',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
    boxShadow: hasError ? '0 0 0 3px rgba(156,48,38,.10)' : undefined,
    opacity: disabled ? 0.6 : 1,
  };

  var inputStyle = {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: "'Mukta', sans-serif",
    fontSize: '14px',
    fontWeight: 400,
    color: '#221E1A',
    letterSpacing: '-0.01em',
    lineHeight: 1.55,
    cursor: disabled ? 'not-allowed' : undefined,
    minWidth: 0,
  };

  var affixStyle = {
    fontSize: '13px',
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
      <div style={fieldWrapStyle}>
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
          onBlur={onBlur}
          required={required}
          style={inputStyle}
        />
        {suffix && <span style={affixStyle}>{suffix}</span>}
      </div>
      {(hint || error) && <span style={hintStyle}>{error || hint}</span>}
    </div>
  );
}


