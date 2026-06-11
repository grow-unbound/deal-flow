// settings/SettingsTeam.jsx

function SettingsTeam() {
  const { useState } = React;
  const [users, setUsers] = useState([
    { id: 1, name: 'Phani Raju',    email: 'phani@wineyard.in',  role: 'seller_admin',     status: 'active',  lastLogin: '2 hours ago' },
    { id: 2, name: 'Anita Sharma',  email: 'anita@wineyard.in',  role: 'seller_assistant', status: 'active',  lastLogin: 'Yesterday' },
    { id: 3, name: 'Ravi Kapoor',   email: 'ravi@wineyard.in',   role: 'seller_assistant', status: 'invited', lastLogin: '—' },
  ]);
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail]     = useState('');
  const [invRole,  setInvRole]      = useState('seller_assistant');

  function sendInvite() {
    if (!invEmail) return;
    const name = invEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    setUsers([...users, { id: Date.now(), name, email: invEmail, role: invRole, status: 'invited', lastLogin: '—' }]);
    setInvEmail(''); setShowInvite(false);
  }

  const RolePill = ({ role }) => (
    <span style={{
      display: 'inline-flex', padding: '2px 9px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      background: role === 'seller_admin' ? 'var(--ember-50)' : 'var(--cream-100)',
      color:      role === 'seller_admin' ? 'var(--ember-700)' : 'var(--cream-700)',
      border:     role === 'seller_admin' ? '1px solid var(--ember-100)' : '1px solid var(--cream-300)',
    }}>
      {role === 'seller_admin' ? 'Admin' : 'Assistant'}
    </span>
  );

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="settings-page-header">
        <h1 className="settings-page-title">Team</h1>
        <p className="settings-page-sub">Manage who has access to your DealFlow account and what they can do.</p>
      </div>

      {/* ── Team table ── */}
      <div className="s-card" style={{ marginBottom: 18 }}>
        {/* toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--cream-50)', borderBottom: '1px solid var(--cream-300)', borderRadius: '14px 14px 0 0' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--cream-900)' }}>
            Team members
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--cream-600)', marginLeft: 8 }}>{users.length}</span>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
            <SI name="plus" size={13} color="#fff" /> Invite member
          </button>
        </div>

        <table className="dp-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th style={{ width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {/* Inline invite row */}
            {showInvite && (
              <tr>
                <td colSpan={2}>
                  <input autoFocus className="field-input" type="email" placeholder="colleague@yourcompany.in"
                    value={invEmail} onChange={e => setInvEmail(e.target.value)}
                    style={{ width: '100%' }}
                    onKeyDown={e => e.key === 'Enter' && sendInvite()} />
                </td>
                <td>
                  <select className="field-select" value={invRole} onChange={e => setInvRole(e.target.value)}>
                    <option value="seller_assistant">Assistant — basic access</option>
                    <option value="seller_admin">Admin — full access</option>
                  </select>
                </td>
                <td colSpan={2} />
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowInvite(false); setInvEmail(''); }}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={sendInvite}>Send</button>
                  </div>
                </td>
              </tr>
            )}

            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SAv name={u.name} size={30} />
                    <span style={{ fontWeight: 500, color: 'var(--cream-900)' }}>{u.name}</span>
                  </div>
                </td>
                <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--cream-700)' }}>{u.email}</span></td>
                <td><RolePill role={u.role} /></td>
                <td><StatusPill status={u.status} /></td>
                <td style={{ fontSize: 13, color: 'var(--cream-600)' }}>{u.lastLogin}</td>
                <td style={{ textAlign: 'right' }}>
                  <IBtn icon="edit" title="Edit role" />
                  <IBtn icon={u.status === 'invited' ? 'mail' : 'moreVert'} title={u.status === 'invited' ? 'Resend invite' : 'More options'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Role capabilities ── */}
      <SCard title="What each role can do" icon="shield"
        subtitle="Roles are account-wide — every user has exactly one role.">
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--cream-300)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--cream-700)', background: 'var(--cream-50)', borderBottom: '1px solid var(--cream-300)' }}>Capability</th>
                <th style={{ textAlign: 'center', width: 120, padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--ember-700)', background: 'var(--ember-50)', borderBottom: '1px solid var(--cream-300)' }}>Admin</th>
                <th style={{ textAlign: 'center', width: 120, padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--cream-700)', background: 'var(--cream-50)', borderBottom: '1px solid var(--cream-300)' }}>Assistant</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Settings & account configuration',       true,  false],
                ['Cost prices and margins',                true,  false],
                ['Cohort and price list management',       true,  false],
                ['Orders, products, customers',            true,  true ],
                ['Catalogs and buyer app',                 true,  true ],
                ['Brands and inventory',                   true,  true ],
              ].map(([cap, admin, asst], i) => (
                <tr key={i} style={{ borderBottom: i < 5 ? '1px solid var(--cream-200)' : 'none' }}>
                  <td style={{ padding: '11px 16px', color: 'var(--cream-800)' }}>{cap}</td>
                  <td style={{ textAlign: 'center', padding: '11px 16px', background: 'rgba(251,239,225,0.25)' }}>
                    {admin ? <SI name="check" size={16} color="var(--success-500)" stroke={2.5} /> : <span style={{ color: 'var(--cream-400)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center', padding: '11px 16px' }}>
                    {asst  ? <SI name="check" size={16} color="var(--success-500)" stroke={2.5} /> : <span style={{ color: 'var(--cream-400)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <InfoBanner>
          There must always be at least one active Admin. You can't deactivate yourself if you're the only admin.
        </InfoBanner>
      </SCard>
    </div>
  );
}
window.SettingsTeam = SettingsTeam;
