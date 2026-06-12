// Yukti — Voussoir keystone mark
// Frozen geometry from R10. Single-colour copper is the default.
// Two-tone (copper key + ink haunches) is expressive/hero only.

var VKEY = "M13 7.4L19 7.4L21.2 16.6L10.8 16.6Z";   /* keystone — projects above haunches */
var VHL  = "M4.2 15.9L10.6 17.0L12.5 25.1L6.4 25.1Z";  /* left haunch  */
var VHR  = "M27.8 15.9L21.4 17.0L19.5 25.1L25.6 25.1Z"; /* right haunch */

var YUKTIMARK_PALETTE = {
  copper:   { key: '#B5642F', haunch: '#B5642F' },
  copperLt: { key: '#D9894C', haunch: '#D9894C' },
  ink:      { key: '#221E1A', haunch: '#221E1A' },
  white:    { key: '#F3EEE6', haunch: '#F3EEE6' },
  twoTone:  { key: '#B5642F', haunch: '#221E1A' },
};

export function YuktiMark(props) {
  var size      = props.size      != null ? props.size      : 32;
  var variant   = props.variant   != null ? props.variant   : 'copper';
  var ariaLabel = props.ariaLabel != null ? props.ariaLabel : 'Yukti';

  var c = YUKTIMARK_PALETTE[variant] || YUKTIMARK_PALETTE.copper;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
    >
      <path fill={c.haunch} d={VHL} />
      <path fill={c.haunch} d={VHR} />
      <path fill={c.key}    d={VKEY} />
    </svg>
  );
}


