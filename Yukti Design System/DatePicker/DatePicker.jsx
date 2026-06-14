var YK_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var YK_MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var YK_DOW = ['M','T','W','T','F','S','S'];

function ykParseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  var d = new Date(v);
  return isNaN(d) ? null : d;
}
function ykFmt(d) {
  if (!d) return '';
  return d.getDate() + ' ' + YK_MON_SHORT[d.getMonth()] + ' ' + d.getFullYear();
}
function ykIso(d) {
  var m = (d.getMonth() + 1), day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}
function ykSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DatePicker(props) {
  var label        = props.label;
  var placeholder  = props.placeholder != null ? props.placeholder : 'DD MMM YYYY';
  var value        = props.value;
  var defaultValue = props.defaultValue;
  var hint         = props.hint;
  var error        = props.error;
  var disabled     = props.disabled != null ? props.disabled : false;
  var required     = props.required != null ? props.required : false;
  var name         = props.name;
  var id           = props.id;
  var minDate      = ykParseDate(props.min);
  var maxDate      = ykParseDate(props.max);
  var onChange     = props.onChange;

  var hasError = !!error;
  var inputId  = id || (label ? 'yk-dp-' + label.toLowerCase().replace(/\s+/g, '-') : undefined);

  var openState = React.useState(false);
  var open = openState[0], setOpen = openState[1];
  var hovState = React.useState(false);
  var hovered = hovState[0], setHovered = hovState[1];
  var internal = React.useState(ykParseDate(defaultValue));
  var curr = value != null ? ykParseDate(value) : internal[0];

  var today = new Date();
  var viewState = React.useState(curr || today);
  var view = viewState[0], setView = viewState[1];

  function pick(d) {
    if (value == null) internal[1](d);
    setView(d);
    setOpen(false);
    if (onChange) onChange(ykIso(d));
  }
  function shiftMonth(n) {
    setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  }
  function disabledDay(d) {
    if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
  }

  var border = hasError ? '#9C3026' : (open ? '#B5642F' : (hovered ? '#DBD1C2' : '#EAE3D9'));
  var ring   = hasError ? '0 0 0 3px rgba(156,48,38,.10)' : (open ? '0 0 0 3px rgba(181,100,47,.14)' : undefined);

  // build calendar grid (Mon-first)
  var first = new Date(view.getFullYear(), view.getMonth(), 1);
  var startOffset = (first.getDay() + 6) % 7; // Mon=0
  var daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  var cells = [];
  for (var i = 0; i < startOffset; i++) cells.push(null);
  for (var d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

  var wrapStyle  = { display: 'flex', flexDirection: 'column', gap: '5px', fontFamily: "'Mukta', sans-serif", WebkitFontSmoothing: 'antialiased' };
  var labelStyle = { fontSize: '12.5px', fontWeight: 600, letterSpacing: '.04em', color: '#64594E', userSelect: 'none', lineHeight: 1.3 };
  var triggerStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    width: '100%', height: '42px',
    background: disabled ? 'rgba(248,246,242,.6)' : '#FFFFFF',
    border: '1px solid ' + border, borderRadius: '10px', padding: '0 12px',
    fontFamily: "'Mukta', sans-serif", fontSize: '15px', fontWeight: 400,
    color: curr ? '#221E1A' : '#6F665C', letterSpacing: '-0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    boxShadow: ring, outline: 'none', textAlign: 'left',
    transition: 'border-color 140ms ease, box-shadow 140ms ease',
  };
  var hintStyle = { fontSize: '12.5px', color: hasError ? '#9C3026' : '#6F665C', lineHeight: 1.45 };
  var navBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#64594E', cursor: 'pointer' };

  return (
    <div style={wrapStyle}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}{required && <span style={{ color: '#9C3026', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <input type="hidden" name={name} value={curr ? ykIso(curr) : ''} />
        <button
          id={inputId} type="button" style={triggerStyle} disabled={disabled}
          aria-haspopup="dialog" aria-expanded={open}
          onClick={function(){ if (!disabled) setOpen(!open); }}
          onMouseEnter={function(){ setHovered(true); }}
          onMouseLeave={function(){ setHovered(false); }}
          onBlur={function(){ setTimeout(function(){ setOpen(false); }, 140); }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {curr ? ykFmt(curr) : placeholder}
          </span>
          <span style={{ flexShrink: 0, color: '#6F665C', display: 'flex', alignItems: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.7"/>
              <path d="M2 6.5H14M5 1.5V4M11 1.5V4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </span>
        </button>

        {open && !disabled && (
          <div role="dialog" style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
            width: '278px', background: '#FFFFFF', border: '1px solid #EAE3D9', borderRadius: '14px',
            boxShadow: '0 12px 32px rgba(34,30,26,.12), 0 4px 8px rgba(34,30,26,.06)',
            padding: '12px', animation: 'ykDpIn 140ms cubic-bezier(.22,1,.36,1)',
          }}
            onMouseDown={function(e){ e.preventDefault(); }}>
            <style>{'@keyframes ykDpIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'}</style>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <NavBtn dir="prev" style={navBtn} onClick={function(){ shiftMonth(-1); }} />
              <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '-0.015em', color: '#221E1A' }}>
                {YK_MONTHS[view.getMonth()]} {view.getFullYear()}
              </span>
              <NavBtn dir="next" style={navBtn} onClick={function(){ shiftMonth(1); }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px' }}>
              {YK_DOW.map(function(w, i){ return (
                <div key={i} style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 500, color: '#6F665C', letterSpacing: '.04em', padding: '2px 0' }}>{w}</div>
              ); })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
              {cells.map(function(c, i) {
                if (!c) return <div key={i} />;
                return <DayCell key={i} date={c} curr={curr} today={today} disabled={disabledDay(c)} onPick={pick} />;
              })}
            </div>
          </div>
        )}
      </div>
      {(hint || error) && <span style={hintStyle}>{error || hint}</span>}
    </div>
  );
}

function NavBtn(props) {
  var hs = React.useState(false); var hov = hs[0], setHov = hs[1];
  var s = Object.assign({}, props.style, { background: hov ? 'rgba(34,30,26,.05)' : 'transparent', transition: 'background 110ms ease' });
  return (
    <button type="button" style={s} onClick={props.onClick}
      onMouseEnter={function(){ setHov(true); }} onMouseLeave={function(){ setHov(false); }}
      aria-label={props.dir === 'prev' ? 'Previous month' : 'Next month'}>
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d={props.dir === 'prev' ? 'M9 3.5L5 7.5L9 11.5' : 'M6 3.5L10 7.5L6 11.5'} stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

function DayCell(props) {
  var date = props.date, curr = props.curr, today = props.today, disabled = props.disabled, onPick = props.onPick;
  var hs = React.useState(false); var hov = hs[0], setHov = hs[1];
  var isSel = ykSameDay(date, curr);
  var isToday = ykSameDay(date, today);
  var bg = isSel ? '#B5642F' : (hov && !disabled ? 'rgba(34,30,26,.05)' : 'transparent');
  var color = isSel ? '#F8F6F2' : (disabled ? '#bcb3a8' : '#221E1A');
  return (
    <button type="button" disabled={disabled}
      onClick={function(){ if (!disabled) onPick(date); }}
      onMouseEnter={function(){ setHov(true); }} onMouseLeave={function(){ setHov(false); }}
      style={{
        position: 'relative', height: '32px', borderRadius: '8px', border: 'none',
        background: bg, color: color, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'JetBrains Mono', monospace", fontSize: '12.5px', fontWeight: isSel ? 600 : 400,
        fontVariantNumeric: 'tabular-nums', transition: 'background 110ms ease',
        boxShadow: isSel ? '0 1px 3px rgba(181,100,47,.30)' : 'none',
      }}>
      {date.getDate()}
      {isToday && !isSel && (
        <span style={{ position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', width: '3px', height: '3px', borderRadius: '50%', background: '#B5642F' }} />
      )}
    </button>
  );
}
