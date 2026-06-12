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

  function handleChange(e) { if (onChange) onChange(e.target.value); }

  var wrapStyle = { display: 'flex', flexDirection: 'column', gap: '5px', fontFamily: "'Mukta', sans-serif", WebkitFontSmoothing: 'antialiased' };
  var labelStyle = { fontSize: '12px', fontWeight: 600, letterSpacing: '.04em', color: '#64594E', userSelect: 'none', lineHeight: 1.3 };
  var selectStyle = {
    width: '100%', height: '40px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FCFBF8',
    border: '1px solid ' + (hasError ? '#9C3026' : '#EAE3D9'),
    borderRadius: '10px', padding: '0 36px 0 12px',
    fontFamily: "'Mukta', sans-serif", fontSize: '14px', fontWeight: 400,
    color: '#221E1A', letterSpacing: '-0.01em',
    appearance: 'none', WebkitAppearance: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    boxShadow: hasError ? '0 0 0 3px rgba(156,48,38,.10)' : undefined,
    outline: 'none', transition: 'border-color 120ms ease, box-shadow 120ms ease',
  };
  var hintStyle = { fontSize: '12px', color: hasError ? '#9C3026' : '#6F665C', lineHeight: 1.45, letterSpacing: '-0.005em' };

  return (
    <div style={wrapStyle}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
          {required && <span style={{ color: '#9C3026', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <select id={inputId} name={name} value={value} defaultValue={defaultValue}
          disabled={disabled} required={required} style={selectStyle} onChange={handleChange}>
          <option value="" disabled>{placeholder}</option>
          {options.map(function(opt, i) {
            return <option key={i} value={opt.value} disabled={opt.disabled}>{opt.label}</option>;
          })}
        </select>
        <span style={{ position: 'absolute', right: '12px', pointerEvents: 'none', color: '#6F665C', display: 'flex', alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 5.5L7 9L10.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
      {(hint || error) && <span style={hintStyle}>{error || hint}</span>}
    </div>
  );
}
