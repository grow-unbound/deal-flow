export function ProductCard(props) {
  var name         = props.name;
  var brand        = props.brand;
  var sku          = props.sku;
  var price        = props.price;
  var mrp          = props.mrp;
  var uom          = props.uom;
  var imageUrl     = props.imageUrl;
  var availability = props.availability != null ? props.availability : 'available';
  var isNew        = props.isNew        != null ? props.isNew        : false;
  var onAddToCart  = props.onAddToCart;
  var onClick      = props.onClick;

  var isOOS     = availability === 'out-of-stock';
  var isLimited = availability === 'limited';

  function AvailBadge() {
    if (isLimited) return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', fontWeight: 500, letterSpacing: '.07em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: '99px', border: '1px solid rgba(138,87,0,.22)', background: 'rgba(138,87,0,.10)', color: '#8A5700', whiteSpace: 'nowrap' }}>
        <svg width="6" height="6" viewBox="0 0 6 6" fill="none"><path d="M3 0.5L5.6 5H0.4Z" fill="#8A5700"/></svg>
        Low stock
      </span>
    );
    if (isOOS) return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', fontWeight: 500, letterSpacing: '.07em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: '99px', border: '1px solid rgba(100,89,78,.18)', background: 'rgba(100,89,78,.08)', color: '#64594E', whiteSpace: 'nowrap' }}>
        <svg width="6" height="6" viewBox="0 0 6 6" fill="none"><rect x="0.5" y="0.5" width="5" height="5" rx="1" stroke="#64594E" strokeWidth="1"/></svg>
        Out of stock
      </span>
    );
    return null;
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FCFBF8', border: '1px solid #EAE3D9', borderRadius: '12px',
        overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
        opacity: isOOS ? 0.72 : 1,
        fontFamily: "'Mukta', sans-serif", WebkitFontSmoothing: 'antialiased',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Image area */}
      <div style={{ height: '120px', background: 'rgba(181,100,47,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {imageUrl
          ? <img src={imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ opacity: 0.35 }}>
              <rect x="10" y="6" width="24" height="32" rx="4" fill="#B5642F"/>
              <rect x="14" y="12" width="16" height="10" rx="2" fill="#F8F6F2" opacity=".7"/>
              <rect x="14" y="28" width="10" height="4" rx="2" fill="#F8F6F2" opacity=".5"/>
            </svg>
          )
        }
        {isNew && (
          <span style={{ position: 'absolute', top: '8px', left: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', fontWeight: 500, letterSpacing: '.07em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: '99px', border: '1px solid rgba(181,100,47,.22)', background: 'rgba(181,100,47,.14)', color: '#6a3d18' }}>
            <svg width="6" height="6" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" fill="#B5642F"/></svg>
            New
          </span>
        )}
        {!isNew && <div style={{ position: 'absolute', bottom: '8px', left: '8px' }}><AvailBadge /></div>}
      </div>

      {/* Content */}
      <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {(brand || sku) && (
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10.5px', color: '#6F665C', letterSpacing: '.04em' }}>
            {brand}{brand && sku ? ' · ' : ''}{sku}
          </div>
        )}
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#221E1A', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '16px', fontWeight: 500, color: isOOS ? '#6F665C' : '#221E1A', fontVariantNumeric: 'tabular-nums' }}>
            ₹ {price}
          </span>
          {mrp && mrp !== price && (
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#6F665C', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
              ₹ {mrp}
            </span>
          )}
        </div>
        {uom && <div style={{ fontSize: '11.5px', color: '#64594E', letterSpacing: '-.005em' }}>{uom}</div>}
        {onAddToCart && (
          <button
            onClick={function(e) { e.stopPropagation(); if (onAddToCart) onAddToCart(); }}
            disabled={isOOS}
            style={{
              width: '100%', marginTop: '10px', height: '36px', borderRadius: '9px',
              background: isOOS ? '#EAE3D9' : '#B5642F',
              color: isOOS ? '#6F665C' : '#F8F6F2',
              border: 'none', fontFamily: "'Mukta', sans-serif",
              fontSize: '13px', fontWeight: 600, cursor: isOOS ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.01em',
            }}
          >
            {isOOS ? 'Out of stock' : 'Add to cart'}
          </button>
        )}
      </div>
    </div>
  );
}
