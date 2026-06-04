// dialogs/shared.jsx — Lucide-style icon set + tiny primitives used across all examples.

const Icon = ({ name, size = 16, stroke = 1.5, color = 'currentColor', style }) => {
  const paths = {
    x: <path d="M18 6L6 18M6 6l12 12" />,
    check: <path d="M20 6L9 17l-5-5" />,
    chevronRight: <path d="M9 18l6-6-6-6" />,
    chevronLeft: <path d="M15 18l-6-6 6-6" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </>
    ),
    alertTriangle: (
      <>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    sparkle: <path d="M12 3l1.9 5.8H20l-4.95 3.6L17 18l-5-3.6L7 18l1.95-5.6L4 8.8h6.1z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrowRight: <path d="M5 12h14M13 5l7 7-7 7" />,
    user: (
      <>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    users: (
      <>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </>
    ),
    mail: (
      <>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <path d="M22 6l-10 7L2 6" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      </>
    ),
    archive: (
      <>
        <rect x="2" y="3" width="20" height="5" rx="1" />
        <path d="M4 8v12a2 2 0 002 2h12a2 2 0 002-2V8" />
        <path d="M10 12h4" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </>
    ),
    layers: (
      <>
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </>
    ),
    layoutGrid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    panelRight: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M15 3v18" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
        <path d="M1 14h6M9 8h6M17 16h6" />
      </>
    ),
    moreVertical: (
      <>
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="19" r="1" />
      </>
    ),
    package: (
      <>
        <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
      </>
    ),
    fileText: (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </>
    ),
    ticket: (
      <>
        <path d="M3 9a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 100-4V9z" />
        <path d="M13 5v14" strokeDasharray="2 2" />
      </>
    ),
    barChart: (
      <>
        <path d="M12 20V10M18 20V4M6 20v-4" />
      </>
    ),
    chevronsRight: <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />,
  };

  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

/* ───────────────────────────────────────────────────────────
   Fake-cockpit page chrome (sidebar nav, topbar) used to
   place modal/slide-over examples in plausible context.
   ─────────────────────────────────────────────────────────── */
function FakeCockpit({ section = 'Brands', dimmed = false }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      filter: dimmed ? 'blur(1.5px) brightness(0.96)' : 'none',
    }}>
      <div style={{
        background: 'var(--cream-50)',
        borderRight: '1px solid var(--cream-300)',
        padding: '18px 12px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 6px 14px',
          borderBottom: '1px solid var(--cream-300)',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'var(--teal-500)', color: 'var(--cream-50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 500,
          }}>DF</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 500 }}>DealFlow</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 12 }}>
          {[
            { i: 'barChart', label: 'Dashboard' },
            { i: 'layers', label: 'Brands' },
            { i: 'package', label: 'Products' },
            { i: 'users', label: 'Customers' },
            { i: 'ticket', label: 'Catalogs' },
            { i: 'fileText', label: 'Pricelists' },
            { i: 'layoutGrid', label: 'Cohorts' },
          ].map(item => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px',
              borderRadius: 8,
              background: section === item.label ? 'var(--teal-500)' : 'transparent',
              color: section === item.label ? 'var(--cream-50)' : 'var(--cream-800)',
              fontSize: 13, fontWeight: 500,
            }}>
              <Icon name={item.i} size={15} stroke={1.5} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          height: 56,
          borderBottom: '1px solid var(--cream-300)',
          background: 'rgba(250, 247, 242, 0.85)',
          padding: '0 24px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px',
            background: '#fff',
            border: '1px solid var(--cream-300)',
            borderRadius: 8,
            color: 'var(--cream-600)',
            fontSize: 13,
            width: 280,
          }}>
            <Icon name="search" size={14} />
            <span>Search brands, products, orders…</span>
          </div>
          <div style={{ flex: 1 }}></div>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--ember-100)', color: 'var(--ember-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600,
            border: '1px solid var(--ember-200)',
          }}>PR</div>
        </div>
        <div style={{ padding: 24, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: 'var(--cream-900)' }}>
            {section}
          </div>
          <div style={{ color: 'var(--cream-700)', fontSize: 13, marginTop: 6 }}>
            {section === 'Brands' && '5 brands · 482 SKUs across portfolio'}
            {section === 'Customers' && '124 buyers · 78 active this month'}
            {section === 'Settings' && 'Team · Tally · Notifications'}
          </div>
          {/* fake list rows */}
          <div style={{
            marginTop: 18,
            background: '#fff',
            border: '1px solid var(--cream-300)',
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            {(section === 'Brands'
              ? ['Vinikus Estates', 'Casa del Sol', 'Marwadi Spice Co.', 'Asha Tea Garden', 'Konkan Cellars']
              : section === 'Customers'
              ? ['Bharat Stores · Karol Bagh', 'Gupta Wines · CR Park', 'Sehgal & Sons · Greater Kailash', 'Patel Provisions · Janakpuri', 'Singh Liquor Mart · Pitampura']
              : ['Phani Raju · admin@dealflow.in', 'Anita Sharma · anita@dealflow.in', 'Ravi Kapoor · ravi@dealflow.in']
            ).map((row, i) => (
              <div key={i} style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--cream-300)',
                fontSize: 13.5,
                color: 'var(--cream-900)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div className={`b-av b-av--${['teal','ember','cream'][i % 3]}`} style={{ width: 28, height: 28, borderRadius: 6, fontSize: 10 }}>
                  {row.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div>{row}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Inline label + value (for confirm modals) */
function MetaRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--cream-700)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--cream-900)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

Object.assign(window, { Icon, FakeCockpit, MetaRow });
