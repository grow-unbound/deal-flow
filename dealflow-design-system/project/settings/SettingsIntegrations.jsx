// settings/SettingsIntegrations.jsx

function SettingsIntegrations() {
  const { useState } = React;
  const [view, setView]       = useState('catalog');   // catalog | detail | wizard
  const [selId, setSelId]     = useState(null);
  const [step, setStep]       = useState(1);
  const [creds, setCreds]     = useState({ client_id: '', client_secret: '', refresh_token: '', org_id: '' });
  const [testSt, setTestSt]   = useState(null);        // null | testing | success | error
  const [helpOpen, setHelpOpen] = useState({});

  const INTEGRATIONS = [
    { id: 'zoho_books',    name: 'Zoho Books',       desc: 'Sync orders and invoices with your Zoho Books account.',                       logo: 'ZB', logoBg: '#E8F5E9', logoFg: '#1B5E20', status: 'connected', lastSync: '2 hours ago',    mode: 'cloud'                    },
    { id: 'zoho_inv',      name: 'Zoho Inventory',   desc: 'Keep products and stock levels in sync with Zoho Inventory.',                  logo: 'ZI', logoBg: '#E3F2FD', logoFg: '#0D47A1', status: 'not_setup',  lastSync: null,               mode: 'cloud'                    },
    { id: 'tally_prime',   name: 'Tally Prime',      desc: 'Export data to Tally Prime on your local machine via the DealFlow Bridge Agent.', logo: 'TP', logoBg: '#FFF8E1', logoFg: '#E65100', status: 'not_setup',  lastSync: null,               mode: 'local', bridge: true     },
    { id: 'busy',          name: 'Busy Accounting',  desc: 'Connect Busy for accounting sync. Coming soon.',                               logo: 'BA', logoBg: '#FCE4EC', logoFg: '#880E4F', status: 'coming_soon', lastSync: null,               mode: 'local', comingSoon: true },
  ];

  const ZOHO_FIELDS = [
    { key: 'client_id',     label: 'Client ID',       type: 'text',     required: true,  help: 'Open Zoho API Console → Self Client → click View. Copy the "Client ID" value.' },
    { key: 'client_secret', label: 'Client Secret',   type: 'password', required: true,  help: 'Found right next to the Client ID in the Zoho API Console.' },
    { key: 'refresh_token', label: 'Refresh Token',   type: 'password', required: true,  help: 'Generate this at Zoho OAuth Playground. Choose scope: ZohoInventory.fullaccess.all' },
    { key: 'org_id',        label: 'Organisation ID', type: 'text',     required: true,  help: 'In Zoho Inventory: Settings → Organisation Profile. Look for "Organisation ID".' },
  ];

  function testConnection() {
    setTestSt('testing');
    setTimeout(() => setTestSt('success'), 1800);
  }

  function openWizard(id) {
    setSelId(id); setStep(1); setTestSt(null);
    setCreds({ client_id: '', client_secret: '', refresh_token: '', org_id: '' });
    setHelpOpen({}); setView('wizard');
  }

  const allCredsSet = Object.values(creds).every(v => v.trim().length > 0);

  /* ── Catalog view ─────────────────────────────────────── */
  if (view === 'catalog') return (
    <div style={{ maxWidth: 820 }}>
      <div className="settings-page-header">
        <h1 className="settings-page-title">Integrations</h1>
        <p className="settings-page-sub">Connect DealFlow to your accounting and inventory software.</p>
      </div>
      <div className="integration-grid">
        {INTEGRATIONS.map(intg => (
          <div key={intg.id}
            className={`integration-card${intg.status === 'connected' ? ' integration-card--connected' : ''}${!intg.comingSoon ? ' integration-card--clickable' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div className="integration-logo" style={{ background: intg.logoBg }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: intg.logoFg, fontFamily: 'var(--font-body)' }}>{intg.logo}</span>
              </div>
              {intg.status === 'connected' && (
                <span className="int-status-connected">
                  <span className="int-status-dot" style={{ background: 'var(--success-500)' }} />
                  Connected
                </span>
              )}
              {intg.comingSoon && (
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: 'var(--cream-200)', color: 'var(--cream-600)', border: '1px solid var(--cream-300)' }}>Coming soon</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cream-900)', marginBottom: 4 }}>{intg.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--cream-700)', lineHeight: 1.45 }}>{intg.desc}</div>
              {intg.bridge && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7, fontSize: 12, color: 'var(--warning-700)' }}>
                  <SI name="download" size={12} color="var(--warning-600)" />
                  Requires Bridge Agent (desktop install)
                </div>
              )}
              {intg.lastSync && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--cream-600)' }}>Last sync: {intg.lastSync}</div>
              )}
            </div>
            {!intg.comingSoon && (
              intg.status === 'connected'
                ? <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => { setSelId(intg.id); setView('detail'); }}>Manage →</button>
                : <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => openWizard(intg.id)}>Connect →</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Detail view ──────────────────────────────────────── */
  if (view === 'detail') return (
    <div style={{ maxWidth: 780 }}>
      <button onClick={() => setView('catalog')} className="btn btn-ghost btn-sm" style={{ marginBottom: 20, paddingLeft: 6 }}>
        <SI name="arrowLeft" size={14} /> Integrations
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div className="integration-logo" style={{ width: 48, height: 48, borderRadius: 12, background: '#E8F5E9', fontSize: 13 }}>
          <span style={{ fontWeight: 800, color: '#1B5E20' }}>ZB</span>
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="settings-page-title" style={{ margin: '0 0 4px' }}>Zoho Books</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span className="int-status-connected"><span className="int-status-dot" style={{ background: 'var(--success-500)' }} />Connected</span>
            <span style={{ color: 'var(--cream-400)' }}>·</span>
            <span style={{ color: 'var(--cream-600)' }}>Connected Jun 2, 2025</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm"><SI name="refresh" size={13} /> Sync now</button>
          <button className="btn btn-ghost btn-sm">Reconnect</button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-500)' }}>Disconnect</button>
        </div>
      </div>

      {/* Import summary */}
      <SCard title="Initial import" subtitle="Completed Jun 2, 2025 · 1,691 records imported">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['Brands',42],['Products',1240],['Customers',89],['Orders',318],['Invoices',2]].map(([label, val]) => (
            <div key={label} style={{ textAlign: 'center', padding: '10px 18px', background: 'var(--cream-50)', border: '1px solid var(--cream-300)', borderRadius: 10, flex: '1 1 80px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--cream-900)', lineHeight: 1.1 }}>{val.toLocaleString()}</div>
              <div style={{ fontSize: 10.5, color: 'var(--cream-600)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>
      </SCard>

      {/* Data flows */}
      <SCard title="Data flows" subtitle="Which data syncs, in which direction, and how often."
        footer={<><div style={{flex:1}}/><button className="btn btn-secondary btn-sm"><SI name="plus" size={13}/> Add flow</button></>}>
        <div style={{ margin: '-18px -20px', borderTop: '1px solid var(--cream-200)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--cream-50)' }}>
                {['What','Direction','When','Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontWeight: 600, fontSize: '10.5px', letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--cream-700)', borderBottom: '1px solid var(--cream-300)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Products',  '← From Zoho',  'Daily at 2:00 AM',   true ],
                ['Customers', '← From Zoho',  'Daily at 2:00 AM',   true ],
                ['Orders',    '→ To Zoho',     'On status change',   true ],
                ['Invoices',  '← From Zoho',  'On webhook',         true ],
              ].map(([ent, dir, when, active], i) => (
                <tr key={i} style={{ borderBottom: i < 3 ? '1px solid var(--cream-200)' : 'none' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{ent}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: dir.startsWith('←') ? 'var(--teal-600)' : 'var(--ember-600)' }}>{dir}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--cream-700)', fontSize: 12.5 }}>{when}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--success-700)', fontWeight: 500 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success-500)' }} />Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SCard>

      {/* Sync history */}
      <SCard title="Sync history" subtitle="Last 10 runs">
        {[
          ['Today 14:22',   'Incremental',    128,   true],
          ['Today 08:00',   'Incremental',    34,    true],
          ['Yesterday',     'Incremental',    56,    true],
          ['Jun 2, 2025',   'Initial import', 1691,  true],
        ].map(([time, type, records, ok], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: i < 3 ? '1px solid var(--cream-200)' : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--success-500)' : 'var(--danger-500)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream-900)' }}>{time}</div>
              <div style={{ fontSize: 11.5, color: 'var(--cream-600)', marginTop: 1 }}>{type}</div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cream-700)' }}>{records.toLocaleString()} records</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: ok ? 'var(--success-600)' : 'var(--danger-600)' }}>{ok ? 'Completed' : 'Failed'}</span>
          </div>
        ))}
      </SCard>
    </div>
  );

  /* ── Wizard view ──────────────────────────────────────── */
  const STEPS = ["What you'll get", 'Connect', 'Test connection', 'Start import'];
  return (
    <div style={{ maxWidth: 680 }}>
      <button onClick={() => setView('catalog')} className="btn btn-ghost btn-sm" style={{ marginBottom: 22, paddingLeft: 6 }}>
        <SI name="arrowLeft" size={14} /> Integrations
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div className="integration-logo" style={{ width: 44, height: 44, borderRadius: 12, background: '#E3F2FD', fontSize: 12 }}>
          <span style={{ fontWeight: 800, color: '#0D47A1' }}>ZI</span>
        </div>
        <h1 className="settings-page-title" style={{ margin: 0 }}>Connect Zoho Inventory</h1>
      </div>

      {/* Steps */}
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <div className={`wizard-step-num${i + 1 < step ? ' wizard-step-num--done' : i + 1 === step ? ' wizard-step-num--active' : ''}`}>
                {i + 1 < step ? <SI name="check" size={12} color="#fff" stroke={2.5} /> : i + 1}
              </div>
              <span className={`wizard-step-label${i + 1 === step ? ' wizard-step-label--active' : ''}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="wizard-step-line" />}
          </React.Fragment>
        ))}
      </div>

      <div className="s-card">
        {/* Step 1 */}
        {step === 1 && (<>
          <div className="s-card-head"><div className="s-card-title">What gets imported from Zoho Inventory</div><div className="s-card-sub">One-time import. Ongoing sync is set up after connection.</div></div>
          <div className="s-card-body">
            {[['layers','Brands','All your product brands','&lt; 1 min'],['package','Products','Full catalog with SKUs, pricing, stock','2–5 mins'],['users','Customers','Buyer list with contact details','&lt; 1 min'],['fileText','Last 90 days of orders','Order history for deduplication','1–3 mins']].map(([icon, label, desc, time], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: i < 3 ? '1px solid var(--cream-200)' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--teal-50)', color: 'var(--teal-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SI name={icon} size={16} stroke={1.5} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--cream-900)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--cream-700)', marginTop: 1 }}>{desc}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--cream-600)', background: 'var(--cream-100)', padding: '3px 10px', borderRadius: 999, border: '1px solid var(--cream-300)', whiteSpace: 'nowrap' }}>{time}</span>
              </div>
            ))}
          </div>
          <div className="s-card-foot">
            <InfoBanner>Nothing is written to Zoho during setup. This is read-only import.</InfoBanner>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={() => setStep(2)}>Continue <SI name="arrowRight" size={14} color="#fff" /></button>
          </div>
        </>)}

        {/* Step 2 */}
        {step === 2 && (<>
          <div className="s-card-head"><div className="s-card-title">Enter your Zoho API credentials</div><div className="s-card-sub">You'll need these from the Zoho API Console. Click "Where do I find this?" for help.</div></div>
          <div className="s-card-body">
            {ZOHO_FIELDS.map(f => (
              <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="field-label">{f.label}{f.required && <span style={{ color: 'var(--ember-400)', marginLeft: 2 }}>*</span>}</label>
                  <button onClick={() => setHelpOpen({ ...helpOpen, [f.key]: !helpOpen[f.key] })}
                    style={{ fontSize: 12, color: 'var(--teal-500)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                    Where do I find this? <SI name={helpOpen[f.key] ? 'chevronUp' : 'chevronDown'} size={12} />
                  </button>
                </div>
                {helpOpen[f.key] && (
                  <div style={{ padding: '10px 12px', background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 8, fontSize: 12.5, color: 'var(--teal-700)', lineHeight: 1.5, marginBottom: 2 }}>
                    {f.help}
                  </div>
                )}
                <input className="field-input" type={f.type} value={creds[f.key]}
                  onChange={e => setCreds({ ...creds, [f.key]: e.target.value })}
                  placeholder={f.type === 'password' ? '••••••••••••' : ''} />
              </div>
            ))}
          </div>
          <div className="s-card-foot">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={!allCredsSet} onClick={() => setStep(3)}>Test connection</button>
          </div>
        </>)}

        {/* Step 3 */}
        {step === 3 && (<>
          <div className="s-card-head"><div className="s-card-title">Testing your connection</div><div className="s-card-sub">We verify your credentials work before importing anything.</div></div>
          <div className="s-card-body" style={{ alignItems: 'center', padding: '36px 20px', minHeight: 220, justifyContent: 'center' }}>
            {!testSt && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--cream-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SI name="link" size={24} color="var(--cream-500)" />
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--cream-700)', margin: 0 }}>Ready to verify your credentials with Zoho.</p>
                <button className="btn btn-primary" onClick={testConnection}>Test connection</button>
              </div>
            )}
            {testSt === 'testing' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--teal-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SI name="refresh" size={24} color="var(--teal-500)" />
                </div>
                <p style={{ color: 'var(--cream-700)', fontSize: 13.5, margin: 0 }}>Connecting to Zoho Inventory…</p>
              </div>
            )}
            {testSt === 'success' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--success-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SI name="checkCircle" size={28} color="var(--success-500)" />
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--cream-900)' }}>Connected!</div>
                <div style={{ padding: '12px 18px', background: 'var(--cream-50)', border: '1px solid var(--cream-300)', borderRadius: 10, textAlign: 'left', minWidth: 260 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--cream-600)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 600, marginBottom: 6 }}>Organisation found</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cream-900)', marginBottom: 3 }}>WineYard CCTV Pvt Ltd</div>
                  <div style={{ fontSize: 12, color: 'var(--cream-700)' }}>1,240 products · 89 customers</div>
                </div>
              </div>
            )}
          </div>
          <div className="s-card-foot">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={testSt !== 'success'} onClick={() => setStep(4)}>Continue</button>
          </div>
        </>)}

        {/* Step 4 */}
        {step === 4 && (<>
          <div className="s-card-head"><div className="s-card-title">Ready to import</div><div className="s-card-sub">Review what will be imported, then kick it off. DealFlow keeps working while this runs.</div></div>
          <div className="s-card-body">
            <div style={{ background: 'var(--cream-50)', border: '1px solid var(--cream-300)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['All brands','~42'],['All products','~1,240'],['All customers','~89']].map(([label, count], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--cream-200)' }}>
                  <span style={{ fontSize: 13, color: 'var(--cream-800)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--cream-900)' }}>{count}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--cream-800)' }}>Orders since</span>
                <input type="date" className="field-input" style={{ width: 150, padding: '5px 8px', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}
                  defaultValue={new Date(Date.now() - 90 * 864e5).toISOString().split('T')[0]} />
              </div>
            </div>
            <InfoBanner>Import runs in the background. Estimated time: 3–6 minutes. You'll be notified when it's done.</InfoBanner>
          </div>
          <div className="s-card-foot">
            <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={() => { setSelId('zoho_inv'); setView('detail'); }}>
              <SI name="zap" size={14} color="#fff" /> Start import
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}
window.SettingsIntegrations = SettingsIntegrations;
