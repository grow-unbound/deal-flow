var CARD_PADDING = {
  none: '0',
  sm:   '14px 16px',
  md:   '24px 26px',
  lg:   '32px 36px',
};

export function Card(props) {
  var children  = props.children;
  var padding   = props.padding   != null ? props.padding   : 'md';
  var bordered  = props.bordered  != null ? props.bordered  : true;
  var elevated  = props.elevated  != null ? props.elevated  : false;
  var dark      = props.dark      != null ? props.dark      : false;
  var onClick   = props.onClick;
  var extStyle  = props.style;
  var role      = props.role;

  var bg      = dark ? '#2B2825' : '#FCFBF8';
  var border  = dark ? 'rgba(255,255,255,.08)' : '#EAE3D9';

  var style = Object.assign({
    background:   bg,
    border:       bordered ? '1px solid ' + border : 'none',
    borderRadius: '14px',
    padding:      CARD_PADDING[padding] || CARD_PADDING.md,
    boxShadow:    elevated ? '0 4px 14px rgba(34,30,26,.10), 0 2px 4px rgba(34,30,26,.06)' : undefined,
    cursor:       onClick ? 'pointer' : undefined,
    transition:   onClick ? 'box-shadow 120ms ease' : undefined,
    fontFamily:   "'Mukta', sans-serif",
    color:        dark ? '#F3EEE6' : '#221E1A',
  }, extStyle);

  return (
    <div style={style} onClick={onClick} role={role}>
      {children}
    </div>
  );
}


