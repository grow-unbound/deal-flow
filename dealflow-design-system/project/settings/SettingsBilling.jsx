// settings/SettingsBilling.jsx

function SettingsBilling({ tier = 'starter' }) {
  const { useState } = React;
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [upgradeTo, setUpgradeTo]       = useState(null);
  const [contactName, setContactName]   = useState('Phani Raju');
  const [contactPhone, setContactPhone] = useState('+91 98765 43210');
  const [note, setNote]                 = useState('');
  const [sent, setSent]                 = useState(false);

  const TIERS = {
    starter: { name: 'Starter',  sub: 'Everything you need to get started.', cohorts: 5,        lists: 2,        catalogs: 3        },
    growth:  { name: 'Growth',   sub: 'Higher limits for growing businesses.', cohorts: 20,       lists: 10,       catalogs: 15       },
    scale:   { name: 'Scale',    sub: 'Unlimited everything for large operations.', cohorts: null, lists: null,     catalogs: null     },
  };
  const USAGE = { cohorts: 3, lists: 2, catalogs: 1, credits: 847, creditTotal: 1000 };
  const T = TIERS[tier];

  const pct  = (u, lim) => lim ? Math.min(100, Math.round(u / lim * 100)) : 0;
  const warn = (u, lim) => lim && u / lim >= 0.80;

  function requestUpgrade() { setSent(true); setTimeout(() => { setUpgradeModal(false); setSent(false); }, 1600); }

  const UsageMeter = ({ label, used, limit }) => (
    <div className="plan-usage-item">
      <div className="plan-usage-label">{label}</div>
      <div className="plan-usage-val">
        {used}
        {limit != null && <span style={{ fontSize: 15, opacity: 0.7 }}> / {limit}</span>}
        {limit == null && <span style={{ fontSize: 15, opacity: 0.6 }}> / ∞</span>}
      </div>
      <div className="plan-usage-bar">
        <div className="plan-usage-bar-fill" style={{
          width: limit ? `${pct(used, limit)}%` : '22%',
          background: (limit && warn(used, limit)) ? '#FCA5A5' : 'rgba(255,255,255,0.55)',
        }} />
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 780 }}>
      <div className="settings-page-header">
        <h1 className="settings-page-title">Billing &amp; Plan</h1>
        <p className="settings-page-sub">Your current plan, usage, and WhatsApp credit balance.</p>
      </div>

      {/* ── Hero plan card ── */}
      <div className="plan-hero">
        <div className="plan-hero-badge">Current plan</div>
        <div className="plan-hero-name">{T.name}</div>
        <div className="plan-hero-sub">{T.sub}</div>
        <div className="plan-usage-grid">
          <UsageMeter label="Cohorts"     used={USAGE.cohorts}   limit={T.cohorts}   />
          <UsageMeter label="Price lists" used={USAGE.lists}     limit={T.lists}     />
          <UsageMeter label="Catalogs"    used={USAGE.catalogs}  limit={T.catalogs}  />
        </div>
      </div>

      {/* Warnings */}
      {tier !== 'scale' && warn(USAGE.lists, T.lists) && (
        <WarnBanner>
          You've used all {T.lists} price lists on your {T.name} plan.{' '}
          {tier === 'starter' && <a href="#" onClick={e => { e.preventDefault(); setUpgradeTo('growth'); setUpgradeModal(true); }} style={{ color: 'var(--warning-700)', fontWeight: 600, textDecoration: 'none' }}>Upgrade to Growth →</a>}
        </WarnBanner>
      )}

      {/* ── WhatsApp Credits ── */}
      <SCard title="WhatsApp Credits" icon="bell"
        subtitle="Used for buyer OTPs and notifications. Each message costs 1 credit.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: 'var(--cream-900)', letterSpacing: '-0.01em' }}>{USAGE.credits.toLocaleString()}</span>
              <span style={{ fontSize: 13, color: 'var(--cream-600)', marginLeft: 6 }}>credits remaining of {USAGE.creditTotal.toLocaleString()} purchased</span>
            </div>
            <div className="usage-bar-track">
              <div className="usage-bar-fill" style={{ width: `${Math.round(USAGE.credits / USAGE.creditTotal * 100)}%` }} />
            </div>
          </div>
          <button className="btn btn-accent">Top up credits</button>
        </div>
        <div style={{ padding: '10px 12px', background: 'var(--cream-50)', border: '1px solid var(--cream-300)', borderRadius: 8, fontSize: 12.5, color: 'var(--cream-700)' }}>
          Credits don't expire. Top up any time from here.
        </div>
      </SCard>

      {/* ── Upgrade nudge ── */}
      {tier === 'starter' && (
        <div className="s-card" style={{ border: '1.5px solid var(--ember-200)', background: 'linear-gradient(135deg, var(--ember-50) 0%, #fff 100%)', marginBottom: 18 }}>
          <div className="s-card-body" style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)', marginBottom: 4 }}>Upgrade to Growth</div>
              <div style={{ fontSize: 13, color: 'var(--cream-700)', lineHeight: 1.55 }}>
                Get 20 cohorts, 10 price lists, and 15 published catalogs. Same features, just higher limits.
              </div>
            </div>
            <button className="btn btn-accent" onClick={() => { setUpgradeTo('growth'); setUpgradeModal(true); }}>
              Upgrade to Growth →
            </button>
          </div>
        </div>
      )}
      {tier === 'growth' && (
        <div className="s-card" style={{ border: '1.5px solid #DDD6FE', background: 'linear-gradient(135deg, #F5F3FF 0%, #fff 100%)', marginBottom: 18 }}>
          <div className="s-card-body" style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)', marginBottom: 4 }}>Upgrade to Scale</div>
              <div style={{ fontSize: 13, color: 'var(--cream-700)', lineHeight: 1.55 }}>
                Unlimited cohorts, price lists, and catalogs — plus AI features and replenishment forecasting (Phase 2).
              </div>
            </div>
            <button style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 500, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => { setUpgradeTo('scale'); setUpgradeModal(true); }}>
              Upgrade to Scale →
            </button>
          </div>
        </div>
      )}

      {/* ── Plan comparison ── */}
      <SCard title="Plan comparison" subtitle="All plans include every feature. Only the limits differ.">
        <div style={{ margin: '-18px -20px', borderTop: '1px solid var(--cream-200)', borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
          <table className="plan-compare">
            <thead>
              <tr>
                <th>Feature</th>
                <th className={tier === 'starter' ? 'is-current' : ''}>Starter</th>
                <th className={tier === 'growth'  ? 'is-current' : ''}>Growth</th>
                <th className={tier === 'scale'   ? 'is-current' : ''}>Scale</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feat: 'All core modules',              s: true,    g: true,    sc: true    },
                { feat: 'Buyer App (WhatsApp OTP)',       s: true,    g: true,    sc: true    },
                { feat: 'Catalog publishing',            s: true,    g: true,    sc: true    },
                { feat: 'Tally &amp; Zoho integrations', s: true,    g: true,    sc: true    },
                { feat: 'Cohort limit',                  s: '5',     g: '20',    sc: 'Unlimited' },
                { feat: 'Price list limit',              s: '2',     g: '10',    sc: 'Unlimited' },
                { feat: 'Published catalog limit',       s: '3',     g: '15',    sc: 'Unlimited' },
                { feat: 'Custom subdomain',              s: false,   g: false,   sc: 'v2'    },
                { feat: 'AI features',                   s: false,   g: false,   sc: true    },
              ].map((row, i) => {
                const Cell = ({ val, cur }) => {
                  const st = cur ? { background: '#F4FAF8' } : {};
                  if (val === true)  return <td style={st} className={cur ? 'is-current' : ''}><SI name="check" size={15} color="var(--success-500)" stroke={2.5} /></td>;
                  if (val === false) return <td style={st} className={cur ? 'is-current' : ''}><span style={{ color: 'var(--cream-400)' }}>—</span></td>;
                  return <td style={st} className={cur ? 'is-current' : ''}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 500 }}>{val}</span></td>;
                };
                return (
                  <tr key={i}>
                    <td dangerouslySetInnerHTML={{ __html: row.feat }} />
                    <Cell val={row.s}  cur={tier === 'starter'} />
                    <Cell val={row.g}  cur={tier === 'growth'}  />
                    <Cell val={row.sc} cur={tier === 'scale'}   />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SCard>

      {/* ── Upgrade modal ── */}
      {upgradeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,26,0.40)', backdropFilter: 'blur(2px)' }} onClick={() => !sent && setUpgradeModal(false)} />
          <div className="modal" style={{ position: 'fixed' }}>
            <div className="modal-head">
              <div className="title-block">
                <div className="ov-eyebrow">Upgrade plan</div>
                <h2 className="ov-title" style={{ fontSize: 20 }}>Upgrade to {upgradeTo === 'growth' ? 'Growth' : 'Scale'}</h2>
                <p className="ov-sub">Our team will be in touch to complete your upgrade — usually within 1 business day.</p>
              </div>
              <button className="ov-close" onClick={() => setUpgradeModal(false)}><SI name="x" size={16} /></button>
            </div>
            <div className="modal-body">
              {sent ? (
                <div style={{ textAlign: 'center', padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--success-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SI name="check" size={22} color="var(--success-500)" stroke={2.5} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--cream-900)' }}>Request sent!</div>
                  <div style={{ fontSize: 13, color: 'var(--cream-700)' }}>We'll reach out to {contactPhone} shortly.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <FRow label="Your name">
                    <input className="field-input" value={contactName} onChange={e => setContactName(e.target.value)} />
                  </FRow>
                  <FRow label="Best number to reach you">
                    <input className="field-input" value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
                  </FRow>
                  <FRow label="Anything you'd like us to know?" hint="Optional">
                    <textarea className="field-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. We need this urgently before month-end…" />
                  </FRow>
                </div>
              )}
            </div>
            {!sent && (
              <div className="modal-foot">
                <div className="spacer" />
                <button className="btn btn-ghost" onClick={() => setUpgradeModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={requestUpgrade}>Send request</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
window.SettingsBilling = SettingsBilling;
