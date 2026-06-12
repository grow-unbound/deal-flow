// EmptyState — structural keystone-inspired SVG illustrations.
// Avoid ledgers, coins, compliance imagery (brand brief §10).

function EmptyIllustration(props) {
  var kind = props.kind;
  var cu   = '#B5642F';
  var cf   = 'rgba(181,100,47,.18)';
  var ln   = '#EAE3D9';
  var bg   = 'rgba(234,227,217,.35)';

  if (kind === 'orders') return (
    <svg width="100" height="76" viewBox="0 0 100 76" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="18" width="84" height="50" rx="5" fill={bg} stroke={ln}/>
      <rect x="18" y="28" width="30" height="12" rx="3" fill={cf} stroke={ln}/>
      <rect x="18" y="44" width="22" height="6" rx="2" fill={ln}/>
      <rect x="18" y="54" width="34" height="4" rx="2" fill={ln}/>
      <rect x="54" y="26" width="30" height="34" rx="3" fill={cf} stroke={ln}/>
      <path d="M61 34L65.5 34L67 40.5L59 40.5Z" fill={cu} opacity=".5"/>
      <path d="M55 40L59.5 40.8L61 47L56 47Z" fill={cu} opacity=".3"/>
      <path d="M71 40L66.5 40.8L65 47L70 47Z" fill={cu} opacity=".3"/>
    </svg>
  );

  if (kind === 'catalog') return (
    <svg width="100" height="76" viewBox="0 0 100 76" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="36" height="52" rx="4" fill={bg} stroke={ln}/>
      <rect x="16" y="18" width="24" height="18" rx="2" fill={cf} stroke={ln}/>
      <rect x="16" y="40" width="16" height="4" rx="2" fill={ln}/>
      <rect x="16" y="48" width="22" height="4" rx="2" fill={ln}/>
      <rect x="54" y="16" width="34" height="46" rx="4" fill={bg} stroke={ln}/>
      <rect x="60" y="24" width="22" height="18" rx="2" fill={cf} stroke={ln}/>
      <path d="M68 26L72.5 26L73.8 32L66.2 32Z" fill={cu} opacity=".6"/>
      <rect x="60" y="46" width="14" height="4" rx="2" fill={cu} opacity=".4"/>
      <rect x="60" y="54" width="20" height="4" rx="2" fill={ln}/>
    </svg>
  );

  if (kind === 'buyers') return (
    <svg width="100" height="76" viewBox="0 0 100 76" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="36" cy="28" r="14" fill={cf} stroke={ln}/>
      <circle cx="36" cy="23" r="7"  fill={cu} opacity=".35"/>
      <path d="M16 60C16 49.5 25 42 36 42C47 42 56 49.5 56 60" stroke={cu} strokeWidth="2" strokeLinecap="round" opacity=".4"/>
      <circle cx="68" cy="28" r="10" fill={bg} stroke={ln}/>
      <circle cx="68" cy="24" r="5"  fill={cu} opacity=".2"/>
      <path d="M54 56C54 48.3 60 43 68 43C76 43 82 48.3 82 56" stroke={ln} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );

  if (kind === 'search') return (
    <svg width="100" height="76" viewBox="0 0 100 76" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="42" cy="36" r="22" stroke={ln} strokeWidth="2" fill={bg}/>
      <circle cx="42" cy="36" r="14" fill={cf}/>
      <path d="M39 30L45 30L46.5 37.5L37.5 37.5Z" fill={cu} opacity=".5"/>
      <line x1="59" y1="53" x2="72" y2="66" stroke={ln} strokeWidth="3" strokeLinecap="round"/>
      <line x1="30" y1="42" x2="26" y2="46" stroke={ln} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );

  // generic — arch / keystone structure
  return (
    <svg width="100" height="76" viewBox="0 0 100 76" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 60L20 38C20 26 30 18 50 18C70 18 80 26 80 38L80 60" stroke={ln} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <rect x="13" y="58" width="74" height="10" rx="4" fill={bg} stroke={ln}/>
      <path d="M39 17.5L61 17.5L64.5 32L35.5 32Z" fill={cu} opacity=".3"/>
      <path d="M20 34L35.5 36.8L39 50L22 50Z" fill={cu} opacity=".15"/>
      <path d="M80 34L64.5 36.8L61 50L78 50Z" fill={cu} opacity=".15"/>
    </svg>
  );
}

export function EmptyState(props) {
  var kind         = props.kind         != null ? props.kind         : 'generic';
  var title        = props.title;
  var body         = props.body;
  var action       = props.action;
  var illustration = props.illustration;

  var wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    padding: '48px 32px',
    textAlign: 'center',
    fontFamily: "'Mukta', sans-serif",
    WebkitFontSmoothing: 'antialiased',
  };

  return (
    <div style={wrapStyle}>
      <div style={{ marginBottom: '4px' }}>
        {illustration || <EmptyIllustration kind={kind} />}
      </div>
      {title && (
        <p style={{ margin: 0, fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em', color: '#221E1A', lineHeight: 1.3 }}>
          {title}
        </p>
      )}
      {body && (
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: '#64594E', maxWidth: '300px' }}>
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: '6px' }}>{action}</div>}
    </div>
  );
}


